English | [日本語](../ja/design/2026-08-13-sqlite-store-and-anonymous-identity-design.md)

# Bundled SQLite store and anonymous-cookie identity

Date: 2026-08-13
Scope: `@fusen/server` (with a small follow-up in `@fusen/ui`)

## Why

Installing the server version today takes five things.

1. Provision Postgres and distribute a connection string
2. Create the table
3. Write the four methods of `FeedbackStore`
4. One line of `fusen.handle(req)` in the host's server
5. One `<script>` on the page

Of these, 1–3 are the price of the "bring your own storage" design, and they are a cliff in adoption.
lite (IndexedDB) removes the cliff entirely, but **it cannot collect feedback from other people**, so it is
not a substitute for the server version.

To remove the cliff and stay the server version, bundle a ready-made store. 1–3
disappear, leaving 4 and 5, and 4 is one line.

```ts
const fusen = createFusenServer({ store: createSqliteStore() });
return (await fusen.handle(req)) ?? myApp(req);
```

At the same time, close **the hole that shows up the moment data is persisted**. The default `resolveAuthor` is a fixed anonymous
(`key: "anonymous"`), so the default `canDelete` (you can only delete your own) passes for everyone,
since everyone matches. With the memory store it vanished on restart; SQLite does not. Persistence and identity
ship in the same change.

## In scope / out of scope

In scope:

- `@fusen/server/sqlite` — a `FeedbackStore` implementation on Bun's `bun:sqlite`
- Change the default identity to "anonymous, tied to a cookie"
- `GET {basePath}/me` — one endpoint for the widget to learn its own `authorKey`
- `@fusen/ui` — fill `authorKey` from `/me` automatically when it is not set

Out of scope (separate specs):

- Bundling a Postgres store
- Several processes hitting the same SQLite file (the SSE hub does not cross processes)
- Paging, retention, schema versioning
- Publishing to npm, a standalone entry point (something like `fusen serve`)

## 1. SQLite store

### Location

Add `packages/server/src/sqlite.ts` and add `"./sqlite": "./src/sqlite.ts"` to the `exports`
in `package.json`. The root import (`@fusen/server`) stays Bun-independent.
Only people who import `@fusen/server/sqlite` pull in `bun:sqlite`.

Bun only is fine. This repository's tests and builds run on Bun, and `bun:sqlite` is
built into the runtime, so no dependency is added. People running on Node write their own implementation as before.

### API

```ts
export type SqliteStoreOptions = {
  /** Default "fusen.sqlite". ":memory:" allowed. */
  path?: string;
  /** Default "fusen_feedback". */
  table?: string;
  /** Pass it if the app already has a Database (to live in the same file). */
  db?: Database;
};

export type SqliteStore = FeedbackStore & {
  /** Delete everything. For resetting previews. Same shape as the memory store. */
  clear: () => void;
  close: () => void;
  /** Exposed for people who want their own tables in the same file. */
  db: Database;
};

export function createSqliteStore(options?: SqliteStoreOptions): SqliteStore;
```

Accepting `db` and exposing `db` go together: besides "add one more file just for fusen", you can
also choose "share the app's existing SQLite".

`close()` **closes only a connection it opened itself**. When `db` was passed in, someone else owns it, so it
does nothing (do not close what you borrowed).

### Schema

One `CREATE TABLE IF NOT EXISTS` at construction. No version table.

```sql
CREATE TABLE IF NOT EXISTS <table> (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  route          TEXT    NOT NULL,
  body           TEXT    NOT NULL,
  anchor         TEXT    NOT NULL,   -- JSON
  context        TEXT,               -- JSON or NULL
  author_name    TEXT    NOT NULL,
  author_key     TEXT    NOT NULL,
  author_picture TEXT,
  votes          INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT    NOT NULL    -- ISO 8601 (UTC)
);
CREATE INDEX IF NOT EXISTS <table>_route ON <table>(route);
```

PRAGMA: `journal_mode = WAL`, `busy_timeout = 5000`, `synchronous = NORMAL`.
The target is good enough for practical use in a single-process app. The README will say a backup is
copying the one file (including WAL/SHM).

`id` is `INTEGER`, so it maps directly onto the protocol's number id.

### Behavior

- `list()` is in descending id order. `anchor` / `context` are `JSON.parse`d and **returned as objects**.
  Returning them as strings would still be picked up by `normalize`, but a bundled store should not be written to rely on that
- `create()` is `INSERT ... RETURNING *`. `created_at` is `new Date().toISOString()`
- `vote()` is `UPDATE ... SET votes = votes + ? WHERE id = ? RETURNING id, votes`.
  If there is no row, `null` (not an exception; this is where 404 vs 500 is decided)
