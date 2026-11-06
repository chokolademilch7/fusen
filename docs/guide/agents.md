[← README](../../README.md) · English | [日本語](../ja/guide/agents.md)

# Letting AI agents read the notes

## Every read path at a glance

| Path                                                        | What it needs                                                                                   | Read / write                                                               | Best for                                                       |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------- |
| WebMCP (in the page, experimental)                          | No open port. Lite with `data-webmcp`, plus a Chrome flag or an origin trial token. No server   | Read only                                                                  | Handing an open page to an agent attached to the browser       |
| `window.__fusen` over CDP (incl. `scripts/read-via-cdp.ts`) | A browser with the debugging port open (default 9222) and a separate profile. No server         | Read only (`dump` / `routes`)                                              | Reading lite notes from a script or Playwright                 |
| MCP over stdio: `bunx fusen mcp`                            | `FUSEN_BASE_URL` for the server version (HTTP); without it, falls back to the CDP port for lite | Read only by default; write only in server mode with `FUSEN_ALLOW_WRITE=1` | Clients that speak MCP over stdio, such as Claude Code         |
| The server's HTTP API                                       | A running fusen server                                                                          | Read and write                                                             | Your own scripts and integrations                              |
| Claude Code plugin / Agent Plugins                          | `bun install` in a fusen clone; it packages the MCP server above plus a skill                   | Same as MCP                                                                | Installing the server together with how to read it (the skill) |

## Which is safest

WebMCP opens no port, whereas CDP exposes full control of the browser on 9222. But with WebMCP
too, any agent attached to that browser can list and call the tools. Stdio agents such as
Claude Code cannot use WebMCP at all. For them the narrowest path is the server version plus
`bunx fusen mcp` over HTTP: read only by default, and the write tools exist only when
`FUSEN_ALLOW_WRITE=1` is passed.

## Handed over by the page itself: WebMCP (experimental)

