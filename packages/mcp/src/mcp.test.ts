/**
 * The tools, and the loop that proves the two supply routes are the same one.
 *
 * `createHttpStore` is pointed at a real `createFusenServer` by injecting its
 * `handle` as `fetch` — no port, no network, and no mock of the protocol. That
 * is the only way to show the HTTP store and an in-process store are
 * interchangeable, which is the claim the whole package rests on.
 */

import { describe, expect, test } from "bun:test";
import type { Anchor, FeedbackItem } from "@fusen/core";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  createFusenServer,
  createMemoryStore,
  type FeedbackStore,
  MAX_VOTE_DELTA,
} from "@fusen/server";
import { createHttpStore, parseHeadersEnv } from "./http-store.ts";
import { createFusenMcpServer } from "./server.ts";
import { getFeedback, listFeedback, summarizeRoutes } from "./tools.ts";

const anchor: Anchor = {
  version: 1,
  route: "/watch/1",
  selectorPath: "#player > .title",
  fingerprint: { tag: "h1", dataAttrs: {}, classList: ["title"], textSnippet: "Title" },
  rectRatio: { x: 0.5, y: 0.5 },
};

async function seed(store: FeedbackStore): Promise<void> {
  const author = { name: "Writer", key: "writer", picture: null };
  await store.create({
    route: "/watch/1",
    body: "The audio is too quiet",
    anchor,
    context: null,
    author,
  });
  await store.create({
    route: "/watch/1",
    // CJK text: search must match characters, not bytes. "\u5b57\u5e55" is "subtitles".
    body: "The \u5b57\u5e55 (subtitles) are out of sync",
    anchor,
    context: null,
    author,
  });
  await store.create({
    route: "/",
    body: "The navigation on the top page is hard to follow",
    anchor,
    context: null,
    author,
  });
}

/** The same suite, run against a direct store and against one that reaches a
 *  real server over the protocol. */
function runToolContract(name: string, makeStore: () => Promise<FeedbackStore>): void {
  describe(`fusen MCP tools: ${name}`, () => {
    test("list returns every comment, newest first, with a readable location", async () => {
      const store = await makeStore();
      const result = await listFeedback(store);
      expect(result.total).toBe(3);
      expect(result.returned).toBe(3);
      expect(result.feedback[0]!.body).toBe("The navigation on the top page is hard to follow");
      // The anchor is the interesting part of a fusen comment, and a nested
      // object is not something to hand a model raw.
      expect(typeof result.feedback[0]!.location).toBe("string");
      expect(result.feedback[0]!.location.length).toBeGreaterThan(0);
    });

    test("filters by route", async () => {
      const store = await makeStore();
      const result = await listFeedback(store, { route: "/watch/1" });
      expect(result.total).toBe(2);
      expect(result.feedback.every((item) => item.route === "/watch/1")).toBe(true);
    });

    test("filters by substring of the text", async () => {
      const store = await makeStore();
      expect((await listFeedback(store, { query: "\u5b57\u5e55" })).total).toBe(1);
      expect((await listFeedback(store, { query: "ZIMAKU" })).total).toBe(0);
    });

    test("truncation is reported, not hidden", async () => {
      // A model that cannot see it was cut off concludes it read everything.
      const store = await makeStore();
      const result = await listFeedback(store, { limit: 1 });
      expect(result.total).toBe(3);
      expect(result.returned).toBe(1);
      expect(result.feedback).toHaveLength(1);
    });

    test("get returns the raw anchor and snapshot, or null", async () => {
      const store = await makeStore();
      const listed = await listFeedback(store);
      const one = await getFeedback(store, listed.feedback[0]!.id);
      // These stores read one collection, so ids are unique and a single detail
      // comes back. The `ambiguous` shape only appears for a store reading
      // several browser tabs at once — see the case below.
      expect(one).not.toBeNull();
      expect(one).not.toHaveProperty("ambiguous");
      expect((one as { anchor: unknown }).anchor).toMatchObject({
        selectorPath: anchor.selectorPath,
      });
      expect(one).toHaveProperty("context");
      expect(await getFeedback(store, 999_999)).toBeNull();
    });

    test("route summary counts comments and votes, busiest first", async () => {
      const store = await makeStore();
      const { routes } = await summarizeRoutes(store);
      expect(routes[0]).toMatchObject({ route: "/watch/1", count: 2 });
      expect(routes[1]).toMatchObject({ route: "/", count: 1 });
    });
  });
}

