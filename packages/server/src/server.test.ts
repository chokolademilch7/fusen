/**
 * The contract kit, run against the store this package ships.
 *
 * The kit is the real test suite — it lives in `testkit.ts` so anyone writing
 * their own store can point it at theirs. Running it here proves the assertions
 * are satisfiable and guards the reference implementation at the same time.
 */

import { expect, test } from "bun:test";
import { createMemoryStore } from "./memory.ts";
import { createFusenServer } from "./server.ts";
import { runAuthContract, runStoreContract, runWireContract } from "./testkit.ts";

runStoreContract("memory", () => createMemoryStore());
runWireContract("memory", () => createMemoryStore());
runAuthContract("memory", () => createMemoryStore());

test("basePath is configurable, and handle() ignores everything outside it", async () => {
  const fusen = createFusenServer({ store: createMemoryStore(), basePath: "/notes" });
  expect(await fusen.handle(new Request("http://x/api/feedback"))).toBeNull();
  const res = await fusen.handle(new Request("http://x/notes"));
  expect(res?.status).toBe(200);
  fusen.hub.closeAll();
});

test("basePath with a trailing slash is the same collection", async () => {
  // A proxy configured as `location /api/feedback/` forwards this form.
  const fusen = createFusenServer({ store: createMemoryStore() });
  const anchor = {
    version: 1,
    route: "/",
    selectorPath: "p",
    fingerprint: { tag: "p", dataAttrs: {}, classList: [], textSnippet: "" },
    rectRatio: { x: 0, y: 0 },
  };
  const post = await fusen.handle(
    new Request("http://x/api/feedback/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ route: "/", body: "b", anchor, context: null }),
    }),
  );
  expect(post?.status).toBe(200);
  const list = await fusen.handle(new Request("http://x/api/feedback/"));
  expect(((await list!.json()) as { feedback: unknown[] }).feedback).toHaveLength(1);
  fusen.hub.closeAll();
});

test("a prefix that merely starts with basePath is not ours", async () => {
  // `/api/feedbackery` must fall through, not 404 — otherwise mounting the
  // widget's collection swallows a neighbouring route.
  const fusen = createFusenServer({ store: createMemoryStore() });
  expect(await fusen.handle(new Request("http://x/api/feedbackery"))).toBeNull();
  fusen.hub.closeAll();
});

test("a basePath with regex metacharacters routes literally", async () => {
  // `(` used to make the route pattern throw (a 500); `.` matched any char.
  const fusen = createFusenServer({ store: createMemoryStore(), basePath: "/a.b(c" });
  const del = (url: string) => fusen.handle(new Request(url, { method: "DELETE" }));
  expect((await del("http://x/a.b(c/1"))?.status).toBe(404);
  expect(await del("http://x/aXb(c/1")).toBeNull();
  const vote = await fusen.handle(
    new Request("http://x/a.b(c/1/votes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ delta: 1 }),
    }),
  );
  expect(vote?.status).toBe(404);
  fusen.hub.closeAll();
});

test("a write whose route or anchor.route is not a same-origin path is refused", async () => {
  // Both routes reach every reader's navigation hook.
  const fusen = createFusenServer({ store: createMemoryStore() });
  const anchorAt = (route: string) => ({
    version: 1,
    route,
    selectorPath: "p",
    fingerprint: { tag: "p", dataAttrs: {}, classList: [], textSnippet: "" },
    rectRatio: { x: 0, y: 0 },
  });
  const post = (route: string, anchorRoute: string) =>
    fusen.handle(
      new Request("http://x/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ route, body: "b", anchor: anchorAt(anchorRoute), context: null }),
      }),
    );
  expect((await post("/", "javascript:alert(1)"))?.status).toBe(400);
  expect((await post("https://evil.example", "/"))?.status).toBe(400);
  expect((await post("/", "//evil.example"))?.status).toBe(400);
  expect((await post("/watch/1", "/watch/1"))?.status).toBe(200);
  fusen.hub.closeAll();
});
