English | [日本語](./ja/adoption-map.md)

# Adoption map

One page on "how far this repository has come, and where it can go".
As of 2026-08-13. The history of the decisions is kept too.

> A record of decisions at the time. For installation steps, the README is authoritative.

## 1. What exists now

| Package         | Role                                                                                                | State                        |
| --------------- | --------------------------------------------------------------------------------------------------- | ---------------------------- |
| `@fusen/core`   | Anchoring, page-context snapshots, the `FeedbackHttp` / `FeedbackTransport` types                   | Zero dependencies            |
| `@fusen/ui`     | `<fusen-widget>` (Shadow DOM, SolidJS inside)                                                       | Has a dist                   |
| `@fusen/server` | The protocol itself (`Request` → `Response`), memory / **SQLite** stores, anonymous-cookie identity | Bundled store assumes Bun    |
| `@fusen/lite`   | The serverless version. IndexedDB + BroadcastChannel                                                | Confined to a single browser |
| `@fusen/mcp`    | Lets AI read the collected feedback as tools                                                        | Both over HTTP and over CDP  |

The tools' logic (`list` / `get` / `summarize`) lives in `@fusen/core`. stdio, CDP and
in-page WebMCP all call the same functions, so the payload does not change with the path.

Supporting pieces: `examples/` (plain / react / vue acceptance tests), `skills/fusen-comments`,
`agents/fusen-triage.md`, `INSTALL.md` (an install prompt to paste into an AI).

### Added on 2026-08-13

- `@fusen/server/sqlite` — `createSqliteStore({ path?, table?, db? })`. WAL, `busy_timeout`,
  `CREATE TABLE IF NOT EXISTS`. **Bun only** (`bun:sqlite`)
- The default identity becomes "anonymous, tied to an `HttpOnly` cookie". Tune it with `anonymousCookie`; `false` restores one shared author, which can then create but not delete (unless the host passes `canDelete`)
- `GET {basePath}/me` — the endpoint the widget uses to get its own `authorKey`
- `@fusen/ui` — `FeedbackHttp.me?()` (optional); if `author-key` is not set, it is fetched once at startup

Breaking change: `author_key` goes from `"anonymous"` for everyone to a per-person value. This makes
the default `canDelete` (only your own) **actually work for the first time**.

- WebMCP in `@fusen/lite` — with `data-webmcp` / `<fusen-widget webmcp>`, the page itself exposes
  `fusen_list_feedback` / `fusen_get_feedback` / `fusen_summarize_routes` on
  `document.modelContext`. **Off by default, read-only, with `untrustedContentHint`**
- Moved the logic of the three tools from `@fusen/mcp` to `@fusen/core` (`FeedbackReader` is a
  structural type with only `{ list() }`). The browser cannot import a package that depends on the
  MCP SDK, and with a copy the promise of "the same payload on every path" breaks the moment one side is edited
- Checked with `bun run scripts/check-webmcp.ts` (outside `verify` because it needs Chrome 149–156).
  Confirmed passing on Chrome 151

So there are now two paths for reading lite's comments from outside: CDP (an outside process reads,
from any agent) and WebMCP (the page hands them over, only to agents inside the browser).
**CDP was not removed** — it is still the only way Claude Code over stdio can read them.

### Added on 2026-08-14

Support for [Agent Plugins 1.0.0](https://github.com/agentplugins/agent-plugins-spec) (a vendor-neutral
plugin format). The shape is **the same directory presenting itself in two formats**.

- `plugin.json` (root) — the Agent Plugins manifest. Its schema is **closed**
  (`additionalProperties: false`), so Claude Code's `displayName` / `skills` /
  `agents` / `mcpServers` cannot go in it. Putting them in does not fail; they are just
  "ignored as unknown fields", so you would never notice it broke
- `mcp.json` (root) — a single stdio server that starts `packages/mcp/src/bin.ts` via `${PLUGIN_ROOT}`
- `.claude-plugin/plugin.json` and `.mcp.json` are **unchanged**. The Claude Code path is untouched
- Added `scripts/check-plugin-manifests.ts` to `verify`. It does not fetch the spec's schema
  (§5.2 says "do not fetch the schema at load time", and `verify` must also pass
  offline)

Why two manifests. There is no way to merge them into one — Claude Code only looks under
`.claude-plugin/`, Agent Plugins only looks at the root `plugin.json`, and both fix their locations.
Write two by hand and `version` will drift sooner or later, and nothing fails when it does
(clients use `version` for cache decisions, so stale content is served silently).
Only that drift is left to a machine to watch.

Leaving `env` out of `mcp.json` is deliberate. Only `${PLUGIN_ROOT}` and `${PLUGIN_DATA}` are
expanded; `${FUSEN_BASE_URL}` reaches the process **as that literal string**
(§9.2). `bin.ts` picks HTTP or CDP by whether FUSEN_BASE_URL is set, so a literal would make it
fall into "HTTP reads against a broken URL" and never fall back to lite's browser path. Worse than unset.

