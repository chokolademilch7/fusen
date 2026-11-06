/**
 * An in-memory store, so "install it and it works" is literally true.
 *
 * This is not a toy for tests only. It is the store a demo, a prototype or a
 * short-lived preview environment should use: no database, no migration, no
 * connection string. What it does not do is survive a restart, which is the
 * whole of its limitation and is stated in the README rather than hidden.
 *
 * It is also the reference implementation the contract kit runs against, so the
 * kit's own assertions are known to be satisfiable.
 */

import type { FeedbackItem } from "@fusen/core";
import type { CreateInput, FeedbackStore, VoteResult } from "./types.ts";

export type MemoryStore = FeedbackStore & {
  /** Drop everything. For tests and for a preview that wants a reset button. */
  clear: () => void;
};

export function createMemoryStore(seed: readonly FeedbackItem[] = []): MemoryStore {
  let items: FeedbackItem[] = [...seed];
  let nextId = items.reduce((max, item) => Math.max(max, Number(item.id)), 0) + 1;

  return {
    async list(): Promise<FeedbackItem[]> {
      // Newest first, matching what the panel shows without sorting.
      return [...items].sort((a, b) => Number(b.id) - Number(a.id));
    },

    async create(input: CreateInput): Promise<FeedbackItem> {
      const item: FeedbackItem = {
        id: nextId++,
        route: input.route,
        body: input.body,
        anchor: input.anchor,
        context: input.context,
        author_name: input.author.name,
        author_picture: input.author.picture ?? null,
        author_key: input.author.key,
        votes: 0,
        created_at: new Date().toISOString(),
      };
      items.push(item);
      return item;
    },

    async vote(id: number, delta: number): Promise<VoteResult | null> {
      const item = items.find((candidate) => Number(candidate.id) === id);
      if (!item) return null;
      item.votes = Number(item.votes) + delta;
      return { id: Number(item.id), votes: item.votes };
    },

    async remove(id: number): Promise<{ id: number } | null> {
      const before = items.length;
      items = items.filter((candidate) => Number(candidate.id) !== id);
      return items.length === before ? null : { id };
    },

    clear(): void {
      items = [];
      nextId = 1;
    },
  };
}
