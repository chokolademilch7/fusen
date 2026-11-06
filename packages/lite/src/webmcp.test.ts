/**
 * The WebMCP registration, against a fake `ModelContext`.
 *
 * WHAT THIS CANNOT CHECK, said here rather than discovered later: a fake accepts
 * whatever shape the code hands it, so these tests prove the tools are built and
 * wired — not that Chrome accepts them. The two things only a real browser can
 * confirm are that `execute` resolving to `{content:[…]}` is the shape the agent
 * wants, and that the API is where `findModelContext` looks. Both are checked
 * against the spec IDL in `webmcp.ts`'s header; neither is checked here.
 *
 * So the assertions below are deliberately about the contract this package OWNS:
 * the tool names match `@fusen/mcp`'s, the payloads come from the same
 * `@fusen/core` functions the stdio server uses, the untrusted-content hint is
 * present on everything, aborting unregisters, and a browser without the API
 * produces no error.
 */

import { describe, expect, test } from "bun:test";
import type { Anchor } from "@fusen/core";
import { createMemoryKv } from "./kv.ts";
import { createLocalStore } from "./store.ts";
import {
  createWebmcpTools,
  findModelContext,
  type ModelContextLike,
  type ModelContextTool,
  readerFromStore,
  readWebmcpInputs,
  registerWebmcpTools,
  resolveWebmcp,
  WEBMCP_TOOL_NAMES,
} from "./webmcp.ts";

const anchor: Anchor = {
  version: 1,
  route: "/",
  selectorPath: "#a > p",
  fingerprint: { tag: "p", dataAttrs: {}, classList: [], textSnippet: "hi" },
  rectRatio: { x: 0.5, y: 0.5 },
};

function fakeModelContext() {
  const registered: { tool: ModelContextTool; signal?: AbortSignal }[] = [];
  const modelContext: ModelContextLike = {
    async registerTool(tool, options) {
      const entry: { tool: ModelContextTool; signal?: AbortSignal } = { tool };
      if (options?.signal) entry.signal = options.signal;
      registered.push(entry);
    },
  };
  return { modelContext, registered };
}

async function storeWith(bodies: { route: string; body: string }[]) {
  const store = createLocalStore({ kv: createMemoryKv() });
  for (const { route, body } of bodies) {
    await store.create(route, body, { ...anchor, route }, null, "n");
  }
  return store;
}

/** What the agent would actually read back. */
function payload(result: { content: { type: "text"; text: string }[] }): any {
  return JSON.parse(result.content[0]!.text);
}

describe("webmcp registration", () => {
  test("registers exactly the three tools the stdio server serves, by the same names", async () => {
    const { modelContext, registered } = fakeModelContext();
    const store = await storeWith([]);

    const published = await registerWebmcpTools({ reader: readerFromStore(store), modelContext });

    expect(published).toBe(true);
    expect(registered.map((entry) => entry.tool.name)).toEqual([...WEBMCP_TOOL_NAMES]);
  });

  test("every tool is annotated read-only and untrusted", async () => {
    const store = await storeWith([]);
    for (const tool of createWebmcpTools(readerFromStore(store))) {
      // Not cosmetic: the hint is the only signal an agent gets that a comment
      // body is a stranger's text and not the page's own instruction.
      expect(tool.annotations?.untrustedContentHint).toBe(true);
      expect(tool.annotations?.readOnlyHint).toBe(true);
    }
  });

  test("no tool writes — the surface is the three reads and nothing else", async () => {
    const store = await storeWith([]);
    const names = createWebmcpTools(readerFromStore(store)).map((tool) => tool.name);
    expect(names.some((name) => /vote|delete|create|remove/.test(name))).toBe(false);
  });

  test("the abort signal is handed to every tool, so close() unregisters all of them", async () => {
    const { modelContext, registered } = fakeModelContext();
    const store = await storeWith([]);
    const life = new AbortController();

    await registerWebmcpTools({
      reader: readerFromStore(store),
      modelContext,
      signal: life.signal,
    });

    expect(registered.every((entry) => entry.signal === life.signal)).toBe(true);
    life.abort();
    expect(registered.every((entry) => entry.signal?.aborted)).toBe(true);
  });

  test("a browser without the API is not an error — nothing is published", async () => {
    const store = await storeWith([]);
    // No `document.modelContext`, no `navigator.modelContext`: the majority
    // case, including every non-Chrome browser and every plain-http page.
    expect(findModelContext({})).toBeUndefined();
    await expect(registerWebmcpTools({ reader: readerFromStore(store) })).resolves.toBe(false);
  });

  test("document wins over the namespace Chrome 150 deprecated", () => {
    const fromDocument = fakeModelContext().modelContext;
    const fromNavigator = fakeModelContext().modelContext;
    expect(
      findModelContext({
        document: { modelContext: fromDocument },
        navigator: { modelContext: fromNavigator },
      }),
    ).toBe(fromDocument);
    expect(findModelContext({ navigator: { modelContext: fromNavigator } })).toBe(fromNavigator);
  });
});

