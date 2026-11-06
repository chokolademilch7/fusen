/**
 * The panel's two CONTENT SLOTS — what a host may hand in, and what the header
 * slot gets handed back.
 *
 * Deliberately framework-free and DOM-construction-free: the types are
 * `Node | string | null` (what any framework's rendered output already is, Solid
 * JSX included, since it compiles to real DOM nodes), and the only logic here is
 * plain function calls over plain values. That is what keeps this file — and the
 * behaviour of the header slot in particular — unit-testable in `slots.test.ts`;
 * there is no jsdom/happy-dom in this repo's test runner.
 *
 * ── WHY THE HEADER SLOT IS NOT JUST A NODE ────────────────────────────────────
 *
 * A header action is an app's link INTO ITS OWN PAGES, and the panel is
 * fullscreen below the docked breakpoint — so it would cover the very page the
 * action just navigated to. The panel therefore has to close FIRST, and then
 * navigate.
 *
 * A host handing in a finished node cannot do that: closing is the panel's own
 * (machine-external) state, and reaching for it from outside would mean the host
 * groping through the widget's shadow DOM. So the header slot may instead be a
 * FACTORY, handed a `PanelHeaderContext` whose `goTo` is the panel's own
 * close-then-navigate action — the same one the per-item route buttons use. The
 * ordering guarantee then lives in ONE place, inside the widget, where a host
 * cannot get it wrong by forgetting half of it.
 */

import type { FeedbackItem } from "./types.ts";

/**
 * Anything a host can hand back for one of the two content slots. A DOM node, a
 * string, or nothing — no framework types, and no need for the host to adopt this
 * package's renderer.
 */
export type FeedbackSlotContent = Node | string | null;

/** Renderer for the per-item slot. A named type so the accessors, the props type
 *  and the widget cannot drift apart. */
export type FeedbackItemMetaRenderer = (item: FeedbackItem) => FeedbackSlotContent;

/** What the panel hands a header-slot factory: the panel's own actions, for the
 *  parts of the interaction the host must not reimplement. */
export type PanelHeaderContext = {
  /**
   * Go to one of the HOST's routes, closing the panel first so the destination is
   * not left covered by a fullscreen panel. The widget itself never navigates —
   * this ends up as the host's own navigation intent (`onNavigate` /
   * `feedback-navigate`), which the host is free to wrap in a transition.
   */
  goTo: (route: string) => void;
};

/**
 * The factory form of the header slot.
 *
 * MUST RETURN FRESH CONTENT ON EVERY CALL — the panel re-resolves the slot when
 * the property changes, and a reused node can only ever be in one place.
 */
export type PanelHeaderActionsFactory = (context: PanelHeaderContext) => FeedbackSlotContent;

/**
 * Host-specific actions for the panel header, rendered before the close button.
 *
 * Either finished content, or a factory that wants the panel's actions (see
 * `PanelHeaderContext`) to wire its own onto. A function is unambiguously the
 * factory: the alternative is `Node | string | null`, none of which is callable.
 */
export type PanelHeaderActions = FeedbackSlotContent | PanelHeaderActionsFactory;

/** Build the context handed to a header-slot factory. `close` runs BEFORE
 *  `navigate`; that order is the whole point (see this file's header). */
export function createPanelHeaderContext(deps: {
  close: () => void;
  navigate: (route: string) => void;
}): PanelHeaderContext {
  return {
    goTo: (route) => {
      deps.close();
      deps.navigate(route);
    },
  };
}

/**
 * Turn whatever the host set into content the panel can insert.
 *
 * Resolving here, at the single point of insertion, is load-bearing: an
 * unresolved factory reaching JSX would be called by the renderer as a zero-arg
 * reactive accessor, so it would receive no context and only fail later, on
 * activation.
 */
export function resolveHeaderActions(
  actions: PanelHeaderActions | undefined,
  context: PanelHeaderContext,
): FeedbackSlotContent {
  if (typeof actions === "function") return actions(context);
  return actions ?? null;
}

/**
 * Colour for one on-page pin, which may stand for several items (a cluster).
 *
 * Application vocabulary again: the widget does not know what a colour MEANS
 * (a review status, a pipeline stage…), only where to draw it — the ring around
 * the pin's avatars. Return any CSS colour (a `var(--token)` reaches through the
 * shadow root, since custom properties inherit), or `null` for the default ring.
 * The cluster is handed whole because only the host knows how its states
 * combine.
 */
export type PinColorer = (items: FeedbackItem[]) => string | null;

/** The colour to draw for a cluster, or `null`. Anything but a non-empty string
 *  — a host bug, or no colourer at all — falls back to the default ring rather
 *  than reaching the inline style. */
export function resolvePinColor(
  colorer: PinColorer | undefined,
  items: FeedbackItem[],
): string | null {
  const color = colorer?.(items);
  return typeof color === "string" && color !== "" ? color : null;
}

/**
 * Whether to leave an item out of the panel and the pins — e.g. one the host's
 * users have confirmed and closed. The row stays on the server; only this
 * widget stops drawing it. It is asked again whenever the list changes or the
 * property is assigned; a host whose answer changed for any other reason
 * assigns a fresh function.
 */
export type ItemHider = (item: FeedbackItem) => boolean;

/** The items to draw: all of them without a hider, else those it does not hide.
 *  Only a literal `true` hides and a throw hides nothing, so a host bug cannot
 *  empty the list or take the widget down. */
export function visibleItems(hider: ItemHider | undefined, items: FeedbackItem[]): FeedbackItem[] {
  if (!hider) return items;
  return items.filter((item) => {
    try {
      return hider(item) !== true;
    } catch {
      return true;
    }
  });
}
