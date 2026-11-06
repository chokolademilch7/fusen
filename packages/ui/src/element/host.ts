/**
 * What the custom element does to its own HOST node, kept out of the element
 * definition so it can be tested without a browser.
 *
 * Everything here is deliberately imperative and DOM-shaped rather than
 * reactive: the wiring in `element.tsx` is then thin enough to read at a glance,
 * and these three behaviours — attribute marking, state reflection, stylesheet
 * adoption — are exercised in `host.test.ts` against hand-rolled fakes.
 */

import type { StateValue } from "xstate";
import { SELF_ATTR } from "../runtime.ts";
import { stateAttr } from "../solid.ts";
import { FEEDBACK_WIDGET_CSS } from "./styles.ts";

export { SELF_ATTR };

/**
 * PUBLISHED CONTRACT — READ THIS BEFORE CHANGING THE MACHINE.
 *
 * `data-machine="feedback"` plus `data-state="<dot-joined state>"` is how the
 * widget tells the outside world what it is doing, and two mechanisms outside
 * this package read that pair with RAW DOM QUERIES, which do not pierce a shadow
 * root: a page-context collector that scans for `[data-machine]` elements, and a
 * browser test suite that waits on `[data-machine="feedback"][data-state="…"]`
 * selectors and reads the attribute inside an evaluated page script. That is why
 * the pair is reflected onto the LIGHT-DOM host element and not left to
 * `Badge.tsx` alone — from outside the shadow root, the badge does not exist.
 *
 * The five names below are therefore a published API, and so is the constraint
 * that produces them: THE MACHINE MUST STAY NON-PARALLEL. `data-state` is a
 * single joined string, and a parallel machine's state value is a set of
 * simultaneously-active regions, which no single joined string can express — a
 * consumer matching on `data-state="mode.picking"` would simply stop matching.
 * Connection status lives in `store.ts` as a plain signal for exactly this
 * reason. See the header of `machine.ts`; renaming or re-nesting any of these is
 * a breaking change, not a refactor.
 */
export const PUBLISHED_FEEDBACK_STATES = [
  "idle",
  "mode.picking",
  "mode.composing",
  "mode.submitting",
  "mode.error",
] as const;

export type PublishedFeedbackState = (typeof PUBLISHED_FEEDBACK_STATES)[number];

/** Value of `data-machine` on the host. */
export const MACHINE_NAME = "feedback";
export const MACHINE_ATTR = "data-machine";
export const STATE_ATTR = "data-state";

/**
 * `SELF_ATTR` (re-exported above from `runtime.ts`, where the matching
 * self-exclusion selector is built) is the widget's self-marking attribute.
 *
 * The host element MUST carry it. `PickOverlay` hit-tests with
 * `document.elementsFromPoint`, which retargets shadow descendants to the shadow
 * HOST — so an unmarked host is returned as an ordinary page element and the
 * widget anchors every comment to itself on every tap.
 */

/** Minimal shapes this module needs, so tests can pass plain objects. */
export type AttributeTarget = {
  setAttribute(name: string, value: string): void;
};

/** A shadow root, as far as this module is concerned. */
export type StyleTarget = {
  adoptedStyleSheets: readonly CSSStyleSheet[];
};

/** Anything with the shape of an xstate actor snapshot stream. */
export type StateActor = {
  getSnapshot(): { value: StateValue };
  subscribe(next: (snapshot: { value: StateValue }) => void): { unsubscribe(): void };
};

/**
 * Adopt the package's stylesheet into a shadow root.
 *
 * `adoptedStyleSheets` rather than an appended `<style>` node on purpose: Solid
 * clears the render root's children when it inserts the component, and manages
 * that child list afterwards, so a `<style>` element living there would be wiped
 * or confuse its bookkeeping. An adopted sheet is not a child node, so it
 * survives every render and cannot be reordered.
 */
export function attachStyles(root: StyleTarget, css: string = FEEDBACK_WIDGET_CSS): void {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(css);
  root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
}