The spec defines **only two components: skills and MCP servers**. `agents/fusen-triage.md`
is invisible to Agent Plugins clients (out of scope for v1; ignoring it is the correct behavior).
Since `command` is `bun`, it is still assumed that `bun install` has been run at the plugin root
(dependencies are not placed under `${PLUGIN_DATA}`).

## 2. Where adoption cost stands

Installing the server version used to take five things.

1. Provision Postgres → **gone** (SQLite bundled)
2. Create the table → **gone** (created automatically)
3. Write a `FeedbackStore` → **gone** (bundled store)
4. One line of `fusen.handle(req)` → stays
5. One `<script>` on the page → stays

The steps you actually type today (since nothing is published):

```bash
git submodule add https://github.com/chokolademilch7/fusen vendor/fusen
bun install --cwd vendor/fusen
bun run --cwd vendor/fusen build:ui
cp vendor/fusen/packages/ui/dist/*.js public/vendor/   # copy both files
```

Plus path aliases in `tsconfig.json` (`@fusen/server` and `@fusen/server/sqlite`).
**The code is down to two lines, but setup is still four steps.** That is the next friction point.

Publishing would make it a single package install, and for plain HTML a single CDN
script tag, which also removes the `./index.js` bundling problem automatically. The prerequisites for
publishing are dropping `private: true`, replacing `workspace:*` with real versions, and building
`@fusen/server` (its `exports` currently point straight at `.ts`).

## 3. Deployment options

There are six, by "how much of the host's server you touch".

| #   | Shape                                 | Change on the host         | Storage                    | Multiple people             | Not implemented                        |
| --- | ------------------------------------- | -------------------------- | -------------------------- | --------------------------- | -------------------------------------- |
| A   | Direct mount                          | One line of code           | Your own DB (can share it) | Yes                         | Nothing (works today)                  |
| B   | Reverse proxy                         | One config block           | fusen's SQLite             | Yes                         | Nothing (`fusen-serve` implemented)    |
| C   | Self-hosted service on another origin | **None** (script tag only) | fusen's side               | Yes                         | **Out of scope** (see 3.5)             |
| D   | Direct BaaS (Supabase / Firebase)     | None                       | BaaS                       | Yes                         | Adapter at the client seam, RLS design |
| E   | GitHub Discussions                    | None                       | GitHub                     | Yes (GitHub account needed) | **Rejected** (see 3.5)                 |
| F   | lite                                  | None                       | IndexedDB                  | **No**                      | Nothing (exists)                       |

### A. Direct mount

The current main line. `(await fusen.handle(req)) ?? myApp(req)`. Same origin, so there is no
cookie or CORS to think about. Comments can share the app's DB (`createSqliteStore({ db })`
or your own store), so this is the only shape where the app's SQL can query them.

### B. Reverse proxy

Route only `/api/feedback/*` to a separate process. The app's code is untouched and it stays same-origin.
The entry point is `packages/server/src/bin.ts` (inside the clone: `bun run packages/server/src/bin.ts --db ./fusen.sqlite --port 8400`).
It is also **the only realistic way to add fusen to a non-Bun app**.

### C. Another origin

If you will not touch the server config either, this is the only option. Putting an absolute URL in `basePath`
is enough for fetch and EventSource to work, but the following are needed.

