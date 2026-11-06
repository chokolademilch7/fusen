/**
 * Who the writer is, when nobody configured an answer.
 *
 * The old default was one fixed anonymous author, which made the default
 * `canDelete` ("only your own") pass for everybody. With a memory store the
 * evidence vanished on restart; with a file it does not. These tests pin the
 * cookie-backed default, and the `/me` route the widget reads its own key from.
 * The published key is the cookie's hash; the leak it closes is pinned in
 * `testkit.ts`'s auth contract.
 */

import { describe, expect, test } from "bun:test";
import type { Anchor } from "@fusen/core";
import { createAnonymousIdentity, publicKeyFor } from "./identity.ts";
import { createMemoryStore } from "./memory.ts";
import { createFusenServer } from "./server.ts";
import type { Author } from "./types.ts";

const anchor: Anchor = {
  version: 1,
  route: "/",
  selectorPath: "#a > p",
  fingerprint: { tag: "p", dataAttrs: {}, classList: [], textSnippet: "hello" },
  rectRatio: { x: 0.5, y: 0.5 },
};

function req(url: string, init?: RequestInit): Request {
  return new Request(`http://localhost${url}`, init);
}

function createInit(cookie?: string): RequestInit {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cookie) headers.cookie = cookie;
  return {
    method: "POST",
    headers,
    body: JSON.stringify({ route: "/", body: "b", anchor, context: null, nonce: "n" }),
  };
}

/** The `name=value` pair of a Set-Cookie header, ready to send back. */
function cookiePair(response: Response): string {
  const header = response.headers.get("set-cookie");
  if (!header) throw new Error("no Set-Cookie on the response");
  return header.split(";")[0]!;
}

function fusen(options: Partial<Parameters<typeof createFusenServer>[0]> = {}) {
  return createFusenServer({ store: createMemoryStore(), ...options });
}

