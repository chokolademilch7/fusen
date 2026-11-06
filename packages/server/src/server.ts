/**
 * The protocol, as one function from `Request` to `Response`.
 *
 * WHY THIS SHAPE. "Framework independent" is usually attempted by defining an
 * adapter interface and writing one per framework, which means the list of
 * supported frameworks is finite and someone has to maintain it. `Request` and
 * `Response` are Web standards that Bun, Deno, Node 18+, Cloudflare Workers and
 * Hono already speak natively, so there is nothing to adapt for any of them —
 * and the frameworks that predate the standard (Express, Elysia) need a shim of
 * a few lines that this package does not have to own.
 *
 * `handle` returns `null` — NOT a 404 — for a path outside `basePath`. The two
 * are genuinely different answers and conflating them is the easy mistake: a
 * 404 means "this collection has no such comment", `null` means "not mine, ask
 * someone else", and a host composes it as
 *
 *     (await fusen.handle(req)) ?? myOwnRouter(req)
 */

import {
  type FeedbackItem,
  isSafeRoute,
  isVoteDelta,
  MAX_VOTE_DELTA,
  type PageContext,
} from "@fusen/core";
import { createHub, type FeedbackHub } from "./hub.ts";
import { createAnonymousIdentity } from "./identity.ts";
import { normalizeItem, normalizeItems } from "./normalize.ts";
import type { Author, FusenServerOptions } from "./types.ts";
import { isAnchor, MAX_NONCE_LENGTH, oversizedField, toAnchor } from "./validate.ts";

export const DEFAULT_BASE_PATH = "/api/feedback";

const ANONYMOUS: Author = { name: "Anonymous", key: "anonymous", picture: null };

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Bytes of request body this server will read. The caps in `validate.ts` count
 *  CHARACTERS and this counts BYTES, so it is sized for the worst spelling of a
 *  write at every cap: any character may arrive as a six-byte `\uXXXX` escape,
 *  and body + route + context + anchor + nonce is 44,944 characters, so
 *  269,664 bytes plus a few hundred of keys. A write that is merely too long
 *  therefore gets its 400 with a reason rather than a bare 413. Not covered,
 *  because nothing bounds them: insignificant whitespace, over-long number
 *  spellings, and anchor keys `toAnchor` drops. `fusen-serve` passes the same
 *  number to `Bun.serve` as `maxRequestBodySize`. */
export const MAX_REQUEST_BYTES = 320 * 1024;

const tooLarge = () => json({ error: `request body larger than ${MAX_REQUEST_BYTES} bytes` }, 413);

/** Read a JSON body, tolerating an absent one, refusing an oversized one. A
 *  refusal comes back as the `Response` to send.
 *
 *  DELETE carries its nonce in a JSON BODY rather than the URL — easy to miss,
 *  and missing it costs the realtime echo rather than the delete itself, so it
 *  fails quietly. Some clients and proxies also send DELETE with no body at
 *  all, so an empty body must not be an error. A body that FAILS part-way is
 *  different: acting on it as `{}` would act on contents never seen, so it is
 *  a 400.
 *
 *  The size is checked on the bytes actually read, not only on
 *  `content-length`, which a chunked request does not send. The nonce is
 *  capped here because every write echoes it to every SSE subscriber.
 *
 *  A non-empty body must be labelled `application/json`, or it is a 415. A
 *  cross-origin page can send a "simple" POST (`text/plain`, a form) without a
 *  preflight, and the browser attaches this origin's cookie to it; parsing
 *  that body regardless of its label would let any site write as the visitor.
 *  Requiring the JSON type forces the preflight, which this server never
 *  answers. An empty body needs no label, so a bodiless DELETE still works. */
