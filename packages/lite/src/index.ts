/**
 * `@fusen/lite` — fusen with no server, no database and no container.
 *
 * The widget already treats "how do I talk to storage" as an injected seam
 * (`configureFusenWidget({ http, transport })`), so a serverless build needs no
 * change to the widget at all: this package simply implements those two
 * interfaces against IndexedDB and BroadcastChannel. That is the whole trick.
 *
 *     import { configureFusenWidget, defineFusenElement } from "@fusen/ui";
 *     import { createFusenLite } from "@fusen/lite";
 *
 *     configureFusenWidget(createFusenLite());
 *     defineFusenElement();
 *
 * Or load `fusen-lite.js`, the bundled entry, which does exactly the three lines
 * above and needs no build step on the page.
 *
 * WHAT YOU GIVE UP, stated once and plainly: comments live in one browser
 * profile on one device, and nobody else can see them. This build is for
 * leaving yourself notes on a page and handing them to an AI afterwards. For
 * collecting feedback from other people, run `@fusen/server`.
 *
 * READING THE COMMENTS FROM OUTSIDE. There is no endpoint, so tools read the
 * page: `await window.__fusen.dump()`, which works through the Chrome DevTools
 * Protocol, Playwright, or a devtools console. See `bridge.ts` for why that is
 * a published API rather than tools opening the database themselves.
 *
 * Or the page hands them over itself: `data-webmcp` registers the same three
 * tools `@fusen/mcp` serves on `document.modelContext`, so an agent attached to
 * the browser reads them with no debug port and no second process. Off unless
 * asked for, Chrome-only for now, and secure-context only — `webmcp.ts` is
 * explicit about all three.
 */

export { createFusenLite, type FusenLite, type FusenLiteOptions } from "./lite.ts";
export {
  createLocalStore,
  resolveLocalIdentity,
  type LocalIdentity,
  type LocalStore,
} from "./store.ts";
export { createLocalRealtime, DEFAULT_CHANNEL, type LocalRealtime } from "./transport.ts";
export { BRIDGE_VERSION, createBridge, installBridge, type FusenBridge } from "./bridge.ts";
export {
  createWebmcpTools,
  findModelContext,
  readerFromStore,
  readWebmcpInputs,
  registerWebmcpTools,
  resolveWebmcp,
  WEBMCP_TOOL_NAMES,
} from "./webmcp.ts";
export type {
  ModelContextLike,
  ModelContextTool,
  RegisterWebmcpOptions,
  ToolResult,
  WebmcpDocument,
  WebmcpInputs,
} from "./webmcp.ts";
export {
  createIndexedDbKv,
  createMemoryKv,
  DEFAULT_DB_NAME,
  DEFAULT_STORE_NAME,
  type Kv,
} from "./kv.ts";