[Lite's CDP path](./lite.md) asks you to restart the browser with a debugging port and a
separate profile. That is a heavy procedure just to read notes you wrote yourself, and if the
browser is already running, `--remote-debugging-port` is silently ignored, so the failure shows
up as "nothing came back", indistinguishable from no notes.

[WebMCP](https://webmachinelearning.github.io/webmcp/) removes that external process. The page
registers tools on `document.modelContext`, and an AI agent attached to the browser calls them
inside the page. No port, no second process.

```html
<script type="module" src="fusen-lite.js" data-webmcp></script>
<fusen-widget webmcp></fusen-widget>
```

It exposes **the same three tools** as `fusen/mcp`, with the same names, arguments and return
shapes: `fusen_list_feedback` / `fusen_get_feedback` / `fusen_summarize_routes`. They run the
same functions from `fusen/core`, so the payload is identical whether read over stdio or inside
the page.

**Off by default.** `window.__fusen` is on by default, but reading it requires someone to attach
a debugger or run an extension. WebMCP has no such precondition: any agent attached to the
browser can list and call the tools. For the same reason as `data-mode` (see "Both in one file"
in [Lite](./lite.md)), a choice that changes where the data goes has to be written down.

**Read only.** There are no write tools. As with the CDP path, an agent that can silently delete
comments nobody asked it to touch gains nothing and only risks data loss.

**Treat returned text as untrusted.** Comments are free text written by people, and they land
in the agent's context as is. A note saying "ignore all previous instructions..." becomes a
delivery route for prompt injection. There is no way to sanitise it without destroying the
content, so all three tools carry `untrustedContentHint: true` (the marker the spec provides
for this), and the payload stays structured JSON rather than prose.

**Where it does not work**, listed first because the failure is silent:

| Condition                     | Result                                                                       |
| ----------------------------- | ---------------------------------------------------------------------------- |
| Not Chrome                    | No `document.modelContext`. Nothing is registered, and no error is raised    |
| A LAN address over plain http | Same. The API is `[SecureContext]`. `http://localhost` is fine               |
| Origin trial not enabled      | Same. It needs `chrome://flags/#enable-webmcp-testing` or a per-origin token |

A token is registered **for the origin it is served from**, so fusen cannot ship one on the
host page's behalf. Right now it actually works only for developers who set the flag, or hosts
that registered a token themselves. The API itself is an origin trial in Chrome 149 to 156, and
its namespace has already moved twice (`window.agent` → `navigator.modelContext` →
`document.modelContext` in Chrome 150). fusen looks in both places, but this is an experimental
hatch until the spec settles. The CDP path has not been removed.

## MCP

```
FUSEN_BASE_URL=http://localhost:8400/api/feedback bunx fusen mcp
```

The tools are `fusen_list_feedback` / `fusen_get_feedback` / `fusen_summarize_routes`. The write
tools (`fusen_vote_feedback` / `fusen_delete_feedback`) **do not exist** until you pass
`FUSEN_ALLOW_WRITE=1`.

Without `FUSEN_BASE_URL` it assumes lite and connects over CDP (default `127.0.0.1:9222`, change
it with `FUSEN_CDP_PORT`), evaluating a script in **every tab** open in the debugging browser to
look for `window.__fusen`. Whatever any site that sets `window.__fusen` returns reaches the
agent. `FUSEN_URL_FILTER` narrows it to tabs whose URL contains that string. Start the debugging
browser with a separate profile, and do not leave unrelated sites open in it.

The shared `fusen_` prefix is not cosmetic. Claude Code **defers** MCP tool definitions **by
default**, loading only **tool names and server instructions** at startup. A prefix lets one
search find them all, and tells you who owns them among hundreds of names. For the same reason
this server **sets no `instructions`**: those are among the few things that stay resident, so
all explanation lives in the skill (read only when invoked).

Because it reads through the protocol, the same server can point at a demo or at production.
It does not depend on the database schema. To run it inside your app, pass your own store to
`createFusenMcpServer({ store })`; then it does not go through HTTP either.

## Plugin: letting AI clients read the notes

The fusen repository is itself one plugin. It **declares itself in two formats**, so Claude Code
and any client that supports the vendor-neutral
[Agent Plugins 1.0.0](https://github.com/agentplugins/agent-plugins-spec) read the same content.

### Claude Code

```bash
claude --plugin-dir <path to a fusen clone>
```

Run `bun install` in that clone first.

- `fusen-comments` skill: how to read comments. Picks MCP for the server version and the browser
  for lite automatically.
- `fusen-triage` agent: turns comments into a work list with locations.
- `fusen` MCP server: reads the server when `FUSEN_BASE_URL` is set; without it, reads the page
  over CDP (lite).

**With lite, an MCP error saying no browser is listening on the debugging port is normal.**
If the server exited instead, the client would show a broken MCP server every time, so it
deliberately starts and returns guidance on starting the browser.

A prompt you paste into an AI to have it do the whole setup is in
[INSTALL.md](../../INSTALL.md).

### Agent Plugins 1.0.0

For clients other than Claude Code. How to load it follows the client's own conventions (the
spec defines only **the shape of the package**, not how to install or present it).

There are two manifests because one is not enough. Claude Code looks only under
`.claude-plugin/` and takes component locations from the manifest. Agent Plugins looks only at
the root `plugin.json`, uses fixed locations (`skills/`, `mcp.json`) and **forbids** overriding
them from the manifest. Neither reads the other's file, so no single manifest can satisfy both.

| File                         | Read by             |
| ---------------------------- | ------------------- |
| `.claude-plugin/plugin.json` | Claude Code         |
| `.mcp.json`                  | Claude Code         |
| `plugin.json`                | Agent Plugins 1.0.0 |
| `mcp.json`                   | Agent Plugins 1.0.0 |

`skills/` and `packages/mcp` are shared; only the two manifests were added. `bun run
check:plugin` cross-checks them so they do not drift (it is part of `verify`).

The spec defines **only skills and MCP servers**, so Agent Plugins clients see the
`fusen-comments` skill and the `fusen` MCP server. The `fusen-triage` agent is Claude Code only.

`mcp.json` has no `env`. Only `${PLUGIN_ROOT}` and `${PLUGIN_DATA}` are expanded; writing
`${FUSEN_BASE_URL}` passes that literal string through. That is worse than leaving it unset:
the MCP server branches on whether FUSEN_BASE_URL **exists**, so it falls into an HTTP read of a
broken URL and never falls back to the browser. To read the server version, pass
`FUSEN_BASE_URL` in the environment that launches the client.

`command` is `bun`, so `bun install` must already have been run in the plugin root.
