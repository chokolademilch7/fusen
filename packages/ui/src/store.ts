/**
 * The widget's data plane: one shared item list, one shared realtime
 * subscription, and the reconciliation policy between them.
 *
 * That policy is the valuable part of this file and every rule below is load
 * bearing — a subtle regression here is invisible until production:
 *
 *  - Self-echo suppression via client-generated nonces: our own writes are
 *    applied from the HTTP response, and the realtime frame carrying the same
 *    nonce is dropped so nothing double-inserts.
 *  - `deleted` and `status_changed` are handled BEFORE the nonce guard, on
 *    purpose. See the comments at those branches.
 *  - Votes are optimistic and batched behind a debounce; displayed count is
 *    always server-known total PLUS the outstanding local delta, never a blind
 *    overwrite from someone else's frame.
 *  - A delete is only *confirmed* by the realtime frame, so a dropped HTTP
 *    response cannot resurrect a row the server already removed.
 *  - Every (re)connect refetches the snapshot, which self-heals any frame
 *    missed while disconnected.
 *
 * Connection status is intentionally kept OUT of the XState machine (its leaf
 * states are a published contract — see `machine.ts`); it is a plain signal.
 */

import { createSignal } from "solid-js";
import { MAX_VOTE_DELTA } from "@fusen/core";
import type { Anchor, ConnectionStatus, FeedbackFrame, FeedbackItem } from "./types.ts";
import { feedbackRuntime } from "./runtime.ts";

/** Debounce window for batching vote taps into one POST. */
const VOTE_DEBOUNCE_MS = 500;

/**
 * A nonce for self-echo suppression.
 *
 * WHY NOT JUST `crypto.randomUUID()`: that method exists ONLY in a secure
 * context. A page served over plain http from anything but localhost — an
 * internal staging box, a LAN address, a preview host — has `crypto` but NOT
 * `randomUUID`, so the call throws `is not a function` and the submission dies
 * before any request is made. The app this widget came from is https-only, so
 * the bug was invisible there; it appeared the first time the widget was
 * embedded somewhere else (measured on an http preview origin:
 * `isSecureContext: false`, `typeof crypto.randomUUID === "undefined"`).
 *
 * The value is not a security token. It is compared only against nonces this
 * same page just generated, to drop the realtime echo of our own write. Any
 * value unique within one page's lifetime is sufficient, so a fallback that is
 * merely unique — not unpredictable — is the right trade rather than refusing
 * to post at all.
 */
