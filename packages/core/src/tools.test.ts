import { describe, expect, test } from "bun:test";
import { DEFAULT_LIMIT, listFeedback, MAX_LIMIT, type FeedbackReader } from "./tools.ts";
import type { FeedbackItem } from "./wire.ts";

function reader(n: number): FeedbackReader {
  const items = Array.from(
    { length: n },
    (_, i) =>
      ({
        id: i + 1,
        route: "/",
        body: `comment ${i + 1}`,
        anchor: { fingerprint: { tag: "button", textSnippet: "", dataAttrs: {} } },
        author_name: "a",
        votes: 0,
        created_at: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString(),
      }) as unknown as FeedbackItem,
  );
  return { list: async () => items };
}

describe("listFeedback limit", () => {
  test("defaults to DEFAULT_LIMIT and accepts the bounds", async () => {
    const r = reader(MAX_LIMIT + 10);
    expect((await listFeedback(r)).returned).toBe(DEFAULT_LIMIT);
    expect((await listFeedback(r, { limit: 1 })).returned).toBe(1);
    expect((await listFeedback(r, { limit: MAX_LIMIT })).returned).toBe(MAX_LIMIT);
  });

  test("keeps newest first across the limit", async () => {
    const result = await listFeedback(reader(5), { limit: 2 });
    expect(result.feedback.map((f) => f.id)).toEqual([5, 4]);
  });

  for (const bad of [0, -1, Number.NaN, 2.5, MAX_LIMIT + 1, Number.POSITIVE_INFINITY]) {
    test(`rejects limit ${bad}`, async () => {
      await expect(listFeedback(reader(3), { limit: bad })).rejects.toThrow(RangeError);
    });
  }
});