async function readBody(request: Request): Promise<Record<string, unknown> | Response> {
  if (Number(request.headers.get("content-length")) > MAX_REQUEST_BYTES) return tooLarge();
  // A host that already read the body (a framework body parser) leaves it
  // used; that is an absent body, as before, not a failed read. `locked` is
  // the same case for a runtime that, per spec, does not count an undrained
  // reader as use (Bun does, so the test suite cannot tell the two apart).
  if (!request.body || request.bodyUsed || request.body.locked) return {};

  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    const reader = request.body.getReader();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_REQUEST_BYTES) {
        await reader.cancel();
        return tooLarge();
      }
      chunks.push(value);
    }
  } catch {
    return json({ error: "request body could not be read" }, 400);
  }
  if (size > 0 && !isJsonContentType(request.headers.get("content-type"))) {
    return json({ error: "content-type must be application/json" }, 415);
  }

  let payload: Record<string, unknown> = {};
  try {
    // A request body is never backed by a SharedArrayBuffer, which is all the
    // lib typing of `BlobPart` rules out.
    const value: unknown = JSON.parse(await new Blob(chunks as BlobPart[]).text());
    if (typeof value === "object" && value !== null) payload = value as Record<string, unknown>;
  } catch {
    // Not JSON: treated as no body, like an absent one.
  }
  if (typeof payload.nonce === "string" && payload.nonce.length > MAX_NONCE_LENGTH) {
    return json({ error: `nonce longer than ${MAX_NONCE_LENGTH} characters` }, 400);
  }
  return payload;
}

/** `application/json`, with any parameters (`; charset=utf-8`), any case. */
function isJsonContentType(header: string | null): boolean {
  return header?.split(";")[0]?.trim().toLowerCase() === "application/json";
}

function nonceOf(payload: Record<string, unknown>): string {
  return typeof payload.nonce === "string" ? payload.nonce : "";
}

export type FusenServer = {
  /** Handle one request, or return `null` if the path is not ours. */
  handle: (request: Request) => Promise<Response | null>;
  /** The realtime hub, exposed so an application can push `status_changed`
   *  frames from its own workflows. */
  hub: FeedbackHub;
  /** Collection root this instance answers on. */
  basePath: string;
};

/** Attach a `Set-Cookie` to a response, when one was minted for this request. */
function withCookie(response: Response, setCookie: string | null): Response {
  if (!setCookie) return response;
  response.headers.append("set-cookie", setCookie);
  return response;
}

