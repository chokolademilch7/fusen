/**
 * A SQLite store, so the server version costs one line instead of a database.
 *
 * `createMemoryStore()` already makes "install it and it works" true, and loses
 * everything on restart. This is the same promise without that clause: one
 * file, no connection string, no migration to run. What a host writes drops
 * from a `FeedbackStore` implementation to a constructor call.
 *
 *     createFusenServer({ store: createSqliteStore() })
 *
 * BUN ONLY, deliberately. `bun:sqlite` is built into the runtime, so this costs
 * no dependency; the price is that it lives behind the `@fusen/server/sqlite`
 * subpath and the root entry stays runtime-neutral. A host on another runtime
 * writes its own store, exactly as before.
 *
 * The JSON columns are parsed on the way out. `normalize.ts` would rescue a
 * store that handed back strings — that is what it is for — but a store shipped
 * in this package should not be the one leaning on it.
 */

import { Database } from "bun:sqlite";
import type { FeedbackItem } from "@fusen/core";
import type { CreateInput, FeedbackStore, VoteResult } from "./types.ts";

export type SqliteStoreOptions = {
  /** Database file. Defaults to `fusen.sqlite`; `:memory:` is allowed. */
  path?: string;
  /** Table name. Defaults to `fusen_feedback`. */
  table?: string;
  /** An existing connection to share, for a host that already has one open. */
  db?: Database;
};

export type SqliteStore = FeedbackStore & {
  /** Drop everything. For tests and for a preview that wants a reset button. */
  clear: () => void;
  /** Close the connection — unless it was handed in, in which case it is not
   *  ours to close. */
  close: () => void;
  /** Exposed so a host can keep its own tables in the same file. */
  db: Database;
};

type Row = {
  id: number;
  route: string;
  body: string;
  anchor: string;
  context: string | null;
  author_name: string;
  author_key: string;
  author_picture: string | null;
  votes: number;
  created_at: string;
};

/** A table name is interpolated into SQL, so it may only look like a name. */
function assertIdentifier(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`table name must be a plain identifier: ${name}`);
  }
  return name;
}

/** Parse a JSON column, handing back what was there if it is not JSON. A single
 *  unreadable row must not be able to empty the whole panel. */
function parseJson(value: string | null): unknown {
  if (value === null) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function toItem(row: Row): FeedbackItem {
  return {
    id: Number(row.id),
    route: row.route,
    body: row.body,
    anchor: parseJson(row.anchor),
    context: parseJson(row.context),
    author_name: row.author_name,
    author_key: row.author_key,
    author_picture: row.author_picture,
    votes: Number(row.votes),
    created_at: row.created_at,
  } as FeedbackItem;
}

export function createSqliteStore(options: SqliteStoreOptions = {}): SqliteStore {
  const table = assertIdentifier(options.table ?? "fusen_feedback");
  const borrowed = options.db !== undefined;
  const db = options.db ?? new Database(options.path ?? "fusen.sqlite", { create: true });

  // WAL keeps a reader from blocking the writer, and busy_timeout turns the
  // remaining contention into a wait rather than an immediate SQLITE_BUSY.
  // On `:memory:` the journal mode request is simply not honoured, which is
  // fine — there is no file to be durable about.
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA busy_timeout = 5000");
  db.exec("PRAGMA synchronous = NORMAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS ${table} (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      route          TEXT    NOT NULL,
      body           TEXT    NOT NULL,
      anchor         TEXT    NOT NULL,
      context        TEXT,
      author_name    TEXT    NOT NULL,
      author_key     TEXT    NOT NULL,
      author_picture TEXT,
      votes          INTEGER NOT NULL DEFAULT 0,
      created_at     TEXT    NOT NULL
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS ${table}_route ON ${table}(route)`);

  return {
    db,

    async list(): Promise<FeedbackItem[]> {
      // Newest first, matching what the panel shows without sorting.
      const rows = db.query<Row, []>(`SELECT * FROM ${table} ORDER BY id DESC`).all();
      return rows.map(toItem);
    },

    async create(input: CreateInput): Promise<FeedbackItem> {
      const row = db
        .query<Row, [string, string, string, string | null, string, string, string | null, string]>(
          `INSERT INTO ${table}
             (route, body, anchor, context, author_name, author_key, author_picture, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           RETURNING *`,
        )
        .get(
          input.route,
          input.body,
          JSON.stringify(input.anchor),
          input.context === null ? null : JSON.stringify(input.context),
          input.author.name,
          input.author.key,
          input.author.picture ?? null,
          new Date().toISOString(),
        );
      return toItem(row!);
    },

    async vote(id: number, delta: number): Promise<VoteResult | null> {
      const row = db
        .query<{ id: number; votes: number }, [number, number]>(
          `UPDATE ${table} SET votes = votes + ? WHERE id = ? RETURNING id, votes`,
        )
        .get(delta, id);
      return row ? { id: Number(row.id), votes: Number(row.votes) } : null;
    },

    async remove(id: number): Promise<{ id: number } | null> {
      const row = db
        .query<{ id: number }, [number]>(`DELETE FROM ${table} WHERE id = ? RETURNING id`)
        .get(id);
      return row ? { id: Number(row.id) } : null;
    },

    clear(): void {
      db.exec(`DELETE FROM ${table}`);
    },

    close(): void {
      if (!borrowed) db.close();
    },
  };
}
