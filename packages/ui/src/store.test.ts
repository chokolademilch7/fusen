import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { isVoteDelta, MAX_VOTE_DELTA } from "@fusen/core";
import type { Anchor, FeedbackHttp, FeedbackItem, PageContext } from "./types.ts";
import { configureFusenWidget } from "./runtime.ts";

const sampleAnchor: Anchor = {
  version: 1,
  route: "/watch/1",
  selectorPath: "main > .player",
  fingerprint: { tag: "div", dataAttrs: {}, classList: ["player"], textSnippet: "" },
  rectRatio: { x: 0.5, y: 0.5 },
};

function item(overrides: Partial<FeedbackItem>): FeedbackItem {
  return {
    id: 1,
    route: "/watch/1",
    body: "test",
    anchor: sampleAnchor,
    author_name: "Taro",
    author_picture: null,
    author_key: "author-key-1",
    context: null,
    votes: 0,
    // Application-specific fields a real server also returns. The widget never
    // reads them; they are here to prove they survive the store untouched.
    feedback_status: "open",
    pr_number: null,
    decompose_requested_at: null,
    decompose_state: null,
    has_todos: false,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// --- fake EventSource: gives tests full control over realtime message timing.
// The default transport is the real EventSource transport, so replacing the
// global is enough to drive it — no transport injection needed here, which keeps
// the reconnect/refetch behaviour under test rather than stubbed out. ---
type FakeMessage = { data: string };
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: FakeMessage) => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }
  close(): void {
    this.closed = true;
  }
}
(globalThis as unknown as { EventSource: unknown }).EventSource = FakeEventSource;

// --- the HTTP seam, faked.
//
// This replaces what used to be a mock.module("../api", …) against the host
// app's shared API layer. mock.module() rewrites the module registry for the
// whole test *process* (keyed by resolved path), not just one file, which made
// it collide with other suites' partial stubs of the same module. Injecting a
// FeedbackHttp through configureFusenWidget() has no such reach: it is
// re-installed per test below, and machine.test.ts resets the configuration to
// its defaults for its own run, so the two suites cannot interfere in either
// order. ---
let feedbackListImpl = mock(async (): Promise<{ feedback: FeedbackItem[] }> => ({ feedback: [] }));
let addFeedbackImpl = mock(
  async (
    route: string,
    body: string,
    anchor: Anchor,
    _context: PageContext | null,
    _nonce: string,
  ): Promise<{ feedback: FeedbackItem }> => ({ feedback: item({ id: 999, route, body, anchor }) }),
);
let addFeedbackVotesImpl = mock(
  async (id: number, delta: number, _nonce: string): Promise<{ id: number; votes: number }> => ({
    id,
    votes: delta,
  }),
);
let deleteFeedbackImpl = mock(async (id: number, _nonce: string): Promise<{ id: number }> => ({
  id,
}));
let captureContextImpl: () => PageContext | null = () => null;

const fakeHttp: FeedbackHttp = {
  list: (...args: unknown[]) =>
    (feedbackListImpl as unknown as (...a: unknown[]) => Promise<{ feedback: FeedbackItem[] }>)(
      ...args,
    ),
  create: (...args: unknown[]) =>
    (addFeedbackImpl as unknown as (...a: unknown[]) => Promise<{ feedback: FeedbackItem }>)(
      ...args,
    ),
  vote: (...args: unknown[]) =>
    (
      addFeedbackVotesImpl as unknown as (...a: unknown[]) => Promise<{ id: number; votes: number }>
    )(...args),
  remove: (...args: unknown[]) =>
    (deleteFeedbackImpl as unknown as (...a: unknown[]) => Promise<{ id: number }>)(...args),
};

const {
  connectionStatus,
  displayVotes,
  ensureFeedbackSync,
  feedbackItems,
  loadFeedback,
  outstandingDelta,
  removeFeedback,
  submitFeedback,
  vote,
  __resetFeedbackStoreForTests,
} = await import("./store.ts");

function emit(es: FakeEventSource, payload: unknown): void {
  es.onmessage?.({ data: JSON.stringify(payload) });
}

