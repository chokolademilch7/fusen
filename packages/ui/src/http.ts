/**
 * The default `FeedbackHttp`: a plain `fetch` client for the five-route shape
 * this widget's protocol has always used.
 *
 *   GET    {basePath}            → { feedback: FeedbackItem[] }
 *   POST   {basePath}            → { feedback: FeedbackItem }
 *   POST   {basePath}/:id/votes  → { id, votes }
 *   DELETE {basePath}/:id        → { id }
 *   GET    {basePath}/me         → { author: { key, name } }
 *
 * `me` is the newest and the only optional one: it exists so the widget can
 * learn its own `authorKey` when nobody configured one, which is the normal
 * case against the server's cookie-backed anonymous default. A transport that
 * has no such notion simply omits it — see `identity.ts`.
 *
 * Two deliberate non-features:
 *
 * 1. It does NOT handle 401 specially. The app this widget came from redirected
 *    to a login shell from inside its shared request helper; a widget that
 *    navigates its host away is a widget that cannot be embedded. A 401 rejects
 *    like any other non-OK status, and a host that wants a redirect (or a token
 *    refresh, or a modal) supplies its own `FeedbackHttp` and does it there.
 * 2. It does NOT validate with a schema library. The checks below are the
 *    minimum that turns a malformed body into a rejected promise instead of a
 *    downstream `undefined`; hosts wanting contract-grade validation pass their
 *    own implementation, which is exactly the point of the seam.
 */

import type { Anchor, FeedbackHttp, FeedbackItem, PageContext } from "./types.ts";

export type FetchHttpOptions = {
  /** Collection root. Defaults to `/api/feedback`. */
  basePath?: string;
};

export const DEFAULT_BASE_PATH = "/api/feedback";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** An item is usable if the fields the widget itself reads are present and of
 *  the right kind. Application-specific extras are passed through unchecked —
 *  they are not this package's vocabulary to police. */
function isFeedbackItem(value: unknown): value is FeedbackItem {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "number" &&
    typeof value.route === "string" &&
    typeof value.body === "string" &&
    isRecord(value.anchor) &&
    typeof value.author_name === "string" &&
    typeof value.author_key === "string" &&
    typeof value.votes === "number" &&
    typeof value.created_at === "string"
  );
}

async function readJson(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(path, init);
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}

function jsonBody(method: string, body: unknown): RequestInit {
  return { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}

function malformed(path: string): Error {
  return new Error(`${path}: malformed response`);
}

export function createFetchHttp(options: FetchHttpOptions = {}): FeedbackHttp {
  const base = options.basePath ?? DEFAULT_BASE_PATH;

  return {
    async list() {
      const json = await readJson(base);
      if (!isRecord(json) || !Array.isArray(json.feedback)) throw malformed(base);
      const feedback = json.feedback.filter(isFeedbackItem);
      if (feedback.length !== json.feedback.length) throw malformed(base);
      return { feedback };
    },

    async create(
      route: string,
      body: string,
      anchor: Anchor,
      context: PageContext | null,
      nonce: string,
    ) {
      const json = await readJson(base, jsonBody("POST", { route, body, anchor, context, nonce }));
      if (!isRecord(json) || !isFeedbackItem(json.feedback)) throw malformed(base);
      return { feedback: json.feedback };
    },

    async vote(id: number, delta: number, nonce: string) {
      const path = `${base}/${id}/votes`;
      const json = await readJson(path, jsonBody("POST", { delta, nonce }));
      if (!isRecord(json) || typeof json.id !== "number" || typeof json.votes !== "number") {
        throw malformed(path);
      }
      return { id: json.id, votes: json.votes };
    },

    async remove(id: number, nonce: string) {
      const path = `${base}/${id}`;
      const json = await readJson(path, jsonBody("DELETE", { nonce }));
      if (!isRecord(json) || typeof json.id !== "number") throw malformed(path);
      return { id: json.id };
    },

    async me() {
      const path = `${base}/me`;
      const json = await readJson(path);
      if (
        !isRecord(json) ||
        !isRecord(json.author) ||
        typeof json.author.key !== "string" ||
        typeof json.author.name !== "string"
      ) {
        throw malformed(path);
      }
      return { key: json.author.key, name: json.author.name };
    },
  };
}
