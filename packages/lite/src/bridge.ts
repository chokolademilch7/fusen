/**
 * The read hatch on the page: `window.__fusen`.
 *
 * WHY THIS EXISTS. With no server there is no endpoint for a tool to call, and
 * the comments sit in IndexedDB, which is reachable only from inside the page.
 * Anything that wants to read them — a Chrome DevTools Protocol session, a
 * Playwright script, a browser extension — has to run code in the page.
 *
 * The naive way is for the tool to open the database itself and walk it. That
 * couples every tool to the storage layout: rename a store, change how items
 * are keyed, and every reader breaks at once, silently, returning an empty list
 * that looks exactly like "no comments yet". So the page publishes a small,
 * versioned API instead, and the storage layout stays private.
 *
 * The whole surface is one line for a caller:
 *
 *     await window.__fusen.dump()
 *
 * which works verbatim through `Runtime.evaluate` with `awaitPromise: true`,
 * through `page.evaluate`, and in a devtools console.
 *
 * `version` is there so a reader can refuse a page it does not understand
 * rather than guess. It changes only when the shape of what these functions
 * return changes.
 */

import type { FeedbackItem } from "@fusen/core";
import type { LocalStore } from "./store.ts";

/** Bumped only on a breaking change to what these functions return. */
export const BRIDGE_VERSION = 1;

export type FusenBridge = {
  version: number;
  /** Every comment in this browser, newest first. */
  dump: () => Promise<FeedbackItem[]>;
  /** How many there are, without transferring them. */
  count: () => Promise<number>;
  /** Comment counts per route, busiest first — the cheap orienting question. */
  routes: () => Promise<{ route: string; count: number; votes: number }[]>;
  /** Drop everything in this browser. */
  clear: () => Promise<void>;
  /** Who this browser writes as. Not an authentication of anything. */
  identity: () => Promise<{ name: string; key: string }>;
};

declare global {
  // eslint-disable-next-line no-var
  var __fusen: FusenBridge | undefined;
}

export function createBridge(store: LocalStore): FusenBridge {
  return {
    version: BRIDGE_VERSION,
    dump: () => store.dump(),
    async count() {
      return (await store.dump()).length;
    },
    async routes() {
      const counts = new Map<string, { count: number; votes: number }>();
      for (const item of await store.dump()) {
        const key = String(item.route);
        const entry = counts.get(key) ?? { count: 0, votes: 0 };
        entry.count += 1;
        entry.votes += Number(item.votes);
        counts.set(key, entry);
      }
      return [...counts.entries()]
        .map(([route, entry]) => ({ route, ...entry }))
        .sort((a, b) => b.count - a.count);
    },
    clear: () => store.clear(),
    identity: () => store.identity(),
  };
}

/** Attach the bridge to `globalThis`. Idempotent. */
export function installBridge(store: LocalStore): FusenBridge {
  const bridge = createBridge(store);
  globalThis.__fusen = bridge;
  return bridge;
}