beforeEach(() => {
  FakeEventSource.instances = [];
  feedbackListImpl = mock(async () => ({ feedback: [] }));
  addFeedbackImpl = mock(async (route: string, body: string, anchor: Anchor) => ({
    feedback: item({ id: 999, route, body, anchor }),
  }));
  addFeedbackVotesImpl = mock(async (id: number, delta: number) => ({ id, votes: delta }));
  deleteFeedbackImpl = mock(async (id: number) => ({ id }));
  captureContextImpl = () => null;
  configureFusenWidget({ http: fakeHttp, captureContext: () => captureContextImpl() });
});

const CONTEXT_ARG_INDEX = 3;

// MUST run before the next test's configureFusenWidget(): the reset
// unsubscribes the live transport, and reconfiguring first would swap the
// transport object out from under a still-open subscription, orphaning it.
afterEach(() => {
  __resetFeedbackStoreForTests();
});

describe("feedbackStore: submitFeedback", () => {
  test("success upserts the created item and clears the pending nonce afterwards", async () => {
    addFeedbackImpl = mock(async () => ({ feedback: item({ id: 42, body: "hello" }) }));
    const created = await submitFeedback("/watch/1", "hello", sampleAnchor);
    expect(created.id).toBe(42);
    expect(feedbackItems().find((i) => i.id === 42)?.body).toBe("hello");
  });

  test("posts on an insecure origin, where crypto.randomUUID does not exist", async () => {
    // A page served over plain http from anything but localhost is not a secure
    // context, so `crypto` exists but `randomUUID` does not. Calling it threw
    // and the submission died BEFORE any request was made — no network error to
    // read, just a widget stuck in mode.error. Measured on a real http preview
    // origin; invisible in the https-only app this widget came from.
    const original = crypto.randomUUID;
    // Delete it to reproduce the shape of `crypto` in an insecure context.
    delete (crypto as { randomUUID?: unknown }).randomUUID;
    try {
      addFeedbackImpl = mock(async () => ({ feedback: item({ id: 7, body: "insecure" }) }));
      const created = await submitFeedback("/watch/1", "insecure", sampleAnchor);
      expect(created.id).toBe(7);
      expect(addFeedbackImpl).toHaveBeenCalled();
      // The nonce still has to be a non-empty string: the realtime echo of our
      // own write is dropped by matching it.
      const nonce = addFeedbackImpl.mock.calls[0]?.[4];
      expect(typeof nonce).toBe("string");
      expect((nonce as string).length).toBeGreaterThan(0);
    } finally {
      (crypto as { randomUUID?: unknown }).randomUUID = original;
    }
  });

  test("failure propagates and does not insert an item", async () => {
    addFeedbackImpl = mock(async () => {
      throw new Error("network");
    });
    await expect(submitFeedback("/watch/1", "hello", sampleAnchor)).rejects.toThrow();
    expect(feedbackItems()).toEqual([]);
  });

  test("context snapshot is captured and forwarded, but never blocks the POST — with no host probe wired the injected default yields null", async () => {
    addFeedbackImpl = mock(async (route: string, body: string, anchor: Anchor) => ({
      feedback: item({ id: 77, route, body, anchor }),
    }));
    const created = await submitFeedback("/watch/1", "hello", sampleAnchor);
    expect(created.id).toBe(77);
    const call = addFeedbackImpl.mock.calls[0]!;
    expect(call[CONTEXT_ARG_INDEX]).toBeNull();
  });

  test("a host-supplied snapshot is forwarded verbatim", async () => {
    const snapshot: PageContext = { version: 1, machines: { feedback: "mode.composing" } };
    captureContextImpl = () => snapshot;
    await submitFeedback("/watch/1", "hello", sampleAnchor);
    expect(addFeedbackImpl.mock.calls[0]![CONTEXT_ARG_INDEX]).toEqual(snapshot);
  });

  test("a throwing host probe degrades to a missing snapshot, not a failed POST", async () => {
    captureContextImpl = () => {
      throw new Error("broken probe");
    };
    addFeedbackImpl = mock(async () => ({ feedback: item({ id: 78 }) }));
    const created = await submitFeedback("/watch/1", "hello", sampleAnchor);
    expect(created.id).toBe(78);
    expect(addFeedbackImpl.mock.calls[0]![CONTEXT_ARG_INDEX]).toBeNull();
  });
});

