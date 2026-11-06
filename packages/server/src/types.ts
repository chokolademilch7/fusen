/**
 * The server side's seams: what a host must supply, and what it may override.
 *
 * The whole point of this package is that `FeedbackStore` is the ONLY thing a
 * host has to write. Everything else — routing, the wire format, the realtime
 * frames, the four normalizations that are invisible when you get them wrong —
 * belongs to the package.
 */

import type { Anchor, FeedbackItem, PageContext } from "@fusen/core";
import type { AnonymousCookieOptions } from "./identity.ts";

/** Who is writing. The server is the only authority on identity: the widget's
 *  `author-key` decides whether a delete button is DRAWN and nothing more. */
export type Author = {
  name: string;
  /** Opaque, stable per identity. Stamped onto every item this author writes. */
  key: string;
  picture?: string | null;
};

/** A new comment, as the store receives it. `nonce` is deliberately absent: it
 *  belongs to the realtime echo, not to the row, and a store that persists it
 *  is storing a client detail. */
export type CreateInput = {
  route: string;
  body: string;
  anchor: Anchor;
  context: PageContext | null;
  author: Author;
};

export type VoteResult = { id: number; votes: number };

/**
 * Storage. Four methods, mirroring the four writes the protocol has.
 *
 * `vote` and `remove` return `null` for "no such id" rather than throwing, so
 * the difference between a missing row and a broken store stays visible: a
 * thrown error is a 500, a `null` is a 404.
 *
 * An implementation may return items carrying MORE fields than `FeedbackItem`
 * models (a review status, a ticket number). Those ride through untouched.
 */
export type FeedbackStore = {
  list(): Promise<FeedbackItem[]>;
  create(input: CreateInput): Promise<FeedbackItem>;
  vote(id: number, delta: number): Promise<VoteResult | null>;
  remove(id: number): Promise<{ id: number } | null>;
};

export type FusenServerOptions = {
  /** The only required seam. */
  store: FeedbackStore;
  /** Collection root. Must match the widget's `basePath`. */
  basePath?: string;
  /**
   * Identity, derived from the request (a session cookie, a bearer token…).
   *
   * The default is a fixed anonymous author, which is what makes a
   * zero-configuration demo possible. Return `null` to reject the write with
   * 401 — note the widget treats 401 like any other failure and will NOT
   * navigate the page anywhere, by design.
   */
  resolveAuthor?: (request: Request) => Author | null | Promise<Author | null>;
  /**
   * Whether this author may remove that item. Defaults to "only their own".
   *
   * This is the real permission check. It runs on every delete regardless of
   * what the client believed.
   */
  canDelete?: (item: FeedbackItem, author: Author) => boolean | Promise<boolean>;
  /**
   * How often to push a `ping` frame down an idle SSE stream, in milliseconds.
   * Proxies close connections that say nothing. 0 disables.
   */
  keepAliveMs?: number;
  /**
   * The cookie behind the DEFAULT anonymous identity — see `identity.ts`.
   *
   * `false` goes back to one shared anonymous author, which also means one
   * shared `author_key` and therefore no working delete permission. Ignored
   * entirely when `resolveAuthor` is supplied: a host with its own sessions
   * should not have this package writing cookies.
   */
  anonymousCookie?: false | AnonymousCookieOptions;
};