describe("anonymous identity", () => {
  test("a first write is given a cookie, and the row is stamped with its hash, never the secret", async () => {
    const server = fusen();

    const created = (await server.handle(req("/api/feedback", createInit())))!;
    const pair = cookiePair(created);
    const item = ((await created.json()) as { feedback: { author_key: string } }).feedback;
    const secret = pair.slice("fusen_author=".length);

    expect(pair.startsWith("fusen_author=")).toBe(true);
    expect(item.author_key).toBe(await publicKeyFor(secret));
    expect(item.author_key).not.toBe(secret);
    expect(item.author_key).not.toBe("anonymous");
  });

  test("a cookie the server did not mint is replaced, not adopted as a key", async () => {
    const server = fusen();
    const chosen = "a".repeat(64);

    const created = (await server.handle(
      req("/api/feedback", createInit(`fusen_author=${chosen}`)),
    ))!;
    const item = ((await created.json()) as { feedback: { author_key: string } }).feedback;

    expect(created.headers.get("set-cookie")).toStartWith("fusen_author=");
    expect(item.author_key).not.toBe(chosen);
    expect(item.author_key).not.toBe(await publicKeyFor(chosen));
  });

  test("a returning writer keeps the same key, and is not issued another cookie", async () => {
    const server = fusen();
    const first = (await server.handle(req("/api/feedback", createInit())))!;
    const pair = cookiePair(first);
    const firstKey = ((await first.json()) as { feedback: { author_key: string } }).feedback
      .author_key;

    const second = (await server.handle(req("/api/feedback", createInit(pair))))!;
    const secondKey = ((await second.json()) as { feedback: { author_key: string } }).feedback
      .author_key;

    expect(secondKey).toBe(firstKey);
    expect(second.headers.get("set-cookie")).toBeNull();
  });

  test("two anonymous people get different keys", async () => {
    const server = fusen();
    const a = cookiePair((await server.handle(req("/api/feedback", createInit())))!);
    const b = cookiePair((await server.handle(req("/api/feedback", createInit())))!);
    expect(a).not.toBe(b);
  });

  test("one anonymous person cannot delete another's comment", async () => {
    const server = fusen();
    const mine = (await server.handle(req("/api/feedback", createInit())))!;
    const id = ((await mine.json()) as { feedback: { id: number } }).feedback.id;
    const stranger = cookiePair((await server.handle(req("/api/feedback", createInit())))!);

    const refused = (await server.handle(
      req(`/api/feedback/${id}`, {
        method: "DELETE",
        headers: { "content-type": "application/json", cookie: stranger },
        body: JSON.stringify({ nonce: "x" }),
      }),
    ))!;

    expect(refused.status).toBe(403);
  });

  test("the author of a comment can delete it", async () => {
    const server = fusen();
    const mine = (await server.handle(req("/api/feedback", createInit())))!;
    const pair = cookiePair(mine);
    const id = ((await mine.json()) as { feedback: { id: number } }).feedback.id;

    const removed = (await server.handle(
      req(`/api/feedback/${id}`, {
        method: "DELETE",
        headers: { "content-type": "application/json", cookie: pair },
        body: JSON.stringify({ nonce: "x" }),
      }),
    ))!;

    expect(removed.status).toBe(200);
  });

  test("the cookie is HttpOnly and SameSite=Lax, and plain http does not claim Secure", async () => {
    const server = fusen();
    const created = (await server.handle(req("/api/feedback", createInit())))!;
    const header = created.headers.get("set-cookie")!;

    expect(header).toContain("HttpOnly");
    expect(header).toContain("SameSite=Lax");
    expect(header).toContain("Path=/");
    expect(header).not.toContain("Secure");
  });

  test("over https the cookie is Secure", async () => {
    const server = fusen();
    const created = (await server.handle(
      new Request("https://example.com/api/feedback", createInit()),
    ))!;
    expect(created.headers.get("set-cookie")).toContain("Secure");
  });

  test("behind a TLS proxy, X-Forwarded-Proto: https makes the cookie Secure", async () => {
    // `fusen-serve` is reached at http://127.0.0.1; only the proxy knows the
    // browser used https. The first value of a list is the browser's hop.
    const server = fusen();
    const cookieFor = async (proto: string) => {
      const init = createInit();
      (init.headers as Record<string, string>)["x-forwarded-proto"] = proto;
      return (await server.handle(req("/api/feedback", init)))!.headers.get("set-cookie")!;
    };
    expect(await cookieFor("https")).toContain("Secure");
    expect(await cookieFor("https, http")).toContain("Secure");
    expect(await cookieFor("http, https")).not.toContain("Secure");
  });

  test("a host that resolves its own author is not given cookies", async () => {
    const author: Author = { name: "The user", key: "session-1", picture: null };
    const server = fusen({ resolveAuthor: () => author });

    const created = (await server.handle(req("/api/feedback", createInit())))!;
    const item = ((await created.json()) as { feedback: { author_key: string } }).feedback;

    expect(created.headers.get("set-cookie")).toBeNull();
    expect(item.author_key).toBe("session-1");
  });

  test("anonymousCookie: false restores the one shared anonymous author", async () => {
    const server = fusen({ anonymousCookie: false });

    const created = (await server.handle(req("/api/feedback", createInit())))!;
    const item = ((await created.json()) as { feedback: { author_key: string } }).feedback;

    expect(created.headers.get("set-cookie")).toBeNull();
    expect(item.author_key).toBe("anonymous");
  });

  test("the shared anonymous author cannot delete, so nobody deletes anybody's note", async () => {
    const server = fusen({ anonymousCookie: false });
    const created = (await server.handle(req("/api/feedback", createInit())))!;
    const { id } = ((await created.json()) as { feedback: { id: number } }).feedback;
    const del = (await server.handle(req(`/api/feedback/${id}`, { method: "DELETE" })))!;
    expect(del.status).toBe(403);
    const list = (await (await server.handle(req("/api/feedback")))!.json()) as {
      feedback: unknown[];
    };
    expect(list.feedback).toHaveLength(1);
    // No delete button the server would refuse: /me hands out a key no row has.
    const me = (await (await server.handle(req("/api/feedback/me")))!.json()) as {
      author: { key: string };
    };
    expect(me.author.key).toBe("");

    // Same key from a host's own resolver: same refusal.
    const hosted = fusen({ resolveAuthor: () => ({ name: "x", key: "anonymous", picture: null }) });
    const theirs = (await hosted.handle(req("/api/feedback", createInit())))!;
    const theirsId = ((await theirs.json()) as { feedback: { id: number } }).feedback.id;
    expect(
      (await hosted.handle(req(`/api/feedback/${theirsId}`, { method: "DELETE" })))!.status,
    ).toBe(403);

    const allowed = fusen({ anonymousCookie: false, canDelete: () => true });
    const mine = (await allowed.handle(req("/api/feedback", createInit())))!;
    const mineId = ((await mine.json()) as { feedback: { id: number } }).feedback.id;
    const ok = (await allowed.handle(req(`/api/feedback/${mineId}`, { method: "DELETE" })))!;
    expect(ok.status).toBe(200);
  });

  test("the cookie name is configurable", async () => {
    const server = fusen({ anonymousCookie: { name: "my_id" } });
    const created = (await server.handle(req("/api/feedback", createInit())))!;
    expect(created.headers.get("set-cookie")).toContain("my_id=");
  });
});