describe("feedbackStore: vote outstanding / debounce / rollback", () => {
  test("vote() applies optimistically before the debounce flush fires", async () => {
    feedbackListImpl = mock(async () => ({ feedback: [item({ id: 5, votes: 10 })] }));
    await loadFeedback();
    vote(5, 1);
    vote(5, 1);
    expect(outstandingDelta(5)).toBe(2);
    const found = feedbackItems().find((i) => i.id === 5)!;
    expect(displayVotes(found)).toBe(12); // 10 server + 2 outstanding, before any POST
    expect(addFeedbackVotesImpl).not.toHaveBeenCalled();
  });

  test("debounced flush batches taps into a single POST with the summed delta", async () => {
    feedbackListImpl = mock(async () => ({ feedback: [item({ id: 5, votes: 10 })] }));
    await loadFeedback();
    addFeedbackVotesImpl = mock(async (id: number, delta: number) => ({ id, votes: 10 + delta }));

    vote(5, 1);
    vote(5, 1);
    vote(5, 1);
    await Bun.sleep(700);

    expect(addFeedbackVotesImpl).toHaveBeenCalledTimes(1);
    const call = addFeedbackVotesImpl.mock.calls[0]!;
    expect(call[0]).toBe(5);
    expect(call[1]).toBe(3);
    expect(typeof call[2]).toBe("string"); // nonce

    const found = feedbackItems().find((i) => i.id === 5)!;
    expect(found.votes).toBe(13); // server-known total from the response
    expect(outstandingDelta(5)).toBe(0); // flushed amount subtracted
    expect(displayVotes(found)).toBe(13);
  });

  test("failed flush rolls back only the flushed delta, leaving server total untouched", async () => {
    feedbackListImpl = mock(async () => ({ feedback: [item({ id: 6, votes: 4 })] }));
    await loadFeedback();
    addFeedbackVotesImpl = mock(async () => {
      throw new Error("fail");
    });

    vote(6, 1);
    await Bun.sleep(700);

    const found = feedbackItems().find((i) => i.id === 6)!;
    expect(found.votes).toBe(4); // unchanged — rollback, not a blind reset
    expect(outstandingDelta(6)).toBe(0);
    expect(displayVotes(found)).toBe(4);
  });

  test("taps piled up behind an in-flight POST go out in chunks the server accepts", async () => {
    feedbackListImpl = mock(async () => ({ feedback: [item({ id: 8, votes: 0 })] }));
    await loadFeedback();
    let serverVotes = 0;
    const held = deferred<void>();
    addFeedbackVotesImpl = mock(async (id: number, delta: number) => {
      if (serverVotes === 0) await held.promise; // hold the first POST in flight
      if (!isVoteDelta(delta)) throw new Error("400"); // the server's own rule
      serverVotes += delta;
      return { id, votes: serverVotes };
    });

    vote(8, 1);
    await Bun.sleep(600); // first flush is now in flight
    for (let i = 0; i < MAX_VOTE_DELTA + 1; i++) vote(8, 1);
    held.resolve();
    await Bun.sleep(1300); // two more debounced flushes

    const found = feedbackItems().find((i) => i.id === 8)!;
    expect(addFeedbackVotesImpl.mock.calls.map((c) => c[1])).toEqual([1, MAX_VOTE_DELTA, 1]);
    expect(found.votes).toBe(MAX_VOTE_DELTA + 2);
    expect(displayVotes(found)).toBe(MAX_VOTE_DELTA + 2);
  });
});