- `remove()` is `DELETE ... WHERE id = ? RETURNING id`. `null` if there is none
- If a column holds broken JSON, do not drop the row; return `anchor` as the raw string and
  leave it to the normalization above. One corrupted row emptying the whole list is the worst way to break, so avoid it

## 2. Anonymous-cookie identity

### Changes

When `resolveAuthor` is not given, change the default from a fixed anonymous to a cookie-derived anonymous.

- If the request's `Cookie` has `fusen_author`, that value is the `key`
- If not, generate a 128-bit random value as the `key` and **add a `Set-Cookie` to that response**
- Attributes: `HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age=31536000`,
  and `Secure` if the request URL is https
- The display name is derived from the key (a short suffix, like `Guest-a3f9`). Different people look different in the panel

The public signature does not change. When the host passes `resolveAuthor`, it stays a pure function as before, and
no cookie is issued (do not make a side that has its own session bake cookies).

```ts
type FusenServerOptions = {
  // ...existing
  /** The default anonymous cookie. false disables it. Ignored when resolveAuthor is given. */
  anonymousCookie?:
    | false
    | {
        name?: string; // default "fusen_author"
        sameSite?: "Lax" | "None"; // default "Lax"
        secure?: boolean; // default depends on whether the request is https
        maxAgeSec?: number; // default 31536000
        namePrefix?: string; // display-name prefix (`<prefix>-abcd`), default "Guest"
      };
};
```

In the implementation, `handle()` adds the `Set-Cookie` just before returning the response. `json()` currently
builds `new Response` directly, so insert one thin wrapper that adds the header only on paths
that carry a cookie.

`GET {basePath}` (the list) does not call `resolveAuthor` today. That stays.
Cookies are issued on `/me` and the write paths.

### `GET {basePath}/me`

```
GET /api/feedback/me  ->  200 { "author": { "key": "...", "name": "Guest-a3f9", "picture": null } }
```

- With the anonymous default, if there is no cookie, it is issued here and `Set-Cookie` is returned
- If the host passes `resolveAuthor`, return its result. 401 if it is `null`
- It also becomes an endpoint for hosts with a real session (no wiring needed to pour the key into
  the widget through an attribute)

`{basePath}/me` matches neither `{basePath}/(\d+)` nor `{basePath}/events`, so it does not
collide with existing routing.

### Widget side

`authorKey` is, as always, **display-only**: it only decides whether to draw the delete button. Permission
checks are done by the server against the stored row. That role does not change.

One change. When `authorKey` is unset (the default `""`), call `{basePath}/me` once at startup to
fill it. If set explicitly by attribute, nothing goes to the network (existing usage is unchanged).
Failure is not fatal — if the key stays empty, only the delete button is missing; viewing and posting still work.

## 3. Tests

SQLite:

- `runStoreContract("sqlite", () => createSqliteStore({ path: ":memory:" }))` —
  apply the existing conformance kit as is
- File persistence: write, `close()`, reopen the same path and the data is still there
- Concurrent writes under WAL: open two connections to the same file, `create` alternately, and both remain
- `clear()` deletes everything

Anonymous cookie:

- The first request gets a `Set-Cookie`
- The second uses the same key and does not reissue
- A user with a different cookie cannot delete other people's items (403)
- https requests get `Secure`
- No cookie is issued when `resolveAuthor` is passed
- No cookie is issued with `anonymousCookie: false`

`/me`:

- With the anonymous default, returns `{ author: { key, name } }` and issues a cookie
- 401 when `resolveAuthor` returns `null`

Widget:

- Without an `author-key` attribute, it calls `/me` once and the delete button appears on your own items
- With the attribute, it does not call `/me`

## 4. Breaking change

The default `author_key` changes from `"anonymous"` for everyone to a per-person value. Existing users who
(unintentionally) relied on "anyone can delete anyone's" will see the behavior change. Record it in the
CHANGELOG as a breaking change. Passing `anonymousCookie: false` restores the old behavior.

## 5. Limits that remain after this change

To be stated honestly in the README.

- **It is a cookie, so a different browser or device is a different person**, and you can no longer delete your own notes. That is the
  price of anonymity; anyone who wants to fix it passes `resolveAuthor`
- **On another origin, a `SameSite=Lax` cookie is not sent**. That setup needs
  `sameSite: "None"` + `secure`, and the widget also needs `credentials: "include"`.
  This change assumes same origin (direct mount, or a reverse proxy)
- **Several processes opening the same file split SSE**. WAL lets writes through, but the
  hub only exists inside a process, so updates from one process do not reach subscribers in another
- **Distribution does not change**. Both `@fusen/server` and `@fusen/ui` remain `private: true` workspace
  packages, so "`npm install` and two lines" has not been reached. Publishing is a separate spec
