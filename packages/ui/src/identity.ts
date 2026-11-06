/**
 * Which comments are mine.
 *
 * `authorKey` decides whether a delete button is drawn and nothing else — the
 * server checks the real permission against the stored row. Historically the
 * host filled it in, because the host was the only one who knew who was logged
 * in. With `@fusen/server`'s cookie-backed anonymous default nobody is logged
 * in and the key sits in an HttpOnly cookie, so the page cannot read it: the
 * widget asks the server instead, through the same `FeedbackHttp` seam it uses
 * for everything else.
 *
 * A failure here is not fatal and must not be treated as one. An empty key
 * means no delete buttons; reading and writing comments still work.
 */

import type { FeedbackHttp } from "./types.ts";

export async function resolveAuthorKey(current: string, http: FeedbackHttp): Promise<string> {
  if (current) return current;
  if (!http.me) return "";
  try {
    return (await http.me()).key;
  } catch {
    return "";
  }
}