describe("feedbackStore: realtime dedupe + reconcile rules", () => {
  test("self-echo (matching pending nonce) is dropped; POST response is the source of truth", async () => {
    const d = deferred<{ feedback: FeedbackItem }>();
    addFeedbackImpl = mock(() => d.promise);

    const submitPromise = submitFeedback("/watch/1", "hello", sampleAnchor);
    await Bun.sleep(5); // let the http mock synchronously record the call
    const usedNonce = addFeedbackImpl.mock.calls[0]![4] as string;
    expect(typeof usedNonce).toBe("string");

    const stop = ensureFeedbackSync();
    const es = FakeEventSource.instances.at(-1)!;
    es.onopen?.();
    await Bun.sleep(5);

    // The server's own broadcast of our in-flight write arrives before our
    // POST resolves — it must be dropped (self-echo), not double-inserted.
    emit(es, { type: "created", feedback: item({ id: 42 }), nonce: usedNonce });
    expect(feedbackItems().find((i) => i.id === 42)).toBeUndefined();

    d.resolve({ feedback: item({ id: 42 }) });
    await submitPromise;
    expect(feedbackItems().find((i) => i.id === 42)).toBeDefined();
    expect(feedbackItems().filter((i) => i.id === 42).length).toBe(1);
    stop();
  });

  test("others' voted event updates the server-known total without blind-overwriting outstanding local delta", async () => {
    feedbackListImpl = mock(async () => ({ feedback: [item({ id: 7, votes: 10 })] }));
    const stop = ensureFeedbackSync();
    await Bun.sleep(5);
    const es = FakeEventSource.instances.at(-1)!;

    vote(7, 1); // outstanding, not yet flushed (debounce window)
    emit(es, { type: "voted", id: 7, votes: 20, nonce: "someone-elses-nonce" });

    const found = feedbackItems().find((i) => i.id === 7)!;
    expect(found.votes).toBe(20); // server total applied
    expect(outstandingDelta(7)).toBe(1); // local outstanding untouched
    expect(displayVotes(found)).toBe(21); // composed, not overwritten to 20
    stop();
  });

  test("others' created event upserts idempotently by server id (duplicate delivery is a no-op)", async () => {
    const stop = ensureFeedbackSync();
    await Bun.sleep(5);
    const es = FakeEventSource.instances.at(-1)!;

    const payload = { type: "created" as const, feedback: item({ id: 8 }), nonce: "other-nonce" };
    emit(es, payload);
    emit(es, payload);

    expect(feedbackItems().filter((i) => i.id === 8).length).toBe(1);
    stop();
  });

  test("ping events are ignored", async () => {
    const stop = ensureFeedbackSync();
    await Bun.sleep(5);
    const es = FakeEventSource.instances.at(-1)!;
    const before = feedbackItems().length;
    emit(es, { type: "ping" });
    expect(feedbackItems().length).toBe(before);
    stop();
  });

  // The status_changed frame carries one application's vocabulary. The store
  // must apply it as an opaque patch, above the nonce guard (it has no client
  // nonce), without knowing what any of the keys mean.
  test("a status_changed frame shallow-merges its app-specific payload into the item", async () => {
    feedbackListImpl = mock(async () => ({ feedback: [item({ id: 12 })] }));
    const stop = ensureFeedbackSync();
    await Bun.sleep(5);
    const es = FakeEventSource.instances.at(-1)!;

    emit(es, { type: "status_changed", id: 12, feedback_status: "done", pr_number: 50 });

    const found = feedbackItems().find((i) => i.id === 12)!;
    expect(found.feedback_status).toBe("done");
    expect(found.pr_number).toBe(50);
    expect(found.body).toBe("test"); // untouched
    stop();
  });

  test("unrecognised frames are dropped without throwing", async () => {
    feedbackListImpl = mock(async () => ({ feedback: [item({ id: 13 })] }));
    const stop = ensureFeedbackSync();
    await Bun.sleep(5);
    const es = FakeEventSource.instances.at(-1)!;

    expect(() => emit(es, { type: "who_knows", id: 13 })).not.toThrow();
    expect(() => es.onmessage?.({ data: "not json at all" })).not.toThrow();
    expect(feedbackItems().map((i) => i.id)).toEqual([13]);
    stop();
  });
});

