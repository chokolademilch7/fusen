/**
 * The three questions a model asks about a pile of comments, as plain functions.
 *
 * WHY THESE LIVE IN THE CORE, next to the wire types rather than in `@fusen/mcp`
 * where they were written. `@fusen/mcp`'s stdio entry promises that the tools are
 * "the same three either way, with the same names and arguments" whichever
 * transport answered. There are now three transports — stdio over a server,
 * stdio over the DevTools protocol, and WebMCP inside the page itself — and the
 * third one runs in a BROWSER, which cannot import a package that depends on the
 * MCP SDK. Copying the functions across would keep the promise only until
 * someone changed one copy: the payload shape IS the promise, and a
 * `list_feedback` that returns a differently-shaped row from a lite page than
 * from a server is exactly the surprise the wording rules out.
 *
 * So they live in the one package everything already depends on, and which has
 * no dependencies of its own to drag anywhere.
 *
 * The bias throughout is toward returning something a model can act on. A raw
 * row dump is technically complete and practically useless: the anchor is the
 * interesting part of a fusen comment ("which element on which page"), and it
 * is a nested object nobody wants to read. `describeAnchor` turns it into the
 * same short human phrase the widget itself shows.
 */

import { describeAnchor } from "./anchor.ts";
import type { FeedbackItem } from "./wire.ts";

/**
 * All these functions need: a way to get every comment.
 *
 * Structural and deliberately smaller than any one implementation. `@fusen/server`'s
 * `FeedbackStore` satisfies it, and so does an object built from
 * `window.__fusen.dump()` — which is the point, because the second one exists in
 * a page that has no server to have a store.
 */
export type FeedbackReader = {
  list(): Promise<readonly FeedbackItem[]>;
};

export type FeedbackSummary = {
  id: number;
  route: string;
  body: string;
  /** Where the pin sits, in words. */
  location: string;
  author: string;
  votes: number;
  created_at: string;
  /**
   * Which page this came from, when the reader reads more than one at a time.
   *
   * Load-bearing for the CDP reader: separate tabs are separate IndexedDB
   * origins, so each one numbers its comments from 1 and each may call its route
   * "/". Without this, three tabs' comments arrive as an indistinguishable pile
   * of `id: 1, route: "/"` — measured, and it makes both `get_feedback` and any
   * summary useless. A server reader never sets it and it stays absent, and so
   * does an in-page one, which by construction sees exactly one page.
   */
  source?: string;
};

export type ListArgs = {
  /** Only comments posted from this route. */
  route?: string;
  /** Case-insensitive substring of the body. */
  query?: string;
  /** Newest first. Defaults to 50 — a model does not want 4000 rows. An
   *  integer from 1 to `MAX_LIMIT`; anything else is rejected. */
  limit?: number;
};

function sourceOf(item: FeedbackItem): string | undefined {
  return typeof item.source_url === "string" ? item.source_url : undefined;
}

// Rows come from whatever answered — a remote server, a browser tab of any
// bridge version — so a field can be missing. `String(undefined)` would put the
// word "undefined" in front of a model, and `Number(undefined)` is NaN, which
// serialises as null and poisons any vote total it is added to.
function text(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function count(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function summarize(item: FeedbackItem): FeedbackSummary {
  const source = sourceOf(item);
  return {
    id: Number(item.id),
    route: text(item.route),
    body: text(item.body),
    location: describeAnchor(item.anchor),
    author: text(item.author_name),
    votes: count(item.votes),
    created_at: text(item.created_at),
    ...(source ? { source } : {}),
  };
}

function timeOf(item: FeedbackItem): number {
  const t = Date.parse(text(item.created_at));
  return Number.isNaN(t) ? -Infinity : t;
}

/**
 * Newest first, by `created_at`. Stores already answer id-descending, but the
 * CDP reader concatenates tabs — each newest-first only within itself — and a
 * remote server is any server. The sort is stable, so rows with the same
 * timestamp keep the store's order, and unparseable dates sink to the end.
 */
function newestFirst(items: readonly FeedbackItem[]): FeedbackItem[] {
  return items
    .map((item, index) => ({ item, index, time: timeOf(item) }))
    .sort((a, b) => (a.time === b.time ? a.index - b.index : a.time < b.time ? 1 : -1))
    .map(({ item }) => item);
}

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 500;

// The stdio server's schema already refuses these, but WebMCP hands the input
// straight through, and `slice(0, -1)` or `slice(0, NaN)` would quietly return
// the wrong rows with a nonsense `returned`. Reject here so every transport
// answers the same arguments the same way.
function limitOf(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new RangeError(`limit must be an integer from 1 to ${MAX_LIMIT}, got ${limit}`);
  }
  return limit;
}

export async function listFeedback(
  reader: FeedbackReader,
  args: ListArgs = {},
): Promise<{ total: number; returned: number; feedback: FeedbackSummary[] }> {
  const limit = limitOf(args.limit);
  const all = await reader.list();
  const needle = args.query?.toLowerCase();
  const matched = newestFirst(all).filter((item) => {
    if (args.route !== undefined && text(item.route) !== args.route) return false;
    if (needle && !text(item.body).toLowerCase().includes(needle)) return false;
    return true;
  });
  return {
    // Report the truncation rather than silently returning a slice: a model that
    // cannot see it was cut off will happily conclude it read everything.
    total: matched.length,
    returned: Math.min(matched.length, limit),
    feedback: matched.slice(0, limit).map(summarize),
  };
}

export type FeedbackDetail = FeedbackSummary & { anchor: unknown; context: unknown };

/**
 * One comment, with the fields the summary drops: the full anchor and the page
 * snapshot, which is where "what was the app doing" lives.
 *
 * `id` is NOT globally unique when the reader spans several browser tabs — each
 * page numbers from 1. So an ambiguous id returns every match rather than
 * silently picking the first, which would answer a question nobody asked. Pass
 * `source` to disambiguate.
 */
export async function getFeedback(
  reader: FeedbackReader,
  id: number,
  source?: string,
): Promise<FeedbackDetail | { ambiguous: FeedbackDetail[] } | null> {
  const detail = (item: FeedbackItem): FeedbackDetail => ({
    ...summarize(item),
    anchor: item.anchor,
    context: item.context,
  });

  const matches = (await reader.list())
    .filter((item) => Number(item.id) === id)
    .filter((item) => source === undefined || sourceOf(item) === source);

  if (matches.length === 0) return null;
  if (matches.length === 1) return detail(matches[0]!);
  return { ambiguous: matches.map(detail) };
}

/** Which routes have comments, and how many. The question a triage session opens
 *  with, and one that is tedious to answer by reading a list. */
export async function summarizeRoutes(reader: FeedbackReader): Promise<{
  routes: { route: string; source?: string; count: number; votes: number }[];
}> {
  // Grouped by (source, route), not route alone. Three browser tabs all calling
  // their route "/" would otherwise collapse into one line reading `count: 3`,
  // which says the opposite of the truth: they are three separate pages with one
  // comment each. Measured on the three examples.
  const counts = new Map<
    string,
    { route: string; source?: string; count: number; votes: number }
  >();
  for (const item of await reader.list()) {
    const route = text(item.route);
    const source = sourceOf(item);
    const key = `${source ?? ""} ${route}`;
    const entry = counts.get(key) ?? { route, ...(source ? { source } : {}), count: 0, votes: 0 };
    entry.count += 1;
    entry.votes += count(item.votes);
    counts.set(key, entry);
  }
  return { routes: [...counts.values()].sort((a, b) => b.count - a.count) };
}
