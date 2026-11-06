import { describe, expect, test } from "bun:test";
import type { Anchor, FeedbackItem } from "./types.ts";
import {
  clearFocus,
  clearFocusOwnedBy,
  focusOnAnchor,
  focusOrphaned,
  focusOwner,
  sameAnchor,
} from "./focus.ts";

const anchor = (route: string): Anchor => ({
  version: 1,
  route,
  selectorPath: "main > .x",
  fingerprint: { tag: "div", dataAttrs: { a: "1", b: "2" }, classList: ["x"], textSnippet: "" },
  rectRatio: { x: 0.5, y: 0.5 },
});
const a = anchor("/a");
const b = anchor("/b");
const items = [
  { id: 1, anchor: a },
  { id: 2, anchor: b },
] as unknown as FeedbackItem[];

describe("sameAnchor", () => {
  test("compares by value, ignoring key order at every level", () => {
    const reordered = JSON.parse(
      '{"rectRatio":{"y":0.5,"x":0.5},"route":"/a","version":1,"selectorPath":"main > .x",' +
        '"fingerprint":{"textSnippet":"","classList":["x"],"dataAttrs":{"b":"2","a":"1"},"tag":"div"}}',
    ) as Anchor;
    expect(sameAnchor(a, reordered)).toBe(true);
    expect(sameAnchor(a, { ...a })).toBe(true);
  });

  test("a key set to undefined equals a missing key, as it does after JSON", () => {
    const withUndefined = { ...a, fingerprint: { ...a.fingerprint, id: undefined } } as Anchor;
    expect(sameAnchor(a, withUndefined)).toBe(true);
  });

  test("false for different anchors or a missing one", () => {
    expect(sameAnchor(a, b)).toBe(false);
    expect(sameAnchor(null, a)).toBe(false);
    expect(sameAnchor(a, undefined)).toBe(false);
  });
});

describe("focusOrphaned", () => {
  test("true once no drawn item carries the focused anchor (hidden or deleted)", () => {
    expect(focusOrphaned(a, items.slice(1))).toBe(true);
    expect(focusOrphaned(a, [])).toBe(true);
  });

  test("false while some drawn item carries it, or nothing is focused", () => {
    expect(focusOrphaned({ ...a }, items)).toBe(false);
    const shared = [...items.slice(1), { id: 3, anchor: { ...a } }] as unknown as FeedbackItem[];
    expect(focusOrphaned(a, shared)).toBe(false);
    expect(focusOrphaned(null, [])).toBe(false);
  });
});

describe("focus ownership", () => {
  test("only the widget that started a focus can clear it on its way out", () => {
    const mine = {};
    const theirs = {};
    void focusOnAnchor(a, mine);
    expect(focusOwner()).toBe(mine);
    clearFocusOwnedBy(theirs);
    expect(focusOwner()).toBe(mine);
    clearFocusOwnedBy(mine);
    expect(focusOwner()).toBeUndefined();
    clearFocus();
  });
});
