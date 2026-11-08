[← README](../../README.md) · English | [日本語](../ja/guide/server.md)

# Server

The widget assumes these five routes exist (`{base}` is `/api/feedback` by default).

| Route                   | What it is for                                             |
| ----------------------- | ---------------------------------------------------------- |
| `GET {base}/events`     | SSE: other people's posts, votes and deletions in realtime |
| `GET {base}/me`         | Who am I: lets the widget learn its own `author_key`       |
| `GET\|POST {base}`      | List comments, and create a new one                        |
| `POST {base}/:id/votes` | Vote                                                       |
| `DELETE {base}/:id`     | Delete; the `nonce` goes in the JSON body                  |

Writing these by hand is most of the cost of adopting fusen, and four of the mistakes you can
make there **break things without any error**. `@chokolademilch7/fusen/server` takes that over.

```ts
import { createFusenServer, createMemoryStore } from "@chokolademilch7/fusen/server";

const fusen = createFusenServer({ store: createMemoryStore() });

Bun.serve({
  idleTimeout: 0, // keep SSE connections open
  fetch: async (req) => (await fusen.handle(req)) ?? myOwnRoutes(req),
});
```

`handle` returns **`null`** (not 404) for paths it does not own, so `??` hands them on to your
own router. `Request` / `Response` are web standards, so Bun / Deno / Node 18+ / Workers / Hono
run it **as is, with no adapter**.

All you write is the four methods of `FeedbackStore` (`list` / `create` / `vote` / `remove`).
`createMemoryStore()` is bundled, so it runs before you have written anything.

Install it with `bun add @chokolademilch7/fusen`. On the page, serve `node_modules/@chokolademilch7/fusen/dist/fusen.js` (how to
pick the mode is in "Both in one file" in [Lite](./lite.md)).

## No storage to set up: bundled SQLite

The memory store's only drawback is that a restart wipes it, and fixing that used to mean
standing up Postgres, creating a table and writing the four methods. `@chokolademilch7/fusen/server/sqlite`
turns that gap into one line.

```ts
import { createSqliteStore } from "@chokolademilch7/fusen/server/sqlite";

const fusen = createFusenServer({ store: createSqliteStore() }); // ./fusen.sqlite
```

You can pass `path` (default `fusen.sqlite`, `:memory:` allowed), `table` (default
`fusen_feedback`) and `db` (share a `Database` your app already has open). The table is created
on first use with `CREATE TABLE IF NOT EXISTS`, and `journal_mode = WAL` plus `busy_timeout` are
set, so it holds up for a single-process app. To back it up, **copy the file** (together with
`-wal` / `-shm`).

**Bun only.** It uses `bun:sqlite`, so it adds no dependency, but for that reason it lives at
`@chokolademilch7/fusen/server/sqlite` rather than the root import (`@chokolademilch7/fusen/server`). On other runtimes you write
your own store as before.

## Without touching the host's code: standalone process + proxy

There are two cases where you cannot write the one line `fusen.handle(req)`: you cannot edit
the app, or the app does not run on Bun. A reverse proxy solves both.

```bash
bunx @chokolademilch7/fusen serve --db ./fusen.sqlite --port 8400
```

```nginx
location = /api/feedback { proxy_pass http://127.0.0.1:8400; proxy_set_header X-Forwarded-Proto $scheme; }
location /api/feedback/ { proxy_pass http://127.0.0.1:8400; proxy_set_header X-Forwarded-Proto $scheme; }
```

It takes two blocks because a single `location /api/feedback` is a prefix match and would also
catch unrelated host routes such as `/api/feedback-admin`.

