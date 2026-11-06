/**
 * The one thing the write path has to check, and why it is checked HERE.
 *
 * `@fusen/core` states in `types.ts` and `wire.ts` that it never validates at
 * runtime — it is types only, shared by both sides. So the guard belongs to the
 * package that owns the HTTP boundary, which is this one.
 *
 * WHAT GOES WRONG WITHOUT IT. A POST body is attacker-, typo- and
 * refactor-shaped: `{route, body, nonce}` with the anchor forgotten, or an
 * anchor that a client already stringified. Casting it to `Anchor` and storing
 * it costs nothing at write time and everything afterwards, because the damage
 * is not to that row:
 *
 *   - the widget's list guard (`@fusen/ui`'s `isFeedbackItem`) rejects the
 *     WHOLE array when one row fails it, so one bad row empties the panel for
 *     every client, permanently, with no error on the server;
 *   - `@fusen/mcp`'s listFeedback throws on `anchor.fingerprint` of undefined;
 *   - and nothing points at the write that caused it.
 *
 * A 400 at the boundary is the only place the failure is still attributable.
 *
 * HOW STRICT. No laxer than the client's own guard — that guard is the thing
 * whose rejection has to be prevented, so anything it checks must be checked
 * here. It only demands `anchor` be an object, which is not enough: an array
 * and `{}` both pass it and both still break the consumers above. So this
 * checks the whole documented `Anchor` shape, every field of which some
 * consumer reads (`fingerprint.tag`/`textSnippet` in the panel label,
 * `selectorPath` in resolution, `rectRatio` in pin placement).
 *
 * READ PATH IS NOT VALIDATED, on purpose. Whatever is already in a host's
 * database predates this check. Refusing to serve it would convert a widget
 * that half-works into one that shows nothing — the exact failure this guard
 * exists to prevent. Only new writes are held to the shape.
 */

import type { Anchor } from "@fusen/core";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A real, finite number. JSON turns NaN and Infinity into `null`, so this
 *  mostly catches a hand-built body — which is exactly what a host debugging
 *  their integration is sending. */
function isFiniteNumber(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value);
}

function isStringRecord(value: unknown): boolean {
  return isRecord(value) && Object.values(value).every((v) => typeof v === "string");
}

function isFingerprint(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    typeof value.tag === "string" &&
    (value.id === undefined || typeof value.id === "string") &&
    isStringRecord(value.dataAttrs) &&
    Array.isArray(value.classList) &&
    value.classList.every((c) => typeof c === "string") &&
    typeof value.textSnippet === "string"
  );
}

/**
 * Is this the `Anchor` the widget captured?
 *
 * `version` is required to be exactly 1 because that is what the type says and
 * what this server's row type promises. When a v2 format exists, this is the
 * line that has to learn about it — a deliberate compile-and-test-visible
 * checkpoint rather than a silent pass-through of an unknown shape.
 */
export function isAnchor(value: unknown): value is Anchor {
  if (!isRecord(value)) return false;
  return (
    value.version === 1 &&
    typeof value.route === "string" &&
    typeof value.selectorPath === "string" &&
    isFingerprint(value.fingerprint) &&
    isRecord(value.rectRatio) &&
    isFiniteNumber(value.rectRatio.x) &&
    isFiniteNumber(value.rectRatio.y)
  );
}

/**
 * The anchor as it is stored: the fields `Anchor` declares and nothing else.
 *
 * `isAnchor` checks the fields it knows and lets any other key through. An
 * extra key nested deep enough makes every later `JSON.stringify` of the row
 * throw, so one anonymous write would turn every list into a 500 until the row
 * is removed by hand.
 */
export function toAnchor(anchor: Anchor): Anchor {
  const fp = anchor.fingerprint;
  return {
    version: anchor.version,
    route: anchor.route,
    selectorPath: anchor.selectorPath,
    fingerprint: {
      tag: fp.tag,
      ...(fp.id === undefined ? {} : { id: fp.id }),
      dataAttrs: { ...fp.dataAttrs },
      classList: [...fp.classList],
      textSnippet: fp.textSnippet,
    },
    rectRatio: { x: anchor.rectRatio.x, y: anchor.rectRatio.y },
  };
}

/*
 * SIZE LIMITS. Writes are anonymous by default, and every stored row is sent
 * to every SSE client and returned by every (unpaginated) list, so one huge row
 * slows every visitor's widget, not only the database. The caps are generous
 * for a comment and small next to the damage.
 */

/** Characters of comment text. */
export const MAX_BODY_LENGTH = 10_000;
/** Characters of route. A path, not a document. */
export const MAX_ROUTE_LENGTH = 2_048;
/** Characters of `context` once serialized. `PageContext` is a few small
 *  records (machine states, playback position, device). */
export const MAX_CONTEXT_LENGTH = 16_384;
/** Characters of `anchor` once serialized (after `toAnchor`). A selector path
 *  and a fingerprint; long utility-class lists are what make it grow. */
export const MAX_ANCHOR_LENGTH = 16_384;
/** Characters of `nonce`, on every write. Never stored, but echoed in the
 *  realtime frame to every subscriber. The widget's are under 40. */
export const MAX_NONCE_LENGTH = 128;

/** Serialized length, or `Infinity` for a value `JSON.stringify` throws on
 *  (nesting deep enough to overflow the stack): refused as too large, not a
 *  500. */
function serializedLength(value: unknown): number {
  try {
    return JSON.stringify(value)?.length ?? 0;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

/** Why a write's free-form fields are refused, or `null` when they fit. */
export function oversizedField(payload: Record<string, unknown>): string | null {
  if (typeof payload.body === "string" && payload.body.length > MAX_BODY_LENGTH) {
    return `body longer than ${MAX_BODY_LENGTH} characters`;
  }
  if (typeof payload.route === "string" && payload.route.length > MAX_ROUTE_LENGTH) {
    return `route longer than ${MAX_ROUTE_LENGTH} characters`;
  }
  const ctx = payload.context ?? null;
  if (ctx !== null && !isRecord(ctx)) {
    // `PageContext | null` on the wire; a string would also be re-parsed on read.
    return "context must be an object or null";
  }
  if (ctx !== null && serializedLength(ctx) > MAX_CONTEXT_LENGTH) {
    return `context larger than ${MAX_CONTEXT_LENGTH} characters`;
  }
  if (serializedLength(payload.anchor) > MAX_ANCHOR_LENGTH) {
    return `anchor larger than ${MAX_ANCHOR_LENGTH} characters`;
  }
  return null;
}
