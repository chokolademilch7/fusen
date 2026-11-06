/**
 * The shadow-boundary regression this helper exists to prevent.
 *
 * Fakes are plain objects with just the members the code touches — the
 * established pattern in this repo (see `packages/core/test/fake-dom.ts`);
 * there is no jsdom/happy-dom here.
 */

import { describe, expect, test } from "bun:test";
import { DELETE_BUTTON_CLASS, isDeleteButtonTap } from "./delete-confirm.ts";

function node(...classes: string[]) {
  return { classList: { contains: (t: string) => classes.includes(t) } };
}

/** A document-level listener sees `target` retargeted to the shadow host, while
 *  `composedPath()` still reports the real path through the shadow tree. */
function retargetedEvent(path: unknown[], host: unknown) {
  return { target: host, composedPath: () => [...path, host, {}, {}] };
}

describe("isDeleteButtonTap", () => {
  test("sees the delete button even though the event target was retargeted", () => {
    const button = node(DELETE_BUTTON_CLASS, "confirming");
    const icon = node("ms");
    const host = node("some-host");
    const event = retargetedEvent([icon, button], host);

    // This is the whole point: the old check looked at event.target, which is the
    // host here, and therefore read the first tap on delete as "tapped outside"
    // and cancelled the confirmation it had just opened.
    expect((event.target as ReturnType<typeof node>).classList.contains(DELETE_BUTTON_CLASS)).toBe(
      false,
    );
    expect(isDeleteButtonTap(event)).toBe(true);
  });

  test("a tap anywhere else is outside", () => {
    const host = node("some-host");
    expect(isDeleteButtonTap(retargetedEvent([node("feedback-item-vote")], host))).toBe(false);
  });

  test("tolerates non-element entries in the path (document, window)", () => {
    const event = { composedPath: () => [null, undefined, {}, node(DELETE_BUTTON_CLASS)] };
    expect(isDeleteButtonTap(event)).toBe(true);
  });

  test("an empty path is not a delete tap", () => {
    expect(isDeleteButtonTap({ composedPath: () => [] })).toBe(false);
  });
});
