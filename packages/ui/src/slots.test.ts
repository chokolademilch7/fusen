/**
 * The panel header slot, and the regression it exists to prevent: a host action
 * that leads into the host's own pages must CLOSE THE PANEL BEFORE NAVIGATING,
 * or the fullscreen panel is left covering the page it just went to.
 *
 * This is the seam, not a rendering test — there is no jsdom/happy-dom in this
 * repo's test runner, so `slots.ts` is deliberately free of DOM construction and
 * the fakes here are plain values (the same pattern as `delete-confirm.test.ts`
 * and `packages/core/test/fake-dom.ts`).
 */

import { describe, expect, test } from "bun:test";
import {
  createPanelHeaderContext,
  type PanelHeaderContext,
  resolveHeaderActions,
  resolvePinColor,
  visibleItems,
} from "./slots.ts";
import type { FeedbackItem } from "./types.ts";

/** A context that records what the panel was asked to do, in order. */
function recordingContext(): { context: PanelHeaderContext; calls: string[] } {
  const calls: string[] = [];
  const context = createPanelHeaderContext({
    close: () => calls.push("close"),
    navigate: (route) => calls.push(`navigate:${route}`),
  });
  return { context, calls };
}

describe("createPanelHeaderContext", () => {
  test("goTo closes the panel BEFORE navigating", () => {
    const { context, calls } = recordingContext();
    context.goTo("/triage");
    // Order is the assertion. Navigating without closing leaves the fullscreen
    // panel on top of the destination.
    expect(calls).toEqual(["close", "navigate:/triage"]);
  });

  test("nothing happens until goTo is called", () => {
    const { calls } = recordingContext();
    expect(calls).toEqual([]);
  });
});

describe("resolveHeaderActions", () => {
  test("a host's action factory gets the panel's close-then-navigate", () => {
    const { context, calls } = recordingContext();

    // How the original app composed its owner-only /triage link: build a node, wire its
    // activation to the context handed in. The node is a string here because the
    // seam accepts `Node | string | null` and a string needs no DOM.
    let activate = (): void => {
      throw new Error("factory never wired its action");
    };
    const content = resolveHeaderActions((ctx) => {
      activate = () => ctx.goTo("/triage");
      return "triage-link";
    }, context);

    // The factory must be RESOLVED at the point of insertion. Left unresolved it
    // would reach JSX, where the renderer calls it as a zero-arg accessor: no
    // context, and the failure only surfaces on activation.
    expect(content).toBe("triage-link");
    expect(typeof content).not.toBe("function");
    // Merely rendering the action must not close or navigate anything.
    expect(calls).toEqual([]);

    activate();
    expect(calls).toEqual(["close", "navigate:/triage"]);
  });

  test("finished content is passed through untouched", () => {
    const { context, calls } = recordingContext();
    const node = { nodeType: 1 } as unknown as Node;
    expect(resolveHeaderActions(node, context)).toBe(node);
    expect(resolveHeaderActions("plain", context)).toBe("plain");
    expect(calls).toEqual([]);
  });

  test("an unset slot resolves to nothing", () => {
    const { context } = recordingContext();
    expect(resolveHeaderActions(undefined, context)).toBeNull();
    expect(resolveHeaderActions(null, context)).toBeNull();
  });
});

describe("resolvePinColor", () => {
  const items = [{ id: 1 }, { id: 2 }] as FeedbackItem[];

  test("hands the colourer the whole cluster and returns its colour", () => {
    let seen: FeedbackItem[] = [];
    const color = resolvePinColor((cluster) => {
      seen = cluster;
      return "var(--done)";
    }, items);
    expect(color).toBe("var(--done)");
    expect(seen).toBe(items);
  });

  test("falls back to the default ring for no colourer, null, or a non-string", () => {
    expect(resolvePinColor(undefined, items)).toBeNull();
    expect(resolvePinColor(() => null, items)).toBeNull();
    expect(resolvePinColor(() => "", items)).toBeNull();
    expect(resolvePinColor((() => 42) as never, items)).toBeNull();
  });
});

describe("visibleItems", () => {
  const items = [{ id: 1 }, { id: 2 }, { id: 3 }] as FeedbackItem[];

  test("draws everything without a hider", () => {
    expect(visibleItems(undefined, items)).toBe(items);
  });

  test("leaves out exactly the items the hider returns true for", () => {
    expect(visibleItems((item) => item.id === 2, items).map((i) => i.id)).toEqual([1, 3]);
  });

  test("only a literal true hides and a throw hides nothing, so a broken hider cannot empty the list", () => {
    expect(visibleItems((() => "yes") as never, items)).toEqual(items);
    const throwing = (item: FeedbackItem) => {
      if (item.id === 2) throw new Error("host bug");
      return item.id === 3;
    };
    expect(visibleItems(throwing, items).map((i) => i.id)).toEqual([1, 2]);
  });
});
