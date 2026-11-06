/**
 * A `FeedbackStore` backed by a browser.
 *
 * This is the third implementation of the same seam, and the reason the seam
 * was worth having:
 *
 *     createMemoryStore()             in-process
 *     createHttpStore({ baseUrl })    a fusen server over HTTP
 *     createCdpStore({ port })        a page in a running browser   <- here
 *
 * The MCP tools are written against `FeedbackStore` and cannot tell the
 * difference. So the lite build — which has no server, on purpose — gets the
 * same `list_feedback` / `get_feedback` / `summarize_routes` as a full
 * deployment, with the same names and arguments. A model does not have to know,
 * or ask, which one it is looking at.
 *
 * READ-ONLY, and not by omission. The page publishes a read hatch and no write
 * API, so there is nothing to write through. Writing would also be the wrong
 * default here: a comment is something a person leaves while looking at a page.
 *
 * MULTIPLE TABS. A browser can have several fusen pages open. Their comments are
 * genuinely separate stores (IndexedDB is per-origin), but a single `list()` has
 * to return one array — so they are concatenated, and `source_url` is attached
 * to each item so nothing is silently merged into an indistinguishable pile.
 */

import type { FeedbackItem } from "@fusen/core";
import type { CreateInput, FeedbackStore, VoteResult } from "@fusen/server";
import { DEFAULT_CDP_PORT, findFusenPages, SUPPORTED_BRIDGE_VERSION } from "./cdp.ts";

export type CdpStoreOptions = {
  /** DevTools port. Chrome opens it with `--remote-debugging-port`. */
  port?: number;
  /** Only read pages whose URL contains this. */
  urlFilter?: string;
};

function unsupported(action: string): never {
  throw new Error(
    `${action} is not available over CDP: the page publishes a read-only hatch. ` +
      `Comments are written by a person in the browser, or through a fusen server.`,
  );
}

export function createCdpStore(options: CdpStoreOptions = {}): FeedbackStore {
  const port = options.port ?? DEFAULT_CDP_PORT;

  return {
    async list(): Promise<FeedbackItem[]> {
      const pages = await findFusenPages({
        port,
        ...(options.urlFilter ? { urlFilter: options.urlFilter } : {}),
      });
      const items: FeedbackItem[] = [];
      for (const page of pages) {
        for (const comment of page.comments) {
          // `source_url` rides along as an application-specific field — the wire
          // type allows extras exactly so a host can attach its own vocabulary,
          // and here the host is the browser. Without it, two tabs' comments
          // arrive indistinguishable, and ids collide (each page numbers from 1).
          items.push({
            ...comment,
            source_url: page.url,
            source_title: page.title,
            ...(page.version !== SUPPORTED_BRIDGE_VERSION
              ? { source_bridge_version_unsupported: page.version }
              : {}),
          });
        }
      }
      return items;
    },

    async create(_input: CreateInput): Promise<FeedbackItem> {
      return unsupported("creating a comment");
    },
    async vote(_id: number, _delta: number): Promise<VoteResult | null> {
      return unsupported("voting");
    },
    async remove(_id: number): Promise<{ id: number } | null> {
      return unsupported("deleting a comment");
    },
  };
}
