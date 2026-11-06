[← README](../../README.md) · English | [日本語](../ja/guide/lite.md)

# Lite: no server

> [!IMPORTANT]
> **What lite cannot do**
>
> - Notes stay in one browser profile on one device (they are stored in IndexedDB).
> - Other people cannot see them.
> - They cannot be shared across machines.
> - Nothing is stored on a server.
> - An agent needs WebMCP or CDP to read them.
> - There are no write tools for agents.
>
> If you need any of these, use the [server version](./server.md).

```html
<script type="module" src="fusen-lite.js"></script>
<fusen-widget route="/"></fusen-widget>
```

That is all. Serve `fusen-lite.js` (about 170KB, 50KB gzipped, dependencies bundled) and load
it: the tag comes to life and saves to IndexedDB. Take the file from
`node_modules/fusen/dist/fusen-lite.js` after `bun add fusen`, or from the CDN at
`https://cdn.jsdelivr.net/npm/fusen/dist/fusen-lite.js`. The page needs no build step, no
server and no database.

## The storage backend is pluggable

The widget does not know where it saves. Storage and the realtime channel are a plug-in point
(`configureFusenWidget({ http, transport })`): the server version plugs HTTP and SSE into it,
and lite plugs in an IndexedDB and BroadcastChannel implementation. **Not one line of the
widget changed** for lite. Cross-tab updates work for real.

**The trade-off**: comments stay in one browser profile on one device. Nobody else sees them.

## Reading from outside

With no server there is nothing to call. Instead the page exposes a read hatch.

```js
await window.__fusen.dump(); // everything, newest first
await window.__fusen.routes(); // count per route
```

The same one line works over CDP, from Playwright, or in the devtools console. The bundled
script (run it inside a clone of the fusen repository):

```bash
chromium --remote-debugging-port=9222 --user-data-dir=/tmp/fusen-profile
bun run scripts/read-via-cdp.ts
```

**Tools do not open IndexedDB directly.** That would couple every tool to the storage layout,
and when the layout changed they would get an empty array back, indistinguishable from "zero
comments".

Ways to hand the notes to an AI agent attached to the browser (WebMCP, the MCP server's CDP
path) are collected in [Letting AI agents read the notes](./agents.md).

## Which one to use

|                | lite                                   | server version                        |
| -------------- | -------------------------------------- | ------------------------------------- |
| Stored in      | the browser (IndexedDB)                | your own server + database            |
| You provide    | **nothing**                            | one server                            |
| Who can see it | **only your own browser**              | everyone who views the page           |
| Use it for     | sticking notes for yourself during dev | collecting feedback from other people |

The widget code is the same, so you can move later.

## Both in one file: `fusen.js`

If you cannot decide, or want it to differ per page, there is a bundle that contains both
(`node_modules/fusen/dist/fusen.js`, or `https://cdn.jsdelivr.net/npm/fusen/dist/fusen.js` from
the CDN).

```html
<!-- server version -->
<script type="module" src="fusen.js"></script>

<!-- lite -->
<script type="module" src="fusen.js" data-mode="client"></script>
```

`client` means "comments stay in this browser"; `server` means "comments go where everyone can
see them". The modes are named after **where the data lives** (`lite` is the name of a build,
and readers of `data-mode="lite"` could not tell what it changed). Because the name `fusen/lite`
makes people write `lite` anyway, `lite` is accepted as `client` too.

Without `data-mode` you get the **server version**. `client` is a choice to keep everything in
one browser, so it has to be written down rather than picked silently. `<fusen-widget
mode="client">` also works, but **only the first one present at load time** is read.

The heavy part (SolidJS) is in both builds already, so carrying both adds only a few KB
(`fusen-lite.js` 170KB → `fusen.js` 171KB, gzipped 50.0KB → 50.2KB).

The mode is read **once, at load time**. Changing the attribute later does not switch it:
storage and the realtime channel are one pair for the whole page, and switching midway would
leave two stores disagreeing inside the same page. Editing it in devtools grants no extra
permissions (the server decides what can be written and deleted); the only thing that breaks is
the tinkerer's own view.

Saved comments do not move over. Lite's live in IndexedDB, the server version's in the
database, and switching does not merge them.
