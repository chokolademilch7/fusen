/**
 * The whole protocol, implemented against a key-value store in the browser.
 *
 * There is no server here and no request. The widget's four network calls are
 * satisfied locally, which is what makes the lite build install-and-go: a page
 * needs one script tag and nothing else — no database, no container, no port.
 *
 * The trade is stated plainly rather than buried: comments live in ONE browser
 * profile on ONE device. Nobody else sees them. That is the right shape for the
 * use this build is for — leaving yourself notes on a page while working on it,
 * and handing them to an AI afterwards — and the wrong shape for collecting
 * feedback from other people, which is what the server build is for.
 *
 * The row shape is identical to the server's, deliberately. A comment written
 * here can be handed to anything that reads the protocol, and the same widget
 * code runs over either.
 */

import type { Anchor, FeedbackHttp, FeedbackItem, PageContext } from "@fusen/core";
import type { Kv } from "./kv.ts";

const ITEMS_KEY = "items";
const NEXT_ID_KEY = "nextId";
const IDENTITY_KEY = "identity";

export type LocalIdentity = { name: string; key: string };

export type LocalStoreOptions = {
  kv: Kv;
  /** Author shown on comments. Defaults to a stable per-browser identity. */
  identity?: LocalIdentity;
  /** Called after every mutation, with the frame the widget would have received
   *  from a realtime feed. This is how the local transport hears about writes. */
  onChange?: (item: FeedbackItem | { deletedId: number }) => void;
};

/**
 * A stable-ish identity for this browser profile.
 *
 * It is not an authentication of anything and is not treated as one. Its only
 * job is to make the widget draw a delete button on comments this browser
 * wrote, and since the store IS this browser, that is the whole of the
 * permission model. Saying so is more honest than implying a check exists.
 */
export async function resolveLocalIdentity(
  kv: Kv,
  override?: LocalIdentity,
): Promise<LocalIdentity> {
  if (override) return override;
  const existing = await kv.get<LocalIdentity>(IDENTITY_KEY);
  if (existing) return existing;
  const created: LocalIdentity = { name: "You", key: `local-${randomKey()}` };
  await kv.set(IDENTITY_KEY, created);
  return created;
}

function randomKey(): string {
  const c: Crypto | undefined = globalThis.crypto;
  // `randomUUID` is secure-context only, and a lite page is exactly the kind of
  // thing served over plain http from a file server or a LAN address.
  if (typeof c?.getRandomValues === "function") {
    const bytes = c.getRandomValues(new Uint8Array(8));
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}

export type LocalStore = FeedbackHttp & {
  /** Everything stored, newest first. The read path for tooling. */
  dump(): Promise<FeedbackItem[]>;
  /** Drop everything in this browser. */
  clear(): Promise<void>;
  identity(): Promise<LocalIdentity>;
};

export function createLocalStore(options: LocalStoreOptions): LocalStore {
  const kv = options.kv;
  const notify = options.onChange ?? (() => {});

  async function readItems(): Promise<FeedbackItem[]> {
    return (await kv.get<FeedbackItem[]>(ITEMS_KEY)) ?? [];
  }

  async function nextId(): Promise<number> {
    // Allocate atomically: the counter now holds the id AFTER the one returned.
    return (await kv.update<number>(NEXT_ID_KEY, (current) => (current ?? 1) + 1)) - 1;
  }

  function newestFirst(items: readonly FeedbackItem[]): FeedbackItem[] {
    return [...items].sort((a, b) => Number(b.id) - Number(a.id));
  }

  return {
    async list() {
      return { feedback: newestFirst(await readItems()) };
    },

    async create(
      route: string,
      body: string,
      anchor: Anchor,
      context: PageContext | null,
      _nonce: string,
    ) {
      // The nonce is ignored on purpose. It exists so a page can recognise the
      // realtime echo of its OWN write and decline to insert it twice — and the
      // local transport never echoes a write back to the tab that made it, so
      // there is nothing to suppress. Cross-tab frames carry it through.
      const identity = await resolveLocalIdentity(kv, options.identity);
      const item: FeedbackItem = {
        id: await nextId(),
        route,
        body,
        anchor,
        context,
        author_name: identity.name,
        author_picture: null,
        author_key: identity.key,
        votes: 0,
        created_at: new Date().toISOString(),
      };
      await kv.update<FeedbackItem[]>(ITEMS_KEY, (items) => [...(items ?? []), item]);
      notify(item);
      return { feedback: item };
    },

    async vote(id: number, delta: number, _nonce: string) {
      let found: FeedbackItem | undefined;
      await kv.update<FeedbackItem[]>(ITEMS_KEY, (items) => {
        const current = items ?? [];
        found = current.find((item) => Number(item.id) === id);
        if (!found) throw new Error(`no such comment: ${id}`);
        found.votes = Number(found.votes) + delta;
        return current;
      });
      if (!found) throw new Error(`no such comment: ${id}`);
      notify(found);
      return { id, votes: found.votes };
    },

    async remove(id: number, _nonce: string) {
      await kv.update<FeedbackItem[]>(ITEMS_KEY, (items) => {
        const current = items ?? [];
        if (!current.some((item) => Number(item.id) === id)) {
          throw new Error(`no such comment: ${id}`);
        }
        return current.filter((item) => Number(item.id) !== id);
      });
      notify({ deletedId: id });
      return { id };
    },

    async dump() {
      return newestFirst(await readItems());
    },

    async clear() {
      await kv.delete(ITEMS_KEY);
      await kv.delete(NEXT_ID_KEY);
    },

    identity() {
      return resolveLocalIdentity(kv, options.identity);
    },
  };
}