export function createFusenServer(options: FusenServerOptions): FusenServer {
  const base = options.basePath ?? DEFAULT_BASE_PATH;
  const store = options.store;
  const canDelete =
    options.canDelete ?? ((item: FeedbackItem, author: Author) => item.author_key === author.key);
  const hub = createHub(options.keepAliveMs);

  // Three identities, in order of who asked for what. A host's own
  // `resolveAuthor` never has cookies written underneath it; the fixed
  // anonymous author is opt-in now, because sharing one key means sharing one
  // delete permission.
  const anonymous =
    options.anonymousCookie === false
      ? null
      : createAnonymousIdentity(options.anonymousCookie ?? {});

  async function identify(
    request: Request,
  ): Promise<{ author: Author | null; setCookie: string | null }> {
    if (options.resolveAuthor) {
      return { author: await options.resolveAuthor(request), setCookie: null };
    }
    if (!anonymous) return { author: ANONYMOUS, setCookie: null };
    return anonymous(request);
  }

  async function handle(request: Request): Promise<Response | null> {
    const path = new URL(request.url).pathname;
    if (path !== base && !path.startsWith(`${base}/`)) return null;

    const method = request.method.toUpperCase();

    if (path === `${base}/events`) {
      if (method !== "GET") return json({ error: "method not allowed" }, 405);
      return hub.stream();
    }

    // Who am I, as far as this server is concerned. The widget needs the answer
    // to decide whether to DRAW a delete button; the permission itself is still
    // checked server-side against the stored row.
    if (path === `${base}/me`) {
      if (method !== "GET") return json({ error: "method not allowed" }, 405);
      const { author, setCookie } = await identify(request);
      if (!author) return json({ error: "unauthorized" }, 401);
      return withCookie(
        json({ author: { name: author.name, key: author.key, picture: author.picture ?? null } }),
        setCookie,
      );
    }

    // `${base}/` is the same collection: a proxy set up with a trailing slash
    // (`location /api/feedback/`) forwards that form.
    if (path === base || path === `${base}/`) {
      if (method === "GET") {
        return json({ feedback: normalizeItems(await store.list()) });
      }
      if (method === "POST") {
        const { author, setCookie } = await identify(request);
        if (!author) return json({ error: "unauthorized" }, 401);
        const payload = await readBody(request);
        if (payload instanceof Response) return payload;
        // The anchor is the one field of a write that cannot be defaulted, and
        // the one whose absence is invisible until it has emptied every
        // client's panel. See validate.ts.
        if (!isAnchor(payload.anchor)) return json({ error: "invalid anchor" }, 400);
        // A comment with no text is a blank pin: the widget never sends one.
        if (typeof payload.body !== "string" || payload.body.trim() === "") {
          return json({ error: "body must be a non-empty string" }, 400);
        }
        const anchor = toAnchor(payload.anchor);
        // Both routes end up in readers' navigation hooks; refuse anything but
        // a same-origin path (no `javascript:`, no external URL).
        if (!isSafeRoute(anchor.route)) return json({ error: "invalid anchor route" }, 400);
        if (typeof payload.route === "string" && !isSafeRoute(payload.route)) {
          return json({ error: "invalid route" }, 400);
        }
        const oversized = oversizedField({ ...payload, anchor });
        if (oversized) return json({ error: oversized }, 400);
        const created = normalizeItem(
          await store.create({
            route: typeof payload.route === "string" ? payload.route : "/",
            body: payload.body,
            anchor,
            context: (payload.context ?? null) as PageContext | null,
            author,
          }),
        );
        hub.publish({ type: "created", feedback: created, nonce: nonceOf(payload) });
        return withCookie(json({ feedback: created }), setCookie);
      }
      return json({ error: "method not allowed" }, 405);
    }

    // Match on what follows `base`, so a basePath containing regex
    // metacharacters (`.`, `+`, `(`) is never compiled into a pattern.
    const rest = path.slice(base.length);
    const votes = /^\/(\d+)\/votes$/.exec(rest);
    if (votes) {
      if (method !== "POST") return json({ error: "method not allowed" }, 405);
      const { author, setCookie } = await identify(request);
      if (!author) return json({ error: "unauthorized" }, 401);
      const payload = await readBody(request);
      if (payload instanceof Response) return payload;
      // Stores apply the delta as given (`votes + ?`), so this is the only check.
      if (!isVoteDelta(payload.delta)) {
        return json({ error: `delta must be a non-zero integer within ±${MAX_VOTE_DELTA}` }, 400);
      }
      const result = await store.vote(Number(votes[1]), payload.delta);
      if (!result) return json({ error: "not found" }, 404);
      const out = { id: Number(result.id), votes: Number(result.votes) };
      hub.publish({ type: "voted", ...out, nonce: nonceOf(payload) });
      return withCookie(json(out), setCookie);
    }

    const one = /^\/(\d+)$/.exec(rest);
    if (one) {
      if (method !== "DELETE") return json({ error: "method not allowed" }, 405);
      const { author, setCookie } = await identify(request);
      if (!author) return json({ error: "unauthorized" }, 401);
      const id = Number(one[1]);
      const payload = await readBody(request);
      if (payload instanceof Response) return payload;

      // Permission is decided against the STORED row, never against anything
      // the client sent. Reading it first also distinguishes 404 from 403.
      const existing = (await store.list()).find((item) => Number(item.id) === id);
      if (!existing) return json({ error: "not found" }, 404);
      if (!(await canDelete(normalizeItem(existing), author))) {
        return json({ error: "forbidden" }, 403);
      }

      const removed = await store.remove(id);
      if (!removed) return json({ error: "not found" }, 404);
      // The reader treats a delete as CONFIRMED BY THIS FRAME, not by the HTTP
      // response — that is what stops a dropped response from resurrecting a
      // row. Skip the publish and the comment never leaves anyone's screen.
      hub.publish({ type: "deleted", id: Number(removed.id), nonce: nonceOf(payload) });
      return withCookie(json({ id: Number(removed.id) }), setCookie);
    }

    return json({ error: "not found" }, 404);
  }

  return { handle, hub, basePath: base };
}
