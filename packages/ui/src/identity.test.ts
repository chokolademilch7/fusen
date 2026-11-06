/**
 * How the widget learns which comments are its own.
 *
 * `authorKey` has always been a host-supplied string, and it decides one thing:
 * whether a delete button is DRAWN. With the server's cookie-backed anonymous
 * default the host has nothing to supply — the key lives in an HttpOnly cookie
 * the page cannot read — so the widget asks the server for it.
 *
 * The element wiring itself (one call in `connectedCallback`) is in the same
 * un-unit-testable bucket as the rest of the custom element; what is tested
 * here is the seam it calls.
 */

import { afterEach, describe, expect, mock, test } from "bun:test";
import { createFetchHttp } from "./http.ts";
import { resolveAuthorKey } from "./identity.ts";
import type { FeedbackHttp } from "./types.ts";

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

function stubFetch(response: Response): ReturnType<typeof mock> {
  const fake = mock(async () => response);
  globalThis.fetch = fake as unknown as typeof fetch;
  return fake;
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** A store-shaped stub: only `me` matters here. */
function httpWith(me: FeedbackHttp["me"]): FeedbackHttp {
  return {
    list: async () => ({ feedback: [] }),
    create: async () => {
      throw new Error("not used");
    },
    vote: async () => {
      throw new Error("not used");
    },
    remove: async () => {
      throw new Error("not used");
    },
    ...(me ? { me } : {}),
  };
}

describe("createFetchHttp().me", () => {
  test("reads the author from {basePath}/me", async () => {
    const fake = stubFetch(json({ author: { key: "abc123", name: "Guest-abc1" } }));

    const author = await createFetchHttp().me!();

    expect(fake.mock.calls[0]![0]).toBe("/api/feedback/me");
    expect(author).toEqual({ key: "abc123", name: "Guest-abc1" });
  });

  test("follows a configured basePath", async () => {
    const fake = stubFetch(json({ author: { key: "k", name: "n" } }));
    await createFetchHttp({ basePath: "/notes" }).me!();
    expect(fake.mock.calls[0]![0]).toBe("/notes/me");
  });

  test("a body without an author is malformed, not an undefined key", async () => {
    stubFetch(json({ nope: true }));
    expect(createFetchHttp().me!()).rejects.toThrow("malformed response");
  });

  test("a non-OK status rejects", async () => {
    stubFetch(json({ error: "unauthorized" }, 401));
    expect(createFetchHttp().me!()).rejects.toThrow("401");
  });
});

describe("resolveAuthorKey", () => {
  test("a key the host supplied is kept, and nothing is asked of the server", async () => {
    const me = mock(async () => ({ key: "server", name: "n" }));

    expect(await resolveAuthorKey("host-key", httpWith(me))).toBe("host-key");
    expect(me).not.toHaveBeenCalled();
  });

  test("an empty key is filled from the server", async () => {
    const http = httpWith(async () => ({ key: "server-key", name: "Guest-serv" }));
    expect(await resolveAuthorKey("", http)).toBe("server-key");
  });

  test("a transport with no identity route leaves the key empty", async () => {
    expect(await resolveAuthorKey("", httpWith(undefined))).toBe("");
  });

  test("a failing lookup leaves the key empty rather than breaking the widget", async () => {
    const http = httpWith(async () => {
      throw new Error("offline");
    });
    expect(await resolveAuthorKey("", http)).toBe("");
  });
});