runToolContract("in-process store", async () => {
  const store = createMemoryStore();
  await seed(store);
  return store;
});

runToolContract("over the protocol", async () => {
  const backing = createMemoryStore();
  await seed(backing);
  const fusen = createFusenServer({ store: backing });
  return createHttpStore({
    baseUrl: "http://server.test/api/feedback",
    // The server IS the transport. Anything it does not claim would be a bug in
    // the store's URLs, so surface that rather than falling through.
    fetch: async (request) => {
      const res = await fusen.handle(request);
      if (!res) throw new Error(`unrouted: ${request.method} ${request.url}`);
      return res;
    },
  });
});

describe("http store: writes", () => {
  test("does not send an author — the server decides who is writing", async () => {
    // An MCP client that could name its own author would be an impersonation
    // seam. The server stamps identity from the request, exactly as for a
    // browser.
    const backing = createMemoryStore();
    const fusen = createFusenServer({
      store: backing,
      resolveAuthor: () => ({
        name: "Server-decided author",
        key: "server-decided",
        picture: null,
      }),
    });
    const store = createHttpStore({
      baseUrl: "http://server.test/api/feedback",
      fetch: async (request) => (await fusen.handle(request))!,
    });

    const created = await store.create({
      route: "/",
      body: "from mcp",
      anchor,
      context: null,
      author: { name: "Impostor", key: "impostor", picture: null },
    });
    expect(created.author_key).toBe("server-decided");
    expect(created.author_name).toBe("Server-decided author");
    fusen.hub.closeAll();
  });

  test("a missing id is null rather than a throw, on both write paths", async () => {
    const fusen = createFusenServer({ store: createMemoryStore() });
    const store = createHttpStore({
      baseUrl: "http://server.test/api/feedback",
      fetch: async (request) => (await fusen.handle(request))!,
    });
    expect(await store.vote(999_999, 1)).toBeNull();
    expect(await store.remove(999_999)).toBeNull();
    fusen.hub.closeAll();
  });

  test("a rejected delta on an existing comment throws instead of reading as not found", async () => {
    const fusen = createFusenServer({ store: createMemoryStore() });
    const store = createHttpStore({
      baseUrl: "http://server.test/api/feedback",
      fetch: async (request) => (await fusen.handle(request))!,
    });
    await seed(store);
    await expect(store.vote(1, MAX_VOTE_DELTA + 1)).rejects.toThrow(": 400");
    fusen.hub.closeAll();
  });

  test("only a 404 is null: auth, permission, size, server and network failures throw", async () => {
    const failing = (status: number) =>
      createHttpStore({
        baseUrl: "http://server.test/api/feedback",
        fetch: async () => new Response("{}", { status }),
      });
    for (const status of [401, 403, 413, 500, 503]) {
      await expect(failing(status).vote(1, 1)).rejects.toThrow(`: ${status}`);
      await expect(failing(status).remove(1)).rejects.toThrow(`: ${status}`);
    }
    const offline = createHttpStore({
      baseUrl: "http://server.test/api/feedback",
      fetch: async () => {
        throw new TypeError("fetch failed");
      },
    });
    await expect(offline.vote(1, 1)).rejects.toThrow("fetch failed");
    await expect(offline.remove(1)).rejects.toThrow("fetch failed");
  });

  test("a 404 on the whole collection keeps the unavailable hint (wrong base path)", async () => {
    const store = createHttpStore({
      baseUrl: "http://server.test/wrong/path",
      fetch: async () => new Response("not found", { status: 404 }),
    });
    const server = createFusenMcpServer({ store, unavailableHint: "HINT" });
    const client = new Client({ name: "test", version: "0" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(a), client.connect(b)]);

    const result = await client.callTool({ name: "fusen_list_feedback", arguments: {} });
    const answer = JSON.parse((result.content as { text: string }[])[0]!.text);
    expect(answer.hint).toBe("HINT");
    await client.close();
  });

  test("a forbidden delete reaches the model as an error, not as a missing comment", async () => {
    // The real server's 403 path: the row exists, its author is someone else.
    const backing = createMemoryStore();
    await seed(backing);
    const fusen = createFusenServer({
      store: backing,
      resolveAuthor: () => ({ name: "Someone else", key: "someone-else", picture: null }),
    });
    const store = createHttpStore({
      baseUrl: "http://server.test/api/feedback",
      fetch: async (request) => (await fusen.handle(request))!,
    });
    const server = createFusenMcpServer({ store, allowWrite: true, unavailableHint: "HINT" });
    const client = new Client({ name: "test", version: "0" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(a), client.connect(b)]);

    const result = await client.callTool({ name: "fusen_delete_feedback", arguments: { id: 1 } });
    const answer = JSON.parse((result.content as { text: string }[])[0]!.text);
    expect(answer.error).toContain(": 403");
    // The server answered, so "cannot reach the server" would mislead.
    expect(answer.hint).toBeUndefined();
    expect((await backing.list()).some((i) => i.id === 1)).toBe(true);
    await client.close();
    fusen.hub.closeAll();
  });
});