The app is untouched. To the browser everything **stays same-origin**, so cookies and CORS
behave exactly as in the mounted version. By default it listens on `127.0.0.1`, reachable only
from a proxy on the same machine (to listen on every interface, inside a container for example,
pass `--host 0.0.0.0` explicitly). There are four flags, `--db` / `--port` / `--host` /
`--base`, and `/healthz` exists for the proxy's health checks. Any path outside the protocol
returns 404 (the app's routes are the proxy's job, not this process's).

## Who wrote it: anonymous cookie by default

When you do not pass `resolveAuthor`, the server hands each browser a **stable anonymous key**
in an `HttpOnly` cookie (default name `fusen_author`). The display name, such as `Guest-a3f9`,
is derived from the key, so different people look different in the panel. The `Guest` part
is the `namePrefix` option of `anonymousCookie` (`{ namePrefix: "Visitor" }` gives `Visitor-a3f9`).

This is not a login. What it drives is the default permission check, "you can delete only what
you wrote". Earlier, when everyone shared one key, **anyone could delete anyone's comment**.
Once comments persist, that has to be closed.

The cookie value is a secret and never leaves the server. The `author_key` stored on each row
and sent out in the list, over SSE and from `/me` is its SHA-256, so picking it out of the list
does not let you send it back as a cookie. A cookie that is not in the form the server itself
issues (48 hex digits) is ignored and a new one is issued. It is not signed, though, so any
value of that form passes, even one you chose yourself. Someone who can plant that cookie in
another person's browser (for example by controlling a subdomain of the same site) can share
that person's identity. The anonymous cookie exists so you can delete your own notes without
logging in; if you need stronger identity than that, pass the host's login in through
`resolveAuthor`.

- **Earlier comments can no longer be deleted by anyone.** Rows from before this change store
  the raw cookie value (which the list used to expose), and it does not match today's
  `author_key`. The old cookies (32 digits) are not accepted either; they are replaced with a
  new cookie on the next request. The delete button disappears even from the author's own
  screen. If they need deleting, the host deletes them in the store, or passes its own
  `canDelete`.
- Switching browser or device makes you a different person. You can no longer delete your own
  notes.
- The cookie gets `Secure` only when the browser came in over https: when the URL is `https:`,
  or the proxy's `X-Forwarded-Proto` is `https`. nginx does not send that header by default, so
  behind a TLS-terminating proxy add `proxy_set_header X-Forwarded-Proto $scheme;` (without it
  the cookie is also sent over plain http). `anonymousCookie: { secure: true }` pins it on.
- **Serve it from the same origin as the page.** The server sends no CORS headers at all, so
  from another origin `DELETE` and JSON `POST` stop at the preflight. A write whose body is not
  `Content-Type: application/json` gets a 415, so a cross-origin form or `text/plain` POST, which
  skips the preflight, cannot write either. Mount it directly, or make
  it same-origin with the reverse proxy above (cross-origin setups are out of scope; see 3.5 in
  [docs/adoption-map.md](../adoption-map.md)).
- `anonymousCookie: false` restores the old behaviour: everyone gets the same `anonymous` key.
  Because they share it, the default `canDelete` refuses every delete; pass your own to allow one.

The widget gets its own key from `GET {basePath}/me` (once at startup, and only when the
`author-key` attribute is empty). The cookie is `HttpOnly`, so the page cannot read it, which is
how it should be. If the host has a real session, pass `resolveAuthor`: then no cookie is issued
at all, and `/me` returns that session's author.

## How large a write is accepted

Writes are anonymous by default, and a saved row goes straight into everyone's list and SSE
stream. One huge row would slow down everyone's widget, so there are limits.

| What                       | Limit                          | When exceeded |
| -------------------------- | ------------------------------ | ------------- |
| Request body               | 320 KiB                        | 413           |
| `body` (comment text)      | 10,000 characters              | 400           |
| `route`                    | 2,048 characters               | 400           |
| `context` (length as JSON) | 16,384 characters              | 400           |
| `anchor` (length as JSON)  | 16,384 characters              | 400           |
| Vote `delta`               | non-zero integer, at most ±100 | 400           |
| `nonce` (on every write)   | 128 characters                 | 400           |

A `delta` of 0, or a missing one, also returns 400 (it used to do nothing and return the current
count). `delta` is not fixed at 1 because the widget batches rapid clicks into one request. The
same person voting many times is counted every time (it is applause, not a ballot box). `nonce`
is not stored, but it is echoed to everyone in realtime frames, so it has a limit too. The
320 KiB request limit is large enough for a write at the full character limit even with every
character written as `\uXXXX`, so an overlong comment gets a 400 with a reason rather than a 413. `fusen serve` passes the same 320 KiB to `Bun.serve` as `maxRequestBodySize`.

## Checking your own store: testkit

Check that your store is correct with the bundled conformance tests.

```ts
import { runStoreContract, runWireContract } from "@chokolademilch7/fusen/server/testkit";

runStoreContract("postgres", () => makeStore());
runWireContract("postgres", () => makeStore());
```

`runWireContract` is the important one: it holds the four things that **never raise an error on
the server and break silently only in the browser**. Return jsonb as an object; echo `nonce` in
realtime frames; make `id` a number and `created_at` a string; read the `DELETE` nonce from the
JSON body.
