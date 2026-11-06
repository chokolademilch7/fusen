/**
 * The vote rule, shared by the widget that batches taps and the server that
 * refuses a delta outside it.
 *
 * WHY THIS IS IN THE CORE. The rest of this package checks nothing at runtime
 * (see `wire.ts`). This is not a shape check: it is one number both sides must
 * agree on, and keeping two copies meant the widget could batch a delta the
 * server then refused. A constant and a pure function keep the core
 * dependency-free.
 */

/** The largest single vote delta accepted. Not 1: the widget debounces taps and
 *  sends them as ONE batched delta (`@fusen/ui`'s store), so a few quick taps
 *  arrive as 3 or 5. There is no per-author dedupe; votes are claps, not a
 *  ballot. */
export const MAX_VOTE_DELTA = 100;

/** A non-zero whole number no bigger than `MAX_VOTE_DELTA` either way. */
export function isVoteDelta(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value !== 0 &&
    Math.abs(value) <= MAX_VOTE_DELTA
  );
}