describe("fusen_vote_feedback", () => {
  test("an out-of-range delta is a validation error and never reaches the store", async () => {
    const store = createMemoryStore();
    await seed(store);
    const server = createFusenMcpServer({ store, allowWrite: true });
    const client = new Client({ name: "test", version: "0" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(a), client.connect(b)]);

    for (const delta of [0, MAX_VOTE_DELTA + 1, -MAX_VOTE_DELTA - 1]) {
      const result = await client.callTool({
        name: "fusen_vote_feedback",
        arguments: { id: 1, delta },
      });
      expect(result.isError).toBe(true);
    }
    expect((await store.list()).find((i) => i.id === 1)!.votes).toBe(0);
    await client.close();
  });
});

describe("several browser tabs at once", () => {
  /**
   * The browser store reads every open fusen page, and those pages are separate
   * IndexedDB origins: each numbers its comments from 1, and each may call its
   * route "/". Observed on the three examples — all three came back as
   * `id: 1, route: "/"`, an indistinguishable pile. `source_url` is what the
   * store attaches to keep them apart.
   */
  function multiTabStore(): FeedbackStore {
    const page = (url: string, body: string): FeedbackItem => ({
      id: 1,
      route: "/",
      body,
      anchor,
      context: null,
      author_name: "You",
      author_picture: null,
      author_key: "local",
      votes: 0,
      created_at: "2026-08-12T00:00:00.000Z",
      source_url: url,
    });
    const items = [
      page("http://localhost:8501/", "note from plain"),
      page("http://localhost:8502/", "note from react"),
    ];
    return {
      list: async () => items,
      create: async () => {
        throw new Error("read only");
      },
      vote: async () => null,
      remove: async () => null,
    };
  }

  test("the summary keeps the pages apart instead of collapsing them", async () => {
    const { routes } = await summarizeRoutes(multiTabStore());
    expect(routes).toHaveLength(2);
    expect(routes.map((r) => r.source).sort()).toEqual([
      "http://localhost:8501/",
      "http://localhost:8502/",
    ]);
    // The failure this guards: one line reading `route: "/", count: 2`, which
    // says two comments on one page when it is one comment on each of two.
    expect(routes.every((r) => r.count === 1)).toBe(true);
  });

  test("each listed comment says which page it came from", async () => {
    const { feedback } = await listFeedback(multiTabStore());
    expect(feedback.map((item) => item.source)).toEqual([
      "http://localhost:8501/",
      "http://localhost:8502/",
    ]);
  });

  test("an id that exists on two pages returns both rather than guessing", async () => {
    const found = await getFeedback(multiTabStore(), 1);
    expect(found).toHaveProperty("ambiguous");
    expect((found as { ambiguous: unknown[] }).ambiguous).toHaveLength(2);
  });

  test("naming the page resolves the ambiguity", async () => {
    const found = await getFeedback(multiTabStore(), 1, "http://localhost:8502/");
    expect(found).not.toHaveProperty("ambiguous");
    expect((found as { body: string }).body).toBe("note from react");
  });
});