/**
 * Stamp the three light-DOM attributes onto the host.
 *
 * `data-state` is set to `idle` here rather than waiting for the machine's first
 * notification, because a consumer waiting on
 * `[data-machine="feedback"][data-state="idle"]` must not see a frame where the
 * attribute is missing.
 *
 * Separate from `attachStyles` because the two have different lifetimes: this is
 * safe (and cheap) to re-run on every connect, whereas adopting the stylesheet
 * again would pile up a duplicate sheet per disconnect/reconnect cycle.
 */
export function markFeedbackHost(host: AttributeTarget): void {
  host.setAttribute(SELF_ATTR, "");
  host.setAttribute(MACHINE_ATTR, MACHINE_NAME);
  host.setAttribute(STATE_ATTR, "idle");
}

/**
 * Keep `data-state` on the host in step with the machine. Returns the
 * unsubscribe function; the caller owns when to stop.
 */
export function reflectMachineState(host: AttributeTarget, actor: StateActor): () => void {
  const write = (value: StateValue) => {
    const next = stateAttr(value);
    // stateAttr returns "" for a not-yet-started actor. Publishing an empty
    // data-state would make every selector in the contract stop matching, so
    // hold whatever is already there (markFeedbackHost put "idle" in).
    if (next !== "") host.setAttribute(STATE_ATTR, next);
  };
  write(actor.getSnapshot().value);
  const subscription = actor.subscribe((snapshot) => write(snapshot.value));
  return () => subscription.unsubscribe();
}

/**
 * Closes the gap in the assumption that `--bg` and `--text` come as a pair.
 *
 * Custom properties inherit across the shadow boundary, so when the host defines
 * `--bg` the widget's panel, popovers and composer paint that color. The text
 * color, though, is read from `--text`, and if the host does not use that name
 * it falls back to the widget's light fallback (#0f0f0f).
 *
 * Measured (2026-09-20, host-app): the host defined `--bg: #171614` and
 * `--fg: #ece8e1`, so the panel body came out rgb(15,15,15) on rgb(23,22,20).
 * Contrast ratio 1.06:1 — the list was effectively unreadable. Nothing is wrong
 * with the host's naming; we are the ones reading the generic names `--bg` /
 * `--text` without asking.
 *
 * The existing "list body does not blend into the background" test missed this
 * because it checked `textColor !== panelBg`. The colors do differ, so it
 * stayed green.
 *
 * This corrects **only the unpaired case**. Hosts that define both are not
 * touched, so existing integrations look the same. An unreadable `--bg` (a
 * gradient, or one routed through another var()) is left alone rather than
 * guessed — a known gap is easier to trace than a wrong color forced on.
 */
const TEXT_ON_DARK = "#f1f1f1";
const TEXT_ON_LIGHT = "#0f0f0f";

/** Reads only `#abc` / `#aabbcc` / `rgb(…)`. Returns null otherwise. */
function readRgb(value: string): [number, number, number] | null {
  const v = value.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v);
  if (hex) {
    const h = hex[1]!;
    const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
    return [0, 2, 4].map((i) => Number.parseInt(full.slice(i, i + 2), 16)) as [
      number,
      number,
      number,
    ];
  }
  const rgb = /^rgba?\(([^)]*)\)$/i.exec(v);
  if (!rgb) return null;
  const parts = rgb[1]!
    .split(/[\s,/]+/)
    .filter(Boolean)
    .map(Number);
  if (parts.length < 3 || parts.slice(0, 3).some((n) => !Number.isFinite(n))) return null;
  return [parts[0]!, parts[1]!, parts[2]!];
}

/** WCAG 2.x relative luminance. */
function relativeLuminance([r, g, b]: [number, number, number]): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function pairSurfaceTokens(
  host: { style: { setProperty(name: string, value: string): void } },
  read: (name: string) => string,
): void {
  if (read("--text").trim()) return;
  const bg = readRgb(read("--bg"));
  if (!bg) return;
  host.style.setProperty("--text", relativeLuminance(bg) < 0.5 ? TEXT_ON_DARK : TEXT_ON_LIGHT);
}