describe("GET {basePath}/me", () => {
  test("hands back an author and issues the cookie that names them", async () => {
    const server = fusen();

    const response = (await server.handle(req("/api/feedback/me")))!;
    const pair = cookiePair(response);
    const body = (await response.json()) as { author: { key: string; name: string } };

    expect(response.status).toBe(200);
    expect(body.author.key).toBe(await publicKeyFor(pair.slice("fusen_author=".length)));
    expect(body.author.name.length).toBeGreaterThan(0);
  });

  test("a request that already has the cookie gets the same key back", async () => {
    const server = fusen();
    const first = (await server.handle(req("/api/feedback/me")))!;
    const pair = cookiePair(first);
    const firstKey = ((await first.json()) as { author: { key: string } }).author.key;

    const second = (await server.handle(req("/api/feedback/me", { headers: { cookie: pair } })))!;
    const secondKey = ((await second.json()) as { author: { key: string } }).author.key;

    expect(secondKey).toBe(firstKey);
    expect(second.headers.get("set-cookie")).toBeNull();
  });

  test("two anonymous readers are given different names", async () => {
    const server = fusen();
    const a = (await (await server.handle(req("/api/feedback/me")))!.json()) as {
      author: { name: string };
    };
    const b = (await (await server.handle(req("/api/feedback/me")))!.json()) as {
      author: { name: string };
    };
    expect(a.author.name).not.toBe(b.author.name);
  });

  test("reports the host's own author when one is configured", async () => {
    const server = fusen({ resolveAuthor: () => ({ name: "The user", key: "session-1" }) });
    const body = (await (await server.handle(req("/api/feedback/me")))!.json()) as {
      author: { key: string; name: string; picture: string | null };
    };
    expect(body.author).toEqual({ key: "session-1", name: "The user", picture: null });
  });

  test("a rejected identity is 401, not an anonymous fallback", async () => {
    const server = fusen({ resolveAuthor: () => null });
    const response = (await server.handle(req("/api/feedback/me")))!;
    expect(response.status).toBe(401);
  });

  test("only GET is allowed", async () => {
    const server = fusen();
    const response = (await server.handle(req("/api/feedback/me", { method: "POST" })))!;
    expect(response.status).toBe(405);
  });
});

describe("createAnonymousIdentity namePrefix", () => {
  test("replaces the default name prefix", async () => {
    const identify = createAnonymousIdentity({ namePrefix: "Visitor" });
    const { author } = await identify(new Request("http://x/"));
    expect(author.name).toMatch(/^Visitor-[0-9a-f]{4}$/);
  });
});
