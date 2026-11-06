/**
 * The SQLite store, against the shared contract plus the things only a
 * file-backed store can get wrong: surviving a restart, two connections on one
 * file, and handing back JSON columns as objects rather than strings.
 */

import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Anchor, PageContext } from "@fusen/core";
import { createSqliteStore } from "./sqlite.ts";
import { runAuthContract, runStoreContract } from "./testkit.ts";
import type { Author } from "./types.ts";

const anchor: Anchor = {
  version: 1,
  route: "/",
  selectorPath: "#a > p",
  fingerprint: { tag: "p", dataAttrs: {}, classList: [], textSnippet: "hello" },
  rectRatio: { x: 0.5, y: 0.5 },
};

const author: Author = { name: "Tester", key: "tester", picture: null };

const dirs: string[] = [];

function tempFile(): string {
  const dir = mkdtempSync(join(tmpdir(), "fusen-sqlite-"));
  dirs.push(dir);
  return join(dir, "fusen.sqlite");
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

runStoreContract("sqlite", () => createSqliteStore({ path: ":memory:" }));
runAuthContract("sqlite", () => createSqliteStore({ path: ":memory:" }));

describe("sqlite store", () => {
  test("anchor and context come back as objects, not JSON strings", async () => {
    const store = createSqliteStore({ path: ":memory:" });
    const context: PageContext = { version: 1, machines: { player: "playing" } };
    await store.create({ route: "/", body: "b", anchor, context, author });

    const [item] = await store.list();

    expect(item!.anchor).toEqual(anchor);
    expect(item!.context).toEqual(context);
  });

  test("rows survive closing and reopening the file", async () => {
    const path = tempFile();
    const first = createSqliteStore({ path });
    const created = await first.create({
      route: "/",
      body: "persists \u6b8b\u308b",
      anchor,
      context: null,
      author,
    });
    first.close();

    const second = createSqliteStore({ path });
    const listed = await second.list();
    second.close();

    expect(listed.map((item) => Number(item.id))).toContain(Number(created.id));
    expect(listed[0]!.body).toBe("persists \u6b8b\u308b");
  });

  test("two connections on one file both write", async () => {
    const path = tempFile();
    const a = createSqliteStore({ path });
    const b = createSqliteStore({ path });

    await a.create({ route: "/", body: "from a", anchor, context: null, author });
    await b.create({ route: "/", body: "from b", anchor, context: null, author });

    const bodies = (await a.list()).map((item) => item.body);
    a.close();
    b.close();

    expect(bodies).toContain("from a");
    expect(bodies).toContain("from b");
  });

  test("clear empties the table", async () => {
    const store = createSqliteStore({ path: ":memory:" });
    await store.create({ route: "/", body: "b", anchor, context: null, author });

    store.clear();

    expect(await store.list()).toEqual([]);
  });

  test("close leaves a borrowed Database open — it belongs to the caller", async () => {
    const db = new Database(":memory:");
    const store = createSqliteStore({ db });
    await store.create({ route: "/", body: "b", anchor, context: null, author });

    store.close();

    expect(db.query("SELECT count(*) AS n FROM fusen_feedback").get()).toEqual({ n: 1 });
  });

  test("a second store on the same table does not drop what the first wrote", async () => {
    const path = tempFile();
    const first = createSqliteStore({ path });
    await first.create({ route: "/", body: "first in", anchor, context: null, author });
    first.close();

    const second = createSqliteStore({ path });
    const listed = await second.list();
    second.close();

    expect(listed).toHaveLength(1);
  });
});
