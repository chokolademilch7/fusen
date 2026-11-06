/**
 * Assembling the three pieces into the pair the widget asks for.
 *
 * Separate from `index.ts` so the assembly is testable on its own, and separate
 * from `auto.ts` so a page that wants the pieces without the side effect of
 * registering a custom element can have them.
 */

import type { FeedbackHttp, FeedbackTransport } from "@fusen/core";
import { installBridge, type FusenBridge } from "./bridge.ts";
import { createIndexedDbKv, type Kv } from "./kv.ts";
import { createLocalStore, type LocalIdentity, type LocalStore } from "./store.ts";
import { createLocalRealtime, DEFAULT_CHANNEL } from "./transport.ts";
import { readerFromStore, registerWebmcpTools } from "./webmcp.ts";

export type FusenLiteOptions = {
  /** Storage. Defaults to IndexedDB. Pass `createMemoryKv()` for a page that
   *  should forget everything on reload. */
  kv?: Kv;
  /** Author shown on comments. Defaults to a stable per-browser identity. */
  identity?: LocalIdentity;
  /** BroadcastChannel name for cross-tab updates. */
  channel?: string;
  /** Publish `window.__fusen`. On by default: it is the ONLY way anything
   *  outside the page can read these comments, and turning it off is a
   *  deliberate choice to make them unreadable by tooling. */
  bridge?: boolean;
  /**
   * Publish the comments as WebMCP tools on `document.modelContext`.
   *
   * OFF by default, unlike the bridge, and `webmcp.ts` says why: the bridge
   * needs a privileged external actor to read it, and this needs only an agent
   * the browser has already attached. A no-op on a browser without the API.
   */
  webmcp?: boolean;
};

export type FusenLite = {
  http: FeedbackHttp;
  transport: FeedbackTransport;
  /** The store, for a page that wants to read or clear it directly. */
  store: LocalStore;
  /** Present unless `bridge: false`. */
  bridge?: FusenBridge;
  /**
   * Present when `webmcp: true` was asked for: the registration in flight, which
   * resolves to whether this browser had a `ModelContext` to register with.
   *
   * A promise rather than a boolean because registration is async in the spec,
   * and awaiting it inside a synchronous factory would make every page that does
   * not care about WebMCP wait for it.
   */
  webmcp?: Promise<boolean>;
  /** Release the cross-tab channel, and unregister the WebMCP tools. */
  close: () => void;
};

export function createFusenLite(options: FusenLiteOptions = {}): FusenLite {
  const kv = options.kv ?? createIndexedDbKv();
  const realtime = createLocalRealtime(options.channel ?? DEFAULT_CHANNEL);
  const store = createLocalStore({
    kv,
    ...(options.identity ? { identity: options.identity } : {}),
    // Every local write is announced to the OTHER tabs. The writing tab already
    // applied it from the call's return value.
    onChange: (change) => realtime.publish(change),
  });

  // Aborting is the spec's own way to unregister a WebMCP tool, so `close()`
  // owns it rather than there being a second teardown call to remember.
  const webmcpLife = new AbortController();

  const lite: FusenLite = {
    http: store,
    transport: realtime.transport,
    store,
    close: () => {
      webmcpLife.abort();
      realtime.close();
    },
  };

  if (options.bridge !== false) lite.bridge = installBridge(store);
  if (options.webmcp) {
    lite.webmcp = registerWebmcpTools({
      reader: readerFromStore(store),
      signal: webmcpLife.signal,
    });
  }
  return lite;
}