function newNonce(): string {
  const c: Crypto | undefined = globalThis.crypto;
  if (typeof c?.randomUUID === "function") return c.randomUUID();
  // getRandomValues IS available in insecure contexts.
  if (typeof c?.getRandomValues === "function") {
    const bytes = c.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  return `n-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

const [items, setItems] = createSignal<FeedbackItem[]>([]);
const [connection, setConnection] = createSignal<ConnectionStatus>("connecting");
// vote deltas sent-but-not-yet-flushed OR flushed-but-not-yet-acked, keyed by feedback id.
const [outstandingMap, setOutstandingMap] = createSignal<Record<number, number>>({});

/** Nonces of our own in-flight writes (create + vote). Realtime frames carrying
 *  one of these are our own echo and are dropped — the POST response is the
 *  source of truth for our own writes. */
const pendingNonces = new Set<string>();

export function feedbackItems(): FeedbackItem[] {
  return items();
}

export function connectionStatus(): ConnectionStatus {
  return connection();
}

export function outstandingDelta(id: number): number {
  return outstandingMap()[id] ?? 0;
}

/** Displayed vote count = server-known total + not-yet-settled local delta.
 *  Never blindly overwritten by others' `voted` frames. */
export function displayVotes(item: FeedbackItem): number {
  return item.votes + outstandingDelta(item.id);
}

function upsertItem(item: FeedbackItem): void {
  setItems((list) =>
    list.some((it) => it.id === item.id)
      ? list.map((it) => (it.id === item.id ? item : it))
      : [item, ...list],
  );
}

/** Drops any not-yet-settled optimistic vote delta for a removed id, so a
 *  deleted item can't leave a dangling entry behind. */
function clearOutstanding(id: number): void {
  setOutstandingMap((m) => {
    if (!(id in m)) return m;
    const next = { ...m };
    delete next[id];
    return next;
  });
}

export async function loadFeedback(): Promise<void> {
  const res = await feedbackRuntime().http.list();
  setItems(res.feedback);
}

export async function submitFeedback(
  route: string,
  body: string,
  anchor: Anchor,
): Promise<FeedbackItem> {
  const nonce = newNonce();
  pendingNonces.add(nonce);
  // Capture must never block posting. The host's contributor functions are
  // outside this package's control, so the call is defended here even though a
  // well-behaved implementation never throws: a broken probe degrades to a
  // missing snapshot, not a failed submission.
  let context: FeedbackItem["context"] = null;
  try {
    context = feedbackRuntime().captureContext();
  } catch {
    context = null;
  }
  try {
    const res = await feedbackRuntime().http.create(route, body, anchor, context, nonce);
    upsertItem(res.feedback);
    return res.feedback;
  } finally {
    // Removed on both success and failure — a residual pending nonce would
    // block the matching realtime echo forever and desync the next reconnect
    // snapshot reconciliation.
    pendingNonces.delete(nonce);
  }
}

/** In-flight deletes. A `deleted` frame sets `confirmed` — so a delete the
 *  server demonstrably performed is never rolled back merely because the HTTP
 *  response was lost. */
const inflightDeletes = new Map<number, { confirmed: boolean }>();

/** Optimistic delete: removes the item immediately, then issues the DELETE.
 *  On failure the item is restored at its original position and false is
 *  returned; on success true is returned. */
export async function removeFeedback(id: number): Promise<boolean> {
  const before = items();
  const index = before.findIndex((it) => it.id === id);
  const removedItem = index === -1 ? undefined : before[index];
  setItems((list) => list.filter((it) => it.id !== id));

  const nonce = newNonce();
  pendingNonces.add(nonce);
  const inflight = { confirmed: false };
  inflightDeletes.set(id, inflight);
  try {
    await feedbackRuntime().http.remove(id, nonce);
    clearOutstanding(id);
    return true;
  } catch {
    // If the server's delete is already confirmed by a `deleted` frame, only the
    // response was lost — restoring would leave a row on screen that no longer
    // exists on the server.
    if (removedItem && !inflight.confirmed) {
      setItems((list) => {
        if (list.some((it) => it.id === id)) return list; // already restored/present, don't duplicate
        const copy = list.slice();
        copy.splice(Math.min(index, copy.length), 0, removedItem);
        return copy;
      });
    }
    return false;
  } finally {
    pendingNonces.delete(nonce);
    inflightDeletes.delete(id);
  }
}

const voteTimers = new Map<number, ReturnType<typeof setTimeout>>();
const flushing = new Set<number>();

function scheduleFlush(id: number): void {
  if (voteTimers.has(id)) return;
  const timer = setTimeout(() => {
    voteTimers.delete(id);
    void runFlush(id);
  }, VOTE_DEBOUNCE_MS);
  voteTimers.set(id, timer);
}

async function runFlush(id: number): Promise<void> {
  if (flushing.has(id)) {
    // A flush for this id is already in-flight; try again once it settles
    // rather than risk two concurrent POSTs racing on the same outstanding
    // amount.
    scheduleFlush(id);
    return;
  }
  // The server rejects a |delta| above MAX_VOTE_DELTA, so a flush sends at most
  // that much; the rest stays outstanding and goes out in the next one.
  const amount = Math.min(outstandingMap()[id] ?? 0, MAX_VOTE_DELTA);
  if (amount <= 0) return;
  flushing.add(id);
  const nonce = newNonce();
  pendingNonces.add(nonce);
  try {
    const res = await feedbackRuntime().http.vote(id, amount, nonce);
    setItems((list) => list.map((it) => (it.id === res.id ? { ...it, votes: res.votes } : it)));
  } catch {
    // Roll back: leave the server-known total untouched, only the
    // outstanding delta below is reverted.
  } finally {
    setOutstandingMap((m) => ({ ...m, [id]: (m[id] ?? 0) - amount }));
    pendingNonces.delete(nonce);
    flushing.delete(id);
    if ((outstandingMap()[id] ?? 0) > 0) scheduleFlush(id);
  }
}

/** Optimistic +1: accumulates immediately, flushes one batched POST after a
 *  debounce window. Displayed count via displayVotes() reflects the tap
 *  instantly regardless of network latency. */
export function vote(id: number, delta: number): void {
  setOutstandingMap((m) => ({ ...m, [id]: (m[id] ?? 0) + delta }));
  scheduleFlush(id);
}

function handleFrame(frame: FeedbackFrame): void {
  if (frame.type === "ping") return;
  if (frame.type === "deleted") {
    // Applied even for our OWN echo — which is why this sits ABOVE the nonce
    // guard. A delete is idempotent, so applying it twice is harmless, while
    // suppressing it does real damage: if the server committed and broadcast
    // but only the HTTP response was lost, dropping the echo lets
    // removeFeedback's catch restore the row, and an item that no longer exists
    // stays on screen until the next reconnect.
    const inflight = inflightDeletes.get(frame.id);
    if (inflight) inflight.confirmed = true;
    setItems((list) => list.filter((it) => it.id !== frame.id));
    clearOutstanding(frame.id);
    return;
  }
  if (frame.type === "status_changed") {
    // Server-originated (no client nonce exists for it), so like `deleted` and
    // `ping` it is handled above the nonce guard. The patch is applied
    // wholesale and never inspected: its keys are the host application's
    // vocabulary, which `renderItemMeta` — not this file — gives meaning to.
    setItems((list) => list.map((it) => (it.id === frame.id ? { ...it, ...frame.patch } : it)));
    return;
  }
  if (pendingNonces.has(frame.nonce)) return; // self-echo, POST response already applied it
  if (frame.type === "created") {
    upsertItem(frame.feedback); // idempotent upsert backstops out-of-order delivery
    return;
  }
  // voted (others'): update the server-known total only — displayVotes()
  // composes it with any outstanding local delta, never overwritten blindly.
  setItems((list) => list.map((it) => (it.id === frame.id ? { ...it, votes: frame.votes } : it)));
}

let unsubscribe: (() => void) | null = null;
let refCount = 0;

/** Start (once, ref-counted) the realtime subscription + initial snapshot load.
 *  Returns a stop function — call it from onCleanup. Safe to call from
 *  multiple components; the underlying connection is shared. */
export function ensureFeedbackSync(): () => void {
  refCount++;
  if (refCount === 1) {
    void loadFeedback();
    unsubscribe = feedbackRuntime().transport.subscribe(handleFrame, (status) => {
      setConnection(status);
      // Reconnect (open fires again) → refetch snapshot to self-heal any
      // frames missed while disconnected.
      if (status === "live") void loadFeedback();
    });
  }
  return () => {
    refCount = Math.max(0, refCount - 1);
    if (refCount === 0 && unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
  };
}

/** Test-only reset — clears all module state between test cases. */
export function __resetFeedbackStoreForTests(): void {
  setItems([]);
  setConnection("connecting");
  setOutstandingMap({});
  pendingNonces.clear();
  for (const t of voteTimers.values()) clearTimeout(t);
  voteTimers.clear();
  flushing.clear();
  if (unsubscribe) unsubscribe();
  unsubscribe = null;
  refCount = 0;
}
