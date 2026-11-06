/**
 * The four normalizations that are invisible when you get them wrong.
 *
 * Every one of these was measured against a real, hand-written server before
 * this package existed. None of them raises an error on the server side; each
 * one fails in the browser, silently, in a way that looks like a widget bug:
 *
 * 1. `anchor` / `context` must be OBJECTS. A driver that hands back a jsonb
 *    column as a JSON *string* (which is what happens when the value was
 *    inserted already-stringified) makes the reader's item check fail — and it
 *    rejects the WHOLE list, not the one bad row. Symptom: rows visibly in the
 *    database, an empty panel, no error anywhere.
 * 2. `id` and `votes` must be JS numbers. A driver returning them as strings or
 *    BigInt fails the same check, the same way.
 * 3. `created_at` must be a string. A `Date` instance does not survive the
 *    check either.
 * 4. `author_picture` must EXIST, as a string or null. A server that simply
 *    omits it produces an item the widget's own type says is impossible.
 *
 * And the rule that outranks all four: normalize the KNOWN fields, then spread
 * the rest. Rebuilding an item field-by-field — the obvious way to write this —
 * silently deletes every application-specific field the host attached, which is
 * exactly the vocabulary the widget's `renderItemMeta` slot exists to render.
 */

import type { FeedbackItem } from "@fusen/core";

function asObject(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    // Not JSON after all. Hand it back unchanged rather than inventing a value:
    // a wrong shape that reaches the reader is a visible failure, a silently
    // fabricated one is not.
    return value;
  }
}

function asIsoString(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

/** Coerce one row from a store into exactly what the wire contract promises,
 *  preserving anything the host added. */
export function normalizeItem(row: FeedbackItem | Record<string, unknown>): FeedbackItem {
  const item = row as Record<string, unknown>;
  return {
    // Spread FIRST so the normalized values below win, and every unknown field
    // the host attached survives.
    ...item,
    id: Number(item.id),
    route: String(item.route),
    body: String(item.body),
    anchor: asObject(item.anchor),
    context: item.context === null || item.context === undefined ? null : asObject(item.context),
    author_name: String(item.author_name),
    author_picture:
      item.author_picture === undefined || item.author_picture === null
        ? null
        : String(item.author_picture),
    author_key: String(item.author_key),
    votes: Number(item.votes),
    created_at: asIsoString(item.created_at),
  } as FeedbackItem;
}

export function normalizeItems(
  rows: readonly (FeedbackItem | Record<string, unknown>)[],
): FeedbackItem[] {
  return rows.map(normalizeItem);
}