- CORS in `@fusen/server` (an Origin allowlist, preflight, `Allow-Credentials`)
- Cookies do not work (Safari's ITP / third-party cookie restrictions), so add a way to
  **send the anonymous key in a header** (`X-Fusen-Author`)
- `EventSource` cannot send custom headers, so replace the SSE client with fetch +
  `ReadableStream`
- One fusen holds several sites, so **site isolation** is needed. Either a `site` column + a composite index
  (which changes the signature of `FeedbackStore.list()`), or a separate SQLite file per site

What you lose: comments leave the app's DB, so no `JOIN`. Backups and retention become a
separate operation. The host is still left with the script tag and (if it is locked down) a relaxed CSP.

### D. Direct BaaS

The only backends a browser can call directly are BaaS with an anon key + row-level permissions (Supabase, Firebase).
Neon / Turso / D1 / Upstash need a function in front, so they do not get you to "zero servers".
It would be implemented at the client seam (`FeedbackHttp` + `FeedbackTransport`), like `@fusen/lite`.
Realtime rides on the BaaS's own subscriptions. The cost is that permission design moves into RLS — get it wrong and everything is public and deletable by anyone.

### E. GitHub Discussions

The same idea as giscus / utterances. **We only borrow the structure and do not depend on them** (they are
comment-section widgets and do not expose a general API).

| fusen                 | GitHub                                                                             |
| --------------------- | ---------------------------------------------------------------------------------- |
| One route             | One Discussion (title = route, category = `fusen`)                                 |
| Comment               | Discussion comment. `anchor` goes at the end of the body as `<!-- fusen:{...} -->` |
| votes                 | 👍 reactions                                                                       |
| Author, delete rights | GitHub accounts and GitHub permissions (no need for the anonymous cookie)          |
| realtime              | **None**. Polling                                                                  |

`api.github.com` returns CORS headers, so **given a token, everything runs in the browser**.
The constraints: every participant needs a GitHub account (no good for collecting end-user feedback;
it suits in-team review), a public repo makes the contents public, and realtime is lost.

There are three levels of where to keep the token.

1. The host page's localStorage — the shortest path. Any script on the page can read it, so
   only for staging/internal pages you control. Issue a fine-grained PAT for one repository,
   Discussions read+write, with a short expiry
2. **Isolate it in an iframe on your own origin** (recommended) — put a small page on static hosting (GitHub Pages is enough),
   and keep the token in that origin's localStorage. The host page cannot read it because of the
   same-origin policy. Narrow the postMessage receiver to fusen's five operations only
3. An OAuth broker — this gives you "Sign in with GitHub". But **OAuth cannot be completed
   in the browser alone** (the token endpoint has no CORS, and it needs the `client_secret`), so
   you end up running a Worker

The broker's burden: 150 lines, stateless, Workers free tier; if it goes down only new logins stop.
The technical load is negligible, but you take on **the responsibility of being an issuance path for other people's GitHub tokens**
(a mandatory allowlist of return origins, no logs, rotating secrets). Not needed while it is in-house:
option 2's PAT + iframe does the same thing. The only difference is the login experience.

## 3.5 Out of scope and rejected options (2026-08-13)

**C (running fusen on another origin) — out of scope**. B (standalone process + proxy) already covers
"do not touch the host's code"; the only extra thing C buys is "do not touch the host's server config either". The price is heavy.

- Technically it is a set of four, and no single one works alone: CORS / header-based identity because cookies are not sent /
  rewriting the SSE client because `EventSource` cannot send headers / isolation so one instance can hold several sites
- Isolation is also a DB design change. Adding a `site` column changes the signature of `FeedbackStore.list()`;
  splitting files adds connection management. Either way the server fills `site` from the Origin (it does not trust what the client claims)
- On top of that, "who operates that fusen" remains. If the adopter runs it, it is **no app changes, not no server**.
  If we run one and hand it out, we take on backups, deletion requests and abuse handling for every site
- What you lose: comments leave the app's DB, so no `JOIN`. Sharing via `createSqliteStore({ db })` loses its point

**Using GitHub Discussions as storage / mirroring to it** — rejected. The reason is **two sources of truth**.
It never settles whether SQLite or GitHub is authoritative, and it requires settling deletes and edits in one direction.
The "turn only the chosen notes into Issues" idea (SQLite stays authoritative, GitHub is a promotion target) was dropped on the same reasoning.
If it is ever done, it must keep a single source of truth (one-way, idempotent, ignoring changes on the GitHub side).

**Server-side GitHub OAuth (auth only, storage stays in SQLite)** — not pursued. It did not create two sources of truth,
but we chose to leave authentication as the host's responsibility. If the host has its own session, it
passes `resolveAuthor`; if not, the anonymous-cookie default is enough.
Because of this decision, `createGithubAuth` / `loginUrl` / a login flow in the widget will not be built.

The facts left over as a by-product of the design still hold. If `resolveAuthor` returns `null`,
"anonymous reads, authenticated writes" works with zero extra code (the list and SSE do not call
`resolveAuthor`; the three write paths return 401 on `null`), and thanks to `/me`, changing the auth scheme leaves
**the host's page unchanged**. Room for the host to add authentication later stays open.

## 4. Order

1. **B's entry point** (`fusen-serve`) — small, and opens up non-Bun hosts and "zero lines of code" at once
2. **publish** (npm + CDN) — turns the four setup steps into one. Helps whichever deployment you pick
3. **Unify `mode`** — put lite and the server version in one bundle, selectable per page.
   The seam is already separated, so the cost is a few KB and a few lines of mode detection. `mode` is read
   once at first mount (rewriting it in devtools does not switch it. Only the tinkerer's own copy breaks, and
   the server decides permissions, so there is no impact)
4. D's Supabase adapter — for collecting from external users when you do not want a server.
   Not started yet

C (another origin) is out of scope, E (GitHub) is rejected. See 3.5.

### Done (2026-08-13)

1 and 3 are implemented: `bun run packages/server/src/bin.ts --db ./fusen.sqlite --port 8400`, and
`packages/lite/dist/fusen.js`, which contains both storage backends (switch with `data-mode="client"`; the default is the server version,
resolved once at load). What remains untouched is 2 (publish) and 4.

## 5. Open questions

- The package boundary for publishing (build `@fusen/server` and ship that, or ship it as `.ts` assuming Bun).
  The npm `@fusen` scope belongs to someone else, so publishing means picking a new name first
- Whether moving data between lite and the server version (feeding in from `window.__fusen.dump()`) becomes a tool or stays manual