describe("feedbackStore: sync lifecycle", () => {
  test("ensureFeedbackSync refetches the snapshot on (re)connect", async () => {
    const stop = ensureFeedbackSync();
    const es = FakeEventSource.instances.at(-1)!;
    es.onopen?.();
    await Bun.sleep(5);
    // one eager load at start + one on the "live" transition
    expect(feedbackListImpl.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(connectionStatus()).toBe("live");
    stop();
  });

  test("is ref-counted: only closes the connection once every caller has stopped", async () => {
    const stopA = ensureFeedbackSync();
    const stopB = ensureFeedbackSync();
    expect(FakeEventSource.instances.length).toBe(1); // shared connection
    const es = FakeEventSource.instances[0]!;

    stopA();
    expect(es.closed).toBe(false);
    stopB();
    expect(es.closed).toBe(true);
  });
});

describe("feedbackStore: removeFeedback", () => {
  test("removes the item optimistically before the DELETE resolves", async () => {
    feedbackListImpl = mock(async () => ({ feedback: [item({ id: 9 })] }));
    await loadFeedback();
    const d = deferred<{ id: number }>();
    deleteFeedbackImpl = mock(() => d.promise as unknown as Promise<{ id: number }>);

    const removePromise = removeFeedback(9);
    await Bun.sleep(5);
    expect(feedbackItems().find((i) => i.id === 9)).toBeUndefined();

    d.resolve({ id: 9 });
    expect(await removePromise).toBe(true);
    expect(feedbackItems().find((i) => i.id === 9)).toBeUndefined();
  });

  test("a failed DELETE restores the item at its original position", async () => {
    feedbackListImpl = mock(async () => ({
      feedback: [item({ id: 1 }), item({ id: 2 }), item({ id: 3 })],
    }));
    await loadFeedback();
    deleteFeedbackImpl = mock(async () => {
      throw new Error("forbidden");
    });

    const ok = await removeFeedback(2);
    expect(ok).toBe(false);
    expect(feedbackItems().map((i) => i.id)).toEqual([1, 2, 3]);
  });

  // The server committed the delete and broadcast it, but only the HTTP response
  // was lost. Rolling back would leave a row on screen that no longer exists.
  test("a DELETE that failed after the server already committed does not resurrect the item", async () => {
    feedbackListImpl = mock(async () => ({ feedback: [item({ id: 5 })] }));
    const stop = ensureFeedbackSync();
    await Bun.sleep(5);
    const es = FakeEventSource.instances.at(-1)!;
    const d = deferred<{ id: number }>();
    deleteFeedbackImpl = mock(() => d.promise as unknown as Promise<{ id: number }>);

    const removePromise = removeFeedback(5);
    await Bun.sleep(5);
    // Use the echo carrying our OWN nonce — `deleted` must be applied even for a
    // self-echo, or the rollback below resurrects the row.
    const usedNonce = deleteFeedbackImpl.mock.calls[0]![1] as string;
    expect(typeof usedNonce).toBe("string");
    // The delete broadcast arrives first, then the response fails.
    emit(es, { type: "deleted", id: 5, nonce: usedNonce });
    d.reject(new Error("network"));

    expect(await removePromise).toBe(false);
    expect(feedbackItems().find((i) => i.id === 5)).toBeUndefined();
    stop();
  });

  test("a successful DELETE clears any dangling outstanding vote delta", async () => {
    feedbackListImpl = mock(async () => ({ feedback: [item({ id: 4, votes: 2 })] }));
    await loadFeedback();
    vote(4, 1); // outstanding, not yet flushed

    const ok = await removeFeedback(4);
    expect(ok).toBe(true);
    expect(outstandingDelta(4)).toBe(0);
  });
});

describe("feedbackStore: realtime deleted event", () => {
  test("an inbound deleted event removes the item", async () => {
    feedbackListImpl = mock(async () => ({ feedback: [item({ id: 10 })] }));
    const stop = ensureFeedbackSync();
    await Bun.sleep(5);
    const es = FakeEventSource.instances.at(-1)!;

    expect(feedbackItems().find((i) => i.id === 10)).toBeDefined();
    emit(es, { type: "deleted", id: 10, nonce: "someone-elses-nonce" });
    expect(feedbackItems().find((i) => i.id === 10)).toBeUndefined();
    stop();
  });

  test("a deleted event for an unknown id is a no-op", async () => {
    feedbackListImpl = mock(async () => ({ feedback: [item({ id: 11 })] }));
    const stop = ensureFeedbackSync();
    await Bun.sleep(5);
    const es = FakeEventSource.instances.at(-1)!;

    expect(() =>
      emit(es, { type: "deleted", id: 999, nonce: "someone-elses-nonce" }),
    ).not.toThrow();
    expect(feedbackItems().map((i) => i.id)).toEqual([11]);
    stop();
  });
});
