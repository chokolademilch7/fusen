/**
 * "This comment in the list — where on the page was it left?"
 *
 * The panel is mounted at the app root, so a tapped item's route may differ from
 * the current one. Right after the host navigates, the target element is not
 * mounted yet, so the anchor is re-resolved on a short interval and the element
 * is scrolled into view and highlighted the moment it appears. On timeout this
 * resolves false and the caller reports it (an unresolvable element must never
 * cost the user the comment itself — it stays in the list either way).
 */

import { type Accessor, createEffect, createSignal } from "solid-js";
import type { Anchor, FeedbackItem } from "./types.ts";
import { anchoring } from "./runtime.ts";

/** How long to wait for the target to appear — enough for a route change plus a
 *  data fetch. */
const RESOLVE_TIMEOUT_MS = 2500;
const RESOLVE_INTERVAL_MS = 80;
/** How long the highlight lingers before fading on its own. */
const HIGHLIGHT_MS = 2600;

const [focusAnchor, setFocusAnchor] = createSignal<Anchor | null>(null);
export { focusAnchor };

/** The widget whose list started the current focus. The highlight is shared
 *  module state, but each mounted widget filters items with its own `hideItem`;
 *  only the owner may decide the highlight is orphaned, or another widget that
 *  hides the item would erase the focus a sibling is showing. `undefined` is the
 *  owner when the caller passes none. */
const [focusOwner, setFocusOwner] = createSignal<object | undefined>(undefined);
export { focusOwner };

let pollTimer: ReturnType<typeof setTimeout> | undefined;
let clearTimer: ReturnType<typeof setTimeout> | undefined;

export function clearFocus(): void {
  if (pollTimer) clearTimeout(pollTimer);
  if (clearTimer) clearTimeout(clearTimer);
  pollTimer = undefined;
  clearTimer = undefined;
  setFocusAnchor(null);
  setFocusOwner(undefined);
}

/** Clears the focus only if `owner` started it — for a widget unmounting while
 *  a sibling widget's focus is showing. */
export function clearFocusOwnedBy(owner: object | undefined): void {
  if (focusOwner() === owner) clearFocus();
}

/** The focused anchor if `owner` started the focus, else null — so only one of
 *  several mounted widgets draws the highlight. */
export const focusAnchorFor = (owner: object | undefined): Anchor | null =>
  focusOwner() === owner ? focusAnchor() : null;

/** Resolves true if the element was found. A second call discards the previous
 *  wait and highlight. `owner` identifies the widget asking (see `focusOwner`). */
export function focusOnAnchor(anchor: Anchor, owner?: object): Promise<boolean> {
  clearFocus();
  setFocusOwner(owner);
  const deadline = Date.now() + RESOLVE_TIMEOUT_MS;

  return new Promise<boolean>((resolve) => {
    const attempt = () => {
      const el = anchoring().resolveAnchor(anchor);
      if (el) {
        el.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
        setFocusAnchor(anchor);
        clearTimer = setTimeout(() => setFocusAnchor(null), HIGHLIGHT_MS);
        resolve(true);
        return;
      }
      if (Date.now() >= deadline) {
        resolve(false);
        return;
      }
      pollTimer = setTimeout(attempt, RESOLVE_INTERVAL_MS);
    };
    pollTimer = setTimeout(attempt, RESOLVE_INTERVAL_MS);
  });
}

/** Canonical JSON: object keys sorted, so key order never decides equality. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    // Like JSON.stringify, a key whose value is undefined is left out.
    const entries = Object.keys(record)
      .filter((k) => record[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(record[k])}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** Anchors compare by value: the focused anchor is not necessarily the same
 *  object as the item's after a refetch rebuilds the list. */
export function sameAnchor(a: Anchor | null | undefined, b: Anchor | null | undefined): boolean {
  if (a == null || b == null) return false;
  return a === b || canonical(a) === canonical(b);
}

/** Whether a highlight is showing for an anchor no drawn item has — the item
 *  was hidden by the host, or deleted here or by another client. */
export function focusOrphaned(anchor: Anchor | null, drawn: FeedbackItem[]): boolean {
  if (anchor == null) return false;
  const key = canonical(anchor);
  return !drawn.some((item) => item.anchor === anchor || canonical(item.anchor) === key);
}

/** Whether the highlight is showing for this item's anchor. */
export const isFocusedItem = (item: FeedbackItem): boolean =>
  sameAnchor(focusAnchor(), item.anchor);

/** Clears the highlight whenever its item stops being drawn by the widget that
 *  started it (`owner`). Call inside a reactive owner (a component or
 *  `createRoot`). */
export function clearOrphanedFocus(drawn: Accessor<FeedbackItem[]>, owner?: object): void {
  createEffect(() => {
    if (focusOrphaned(focusAnchorFor(owner), drawn())) clearFocus();
  });
}
