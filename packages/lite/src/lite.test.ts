/**
 * The lite store's logic, against a memory KV.
 *
 * The IndexedDB implementation is the one thing here that needs a browser, and
 * it is covered where a browser already exists — the demos' acceptance tests.
 * Everything else (id allocation, ordering, vote arithmetic, identity, the
 * bridge) is plain logic and is checked here, in-process, so a failure reports
 * itself at the line that caused it rather than as a widget that did nothing.
 */

import { describe, expect, test } from "bun:test";
import type { Anchor, FeedbackItem } from "@fusen/core";
import { createBridge } from "./bridge.ts";
import { createMemoryKv } from "./kv.ts";
import { createLocalStore, resolveLocalIdentity } from "./store.ts";

const anchor: Anchor = {
  version: 1,
  route: "/",
  selectorPath: "#a > p",
  fingerprint: { tag: "p", dataAttrs: {}, classList: [], textSnippet: "hi" },
  rectRatio: { x: 0.5, y: 0.5 },
};

function makeStore(onChange?: (change: FeedbackItem | { deletedId: number }) => void) {
  return createLocalStore({ kv: createMemoryKv(), ...(onChange ? { onChange } : {}) });
}

describe("lite store", () => {
  test("a created comment comes back with every field the widget reads", async () => {
    // The reader rejects the WHOLE list if one row is the wrong shape, so a
    // missing field here is not a small problem.
    const store = makeStore();
    const { feedback } = await store.create("/x", "hello", anchor, null, "n");
    expect(typeof feedback.id).toBe("number");
    expect(typeof feedback.votes).toBe("number");
    expect(typeof feedback.created_at).toBe("string");
    expect(typeof feedback.author_name).toBe("string");
    expect(typeof feedback.author_key).toBe("string");
    expect(feedback.author_picture).toBeNull();
    expect(feedback.anchor).toEqual(anchor);
    expect(feedback.context).toBeNull();
  });

  test("ids do not collide, and list is newest first", async () => {
    const store = makeStore();
    await store.create("/", "1", anchor, null, "n");
    await store.create("/", "2", anchor, null, "n");
    const { feedback } = await store.list();
    expect(feedback.map((item) => item.body)).toEqual(["2", "1"]);
    expect(new Set(feedback.map((item) => item.id)).size).toBe(2);
  });

  test("concurrent writes from two tabs neither share an id nor lose a row or a vote", async () => {
    // Two stores over ONE kv is two tabs over one IndexedDB. A get-then-set
    // lets both read the same counter and the same list, so the later write
    // erases the earlier one.
    const kv = createMemoryKv();
    const tabA = createLocalStore({ kv });
    const tabB = createLocalStore({ kv });
    const created = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        (i % 2 ? tabA : tabB).create("/", String(i), anchor, null, "n"),
      ),
    );
    const ids = created.map((result) => result.feedback.id);
    expect(new Set(ids).size).toBe(10);
    expect((await tabA.list()).feedback).toHaveLength(10);

    const target = ids[0] as number;
    await Promise.all([tabA.vote(target, 1, "n"), tabB.vote(target, 1, "n")]);
    const row = (await tabB.list()).feedback.find((item) => item.id === target);
    expect(row?.votes).toBe(2);
  });

  test("ids keep climbing after a delete, so a stale reference cannot hit a new row", async () => {
    const store = makeStore();
    const first = await store.create("/", "1", anchor, null, "n");
    await store.remove(first.feedback.id, "n");
    const second = await store.create("/", "2", anchor, null, "n");
    expect(second.feedback.id).toBeGreaterThan(first.feedback.id);
  });

  test("votes accumulate and can go back down", async () => {
    const store = makeStore();
    const { feedback } = await store.create("/", "v", anchor, null, "n");
    expect((await store.vote(feedback.id, 1, "n")).votes).toBe(1);
    expect((await store.vote(feedback.id, 1, "n")).votes).toBe(2);
    expect((await store.vote(feedback.id, -1, "n")).votes).toBe(1);
  });

  test("a missing id rejects, because a rejected promise is the widget's only failure channel", async () => {
    const store = makeStore();
    await expect(store.vote(999, 1, "n")).rejects.toThrow();
    await expect(store.remove(999, "n")).rejects.toThrow();
  });

  test("remove takes the row out and announces it", async () => {
    const changes: (FeedbackItem | { deletedId: number })[] = [];
    const store = makeStore((change) => changes.push(change));
    const { feedback } = await store.create("/", "d", anchor, null, "n");
    await store.remove(feedback.id, "n");
    expect((await store.list()).feedback).toHaveLength(0);
    expect(changes.at(-1)).toEqual({ deletedId: feedback.id });
  });

  test("every mutation is announced, so other tabs hear about it", async () => {
    const changes: unknown[] = [];
    const store = makeStore((change) => changes.push(change));
    const { feedback } = await store.create("/", "c", anchor, null, "n");
    await store.vote(feedback.id, 1, "n");
    await store.remove(feedback.id, "n");
    expect(changes).toHaveLength(3);
  });

  test("identity is stable across calls and stored, not regenerated", async () => {
    const kv = createMemoryKv();
    const first = await resolveLocalIdentity(kv);
    const second = await resolveLocalIdentity(kv);
    expect(second).toEqual(first);
    expect(first.key.startsWith("local-")).toBe(true);
  });

  test("identity works without crypto.randomUUID, which a plain-http page lacks", async () => {
    const original = crypto.randomUUID;
    delete (crypto as { randomUUID?: unknown }).randomUUID;
    try {
      const identity = await resolveLocalIdentity(createMemoryKv());
      expect(identity.key.length).toBeGreaterThan("local-".length);
    } finally {
      (crypto as { randomUUID?: unknown }).randomUUID = original;
    }
  });

  test("clear empties the browser", async () => {
    const store = makeStore();
    await store.create("/", "x", anchor, null, "n");
    await store.clear();
    expect((await store.list()).feedback).toHaveLength(0);
  });
});

describe("the page's read hatch", () => {
  test("dump, count and routes answer what a tool actually asks", async () => {
    // This is the surface a CDP or Playwright session reads through. Tools must
    // never open the database themselves — see bridge.ts.
    const store = makeStore();
    await store.create("/watch/1", "\u97f3\u304c\u5c0f\u3055\u3044", anchor, null, "n");
    await store.create("/watch/1", "\u5b57\u5e55\u304c\u305a\u308c\u308b", anchor, null, "n");
    await store.create(
      "/",
      "\u5c0e\u7dda\u304c\u5206\u304b\u308a\u306b\u304f\u3044",
      anchor,
      null,
      "n",
    );

    const bridge = createBridge(store);
    expect(bridge.version).toBe(1);
    expect(await bridge.count()).toBe(3);
    expect((await bridge.dump())[0]!.body).toBe(
      "\u5c0e\u7dda\u304c\u5206\u304b\u308a\u306b\u304f\u3044",
    );
    expect(await bridge.routes()).toEqual([
      { route: "/watch/1", count: 2, votes: 0 },
      { route: "/", count: 1, votes: 0 },
    ]);
  });
});