describe("rows from readers that do not sort or are incomplete", () => {
  const row = (
    id: number,
    created_at: string,
    extra: Partial<FeedbackItem> = {},
  ): FeedbackItem => ({
    id,
    route: "/",
    body: `#${id}`,
    anchor,
    context: null,
    author_name: "You",
    author_picture: null,
    author_key: "local",
    votes: 0,
    created_at,
    ...extra,
  });
  const reader = (items: FeedbackItem[]) => ({ list: async () => items });

  test("list is newest first across tabs, not in concatenation order", async () => {
    // Two tabs, each newest-first within itself, concatenated as CDP does.
    const items = [
      row(2, "2026-08-12T00:00:02.000Z", { source_url: "a" }),
      row(1, "2026-08-12T00:00:00.000Z", { source_url: "a" }),
      row(2, "2026-08-12T00:00:03.000Z", { source_url: "b" }),
      row(1, "2026-08-12T00:00:01.000Z", { source_url: "b" }),
    ];
    const { feedback } = await listFeedback(reader(items));
    expect(feedback.map((f) => f.created_at.slice(17, 19))).toEqual(["03", "02", "01", "00"]);
    // And the limit keeps the newest, not the first tab's.
    const top = await listFeedback(reader(items), { limit: 1 });
    expect(top.feedback[0]!.source).toBe("b");
  });

  test("equal timestamps keep the store's order; unparseable ones go last", async () => {
    const items = [
      row(9, "garbage"),
      row(3, "2026-08-12T00:00:00.000Z"),
      row(2, "2026-08-12T00:00:00.000Z"),
    ];
    const { feedback } = await listFeedback(reader(items));
    expect(feedback.map((f) => f.id)).toEqual([3, 2, 9]);
  });

  test("missing fields become empty strings and zero, not 'undefined' and NaN", async () => {
    const broken = row(1, "2026-08-12T00:00:00.000Z") as Record<string, unknown>;
    delete broken.author_name;
    delete broken.votes;
    const items = [broken as FeedbackItem, row(2, "2026-08-12T00:00:00.000Z", { votes: 2 })];
    const { feedback } = await listFeedback(reader(items));
    const first = feedback.find((f) => f.id === 1)!;
    expect(first.author).toBe("");
    expect(first.votes).toBe(0);
    const { routes } = await summarizeRoutes(reader(items));
    expect(routes[0]!.votes).toBe(2);
  });
});

describe("FUSEN_HEADERS", () => {
  test("a JSON object of strings is accepted", () => {
    expect(parseHeadersEnv('{"cookie":"s=1","authorization":"Bearer x"}')).toEqual({
      ok: true,
      headers: { cookie: "s=1", authorization: "Bearer x" },
    });
  });

  test("a header literally named 'error' is still a header", () => {
    expect(parseHeadersEnv('{"error":"x"}')).toEqual({ ok: true, headers: { error: "x" } });
  });

  test.each(["not json", "[]", '["a"]', '"cookie"', "null", "42", '{"a":1}', '{"a":null}'])(
    "%s is rejected",
    (raw) => {
      expect(parseHeadersEnv(raw).ok).toBe(false);
    },
  );
});
