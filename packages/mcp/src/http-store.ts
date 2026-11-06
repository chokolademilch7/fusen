/**
 * A `FeedbackStore` backed by a remote fusen server.
 *
 * This is what lets one MCP server serve two very different deployments without
 * a second code path. `@fusen/server` already defines the store interface, so
 * the tools are written against THAT — and a store is either the real one (the
 * MCP server runs inside the application, reading the database directly) or this
 * one (the MCP server runs anywhere and talks to the application's HTTP
 * surface). Same tools, same assertions, two supply routes.
 *
 * Reading over HTTP means the MCP server never needs the database schema, which
 * is the point: the protocol is the contract, and any server that speaks it —
 * the demo, or the application this widget was extracted from — can be pointed
 * at without adaptation.
 *
 * `fetch` is injectable so the tools can be tested against a `createFusenServer`
 * instance in-process, with no port and no network.
 */

import type { FeedbackItem } from "@fusen/core";
import type { CreateInput, FeedbackStore, VoteResult } from "@fusen/server";

export type HttpStoreOptions = {
  /** Origin + collection root, e.g. `http://localhost:8400/api/feedback`. */
  baseUrl: string;
  /** Injected for tests, or to add auth headers / a proxy agent. */
  fetch?: (request: Request) => Promise<Response>;
  /** Extra headers on every call — a session cookie or bearer token. */
  headers?: Record<string, string>;
};

/**
 * `FUSEN_HEADERS`, checked. `JSON.parse` alone accepts `[]`, `"x"`, `null` and
 * `{"a":1}`, all of which would reach `Request` as nonsense (an array spreads
 * into `{"0": …}`, a number is not a header value). Returns the headers, or an
 * error message for the caller to print — never throws.
 */
export function parseHeadersEnv(
  raw: string,
): { ok: true; headers: Record<string, string> } | { ok: false; error: string } {
  const error = {
    ok: false as const,
    error: 'FUSEN_HEADERS must be a JSON object of string values, e.g. {"cookie":"…"}',
  };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return error;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return error;
  if (!Object.values(parsed).every((value) => typeof value === "string")) return error;
  return { ok: true, headers: parsed as Record<string, string> };
}

function nonce(): string {
  // Distinct from any browser's nonces; the writer here is not a page, so there
  // is no echo to suppress. It still has to be present and unique.
  return `mcp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Only a 404 is "not found". Anything else — a rejected delta (400), no session
 * (401), forbidden (403), too large (413), a 5xx, no network — is rethrown, so
 * the tool reports the real failure and its hint instead of a missing comment.
 */
function notFound(error: unknown): null {
  if ((error as { status?: number } | undefined)?.status === 404) return null;
  throw error;
}

export function createHttpStore(options: HttpStoreOptions): FeedbackStore {
  const base = options.baseUrl.replace(/\/$/, "");
  const call = options.fetch ?? ((request: Request) => fetch(request));

  async function json(path: string, init?: RequestInit): Promise<unknown> {
    // Spreading undefined is already a no-op, so the `?? {}` fallbacks were noise.
    const headers = { ...options.headers, ...(init?.headers as object | undefined) };
    const res = await call(new Request(`${base}${path}`, { ...init, headers }));
    if (!res.ok)
      throw Object.assign(new Error(`${base}${path}: ${res.status}`), { status: res.status });
    return res.json();
  }

  function body(method: string, payload: unknown): RequestInit {
    return {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    };
  }

  return {
    async list(): Promise<FeedbackItem[]> {
      const result = (await json("")) as { feedback?: FeedbackItem[] };
      if (!Array.isArray(result.feedback)) throw new Error(`${base}: malformed response`);
      return result.feedback;
    },

    async create(input: CreateInput): Promise<FeedbackItem> {
      // The remote server decides the author from the request, exactly as it
      // does for a browser. `input.author` is therefore NOT sent: an MCP client
      // that could name its own author would be an impersonation seam.
      const result = (await json(
        "",
        body("POST", {
          route: input.route,
          body: input.body,
          anchor: input.anchor,
          context: input.context,
          nonce: nonce(),
        }),
      )) as { feedback: FeedbackItem };
      return result.feedback;
    },

    async vote(id: number, delta: number): Promise<VoteResult | null> {
      try {
        const result = (await json(
          `/${id}/votes`,
          body("POST", { delta, nonce: nonce() }),
        )) as VoteResult;
        return { id: Number(result.id), votes: Number(result.votes) };
      } catch (error) {
        return notFound(error);
      }
    },

    async remove(id: number): Promise<{ id: number } | null> {
      try {
        const result = (await json(`/${id}`, body("DELETE", { nonce: nonce() }))) as { id: number };
        return { id: Number(result.id) };
      } catch (error) {
        return notFound(error);
      }
    },
  };
}