describe("webmcp tools", () => {
  test("list returns the same summary shape the stdio server returns", async () => {
    const store = await storeWith([
      { route: "/", body: "first" },
      { route: "/watch", body: "second" },
    ]);
    const [list] = createWebmcpTools(readerFromStore(store));

    const result = payload(await list!.execute({}));

    expect(result.total).toBe(2);
    expect(result.returned).toBe(2);
    // `location` is the anchor rendered as a phrase — the field that makes the
    // payload worth reading instead of the raw row.
    expect(result.feedback[0]).toMatchObject({ body: "second", route: "/watch" });
    expect(typeof result.feedback[0].location).toBe("string");
    // In-page: exactly one page, so nothing to disambiguate.
    expect(result.feedback[0].source).toBeUndefined();
  });

  test("list filters by route and by substring, and reports truncation", async () => {
    const store = await storeWith([
      { route: "/", body: "alpha" },
      { route: "/", body: "beta" },
      { route: "/watch", body: "alpha" },
    ]);
    const [list] = createWebmcpTools(readerFromStore(store));

    expect(payload(await list!.execute({ route: "/" })).total).toBe(2);
    expect(payload(await list!.execute({ query: "ALPHA" })).total).toBe(2);

    const capped = payload(await list!.execute({ limit: 1 }));
    expect(capped).toMatchObject({ total: 3, returned: 1 });
    expect(capped.feedback).toHaveLength(1);
  });

  test("get returns one comment with its anchor and snapshot", async () => {
    const store = await storeWith([{ route: "/", body: "only" }]);
    const get = createWebmcpTools(readerFromStore(store))[1]!;

    const result = payload(await get.execute({ id: 1 }));

    expect(result).toMatchObject({ id: 1, body: "only" });
    expect(result.anchor).toMatchObject({ selectorPath: "#a > p" });
    expect(result.context).toBeNull();
  });

  test("a missing id answers rather than throwing", async () => {
    const store = await storeWith([]);
    const get = createWebmcpTools(readerFromStore(store))[1]!;

    // A rejected tool reads to an agent as "broken" and ends the attempt. This
    // is a question with an answer: there is no such comment.
    expect(payload(await get.execute({ id: 99 }))).toMatchObject({ error: "not found", id: 99 });
  });

  test("a store that cannot be read answers with the reason", async () => {
    const [list] = createWebmcpTools({
      list: () => Promise.reject(new Error("IndexedDB is blocked")),
    });

    expect(payload(await list!.execute({}))).toMatchObject({ error: "IndexedDB is blocked" });
  });

  test("summarize groups by route, busiest first", async () => {
    const store = await storeWith([
      { route: "/watch", body: "a" },
      { route: "/watch", body: "b" },
      { route: "/", body: "c" },
    ]);
    const summarize = createWebmcpTools(readerFromStore(store))[2]!;

    const result = payload(await summarize.execute({}));

    expect(result.routes[0]).toMatchObject({ route: "/watch", count: 2 });
    expect(result.routes[1]).toMatchObject({ route: "/", count: 1 });
  });
});

describe("the opt-in", () => {
  test("off when the page says nothing — the default has to be the quiet one", () => {
    expect(resolveWebmcp({})).toBe(false);
    expect(resolveWebmcp({ script: null, element: null })).toBe(false);
  });

  test("a bare attribute means on", () => {
    expect(resolveWebmcp({ script: "" })).toBe(true);
    expect(resolveWebmcp({ element: "" })).toBe(true);
    expect(resolveWebmcp({ script: "on" })).toBe(true);
  });

  test("the script tag outranks the element, matching resolveMode", () => {
    expect(resolveWebmcp({ script: "off", element: "" })).toBe(false);
  });

  test("a typo warns and means off — it does not take the widget down with it", () => {
    // Silently reading `data-webmcp="yes"` as off would leave an author
    // convinced the tools are published when nothing is, so it warns. It does
    // NOT throw: this runs above `defineFusenElement()` in the bundle entries,
    // and a throw there means no custom element at all — no comments visible,
    // none writable, over a typo in an optional read hatch.
    const warnings: unknown[][] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]) => warnings.push(args);
    try {
      expect(resolveWebmcp({ script: "yes" })).toBe(false);
    } finally {
      console.warn = original;
    }
    expect(String(warnings[0]?.[0])).toMatch(/unknown data-webmcp value/);
  });

  test("reads the attribute off either the script tag or the first widget", () => {
    const doc = (found: Record<string, string>) => ({
      querySelector: (selector: string) =>
        selector in found ? { getAttribute: () => found[selector]! } : null,
    });

    expect(readWebmcpInputs(doc({ "script[data-webmcp]": "on" }))).toEqual({
      script: "on",
      element: null,
    });
    expect(readWebmcpInputs(doc({ "fusen-widget[webmcp]": "" }))).toEqual({
      script: null,
      element: "",
    });
    expect(readWebmcpInputs(doc({}))).toEqual({ script: null, element: null });
  });
});
