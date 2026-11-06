/**
 * The custom element's PROPERTY PLANE: what its configurable surface is, how a
 * value set before the element existed is recovered, and how a value set after it
 * mounted reaches the running widget.
 *
 * Kept out of `element.tsx` for the same reason `host.ts` is — that file cannot be
 * imported without a DOM (or without the Solid JSX transform), whereas everything
 * here is plain logic over a plain object and is therefore unit-tested next door
 * in `props.test.ts`. The element class does little more than call these three
 * functions in order.
 *
 * ── THE PRE-UPGRADE PITFALL ──────────────────────────────────────────────────
 *
 * A custom element's properties are accessors, and they only exist once the
 * element is UPGRADED — i.e. once `customElements.define` runs for its tag.
 * Anything the page assigns before that lands on the instance as an ordinary OWN
 * data property:
 *
 *     const el = document.createElement("fusen-widget"); // still unknown
 *     el.route = "/watch/1";        // ← own data property, no setter involved
 *     el.renderItemMeta = renderer; // ← same
 *     document.body.append(el);
 *     const { defineFusenElement } = await import("@fusen/ui");
 *     defineFusenElement();      // ← upgrade happens HERE
 *
 * After the upgrade that own property SHADOWS the accessor: reads return the stale
 * value and writes never reach the setter, so the widget renders its default and
 * then never updates again. This is not exotic — every framework that binds
 * properties declaratively can assign before a lazily-imported definition lands,
 * and `defineFusenElement()` is deliberately an explicit call the host makes
 * late.
 *
 * The fix is `rescuePreUpgradeProps` + `definePropAccessors`, in that order, in the
 * constructor: read the own values, DELETE the own properties (that is the
 * load-bearing half — it is what lets an accessor exist at that key at all), then
 * install accessors seeded with what was rescued.
 */

import { createSignal } from "solid-js";
import type { FeedbackLabels } from "../labels.ts";
import type {
  FeedbackItemMetaRenderer,
  ItemHider,
  PanelHeaderActions,
  PinColorer,
} from "../slots.ts";

/** The slot types are declared with the slot BEHAVIOUR, in `slots.ts`, and
 *  re-exported here because they are part of this element's property surface. */
export type {
  FeedbackItemMetaRenderer,
  FeedbackSlotContent,
  ItemHider,
  PanelHeaderActions,
  PanelHeaderActionsFactory,
  PanelHeaderContext,
  PinColorer,
} from "../slots.ts";

/**
 * The element's configurable surface.
 *
 * `authorKey` and `route` are plain strings and therefore also settable as the
 * attributes `author-key` and `route`. The other three are functions or DOM
 * nodes, so they are PROPERTIES only — there is no sane attribute form for them.
 */
export type FeedbackElementProps = {
  /**
   * Opaque key identifying the signed-in reader. DISPLAY ONLY: it decides whether
   * a delete button is DRAWN, never what the widget is allowed to do. The server
   * derives the acting identity from the session and enforces every permission
   * there, so a wrong value here can only draw or hide a button.
   */
  authorKey: string;
  /** The host's current route. Set it on navigation; the widget re-reads it. */
  route: string;
  /** Copy overrides. Anything omitted keeps the English default (see labels.ts). */
  labels: Partial<FeedbackLabels> | undefined;
  /**
   * Host-specific buttons for the panel header, e.g. a link into the host's own
   * pages. Rendered before the close button.
   *
   * Finished content, or a FACTORY handed the panel's own actions — which is what
   * an action that navigates into the host's pages needs, because the panel must
   * close before the destination appears. See `slots.ts`.
   */
  headerActions: PanelHeaderActions | undefined;
  /** Renderer for application-specific fields the host's server attaches to an
   *  item (workflow status, ticket number, …), drawn between body and meta row. */
  renderItemMeta: FeedbackItemMetaRenderer | undefined;
  /** Ring colour for an on-page pin (a cluster of items). See `slots.ts`. */
  pinColor: PinColorer | undefined;
  /** Items to leave out of the panel and the pins. See `slots.ts`. */
  hideItem: ItemHider | undefined;
};

/** The value of every property before the host sets anything. Zero configuration
 *  is a working configuration. */
export const DEFAULT_FEEDBACK_ELEMENT_PROPS: FeedbackElementProps = {
  authorKey: "",
  route: "",
  labels: undefined,
  headerActions: undefined,
  renderItemMeta: undefined,
  pinColor: undefined,
  hideItem: undefined,
};

/**
 * Every configurable key, in one list, because the rescue sweep and the accessor
 * installer both iterate it. A key missing here gets no accessor and silently
 * loses its pre-upgrade value, so `props.test.ts` gates this list against
 * `DEFAULT_FEEDBACK_ELEMENT_PROPS` — adding a prop to the type without adding it
 * here fails that test rather than shipping a hole.
 */
export const FEEDBACK_ELEMENT_PROP_KEYS = [
  "authorKey",
  "route",
  "labels",
  "headerActions",
  "renderItemMeta",
  "pinColor",
  "hideItem",
] as const satisfies readonly (keyof FeedbackElementProps)[];

export type FeedbackElementPropKey = (typeof FEEDBACK_ELEMENT_PROP_KEYS)[number];

/**
 * The scalar subset, as `attribute → property`.
 *
 * Attributes are INPUT ONLY; nothing is reflected back out. Reflection would make
 * the element's own writes re-enter `attributeChangedCallback` and need a loop
 * guard, and the light-DOM attributes this element DOES publish
 * (`data-machine`/`data-state`, see `host.ts`) are a separate, deliberate
 * contract that has nothing to do with these.
 */
export const FEEDBACK_ELEMENT_ATTRIBUTES = {
  "author-key": "authorKey",
  route: "route",
} as const satisfies Readonly<Record<string, FeedbackElementPropKey>>;

/** A signal pair whose `set` never mistakes a function VALUE for an updater —
 *  `renderItemMeta` is always a function and `headerActions` may be one, so this
 *  is not hypothetical. */
export type PropSignal<T> = readonly [get: () => T, set: (value: T) => void];

function propSignal<T>(initial: T): PropSignal<T> {
  const [get, set] = createSignal<T>(initial);
  return [get, (value: T) => set(() => value)];
}

export type FeedbackPropSignals = {
  authorKey: PropSignal<string>;
  route: PropSignal<string>;
  labels: PropSignal<Partial<FeedbackLabels> | undefined>;
  headerActions: PropSignal<PanelHeaderActions | undefined>;
  renderItemMeta: PropSignal<FeedbackItemMetaRenderer | undefined>;
  pinColor: PropSignal<PinColorer | undefined>;
  hideItem: PropSignal<ItemHider | undefined>;
};

/**
 * Strip the given keys' own data properties off `target` and return the values
 * worth keeping.
 *
 * The `delete` is not tidiness: it un-shadows the key so `definePropAccessors` can
 * install an accessor there and every later write goes through the setter.
 *
 * `undefined` is dropped rather than rescued — a key explicitly pre-set to
 * `undefined` carries no information, and returning it would override the
 * element's documented default with nothing.
 *
 * Typed against a plain object rather than `HTMLElement` on purpose: that is what
 * keeps this unit-testable. The caller passes `this`.
 */
export function rescuePreUpgradeProps(
  target: object,
  keys: readonly FeedbackElementPropKey[] = FEEDBACK_ELEMENT_PROP_KEYS,
): Partial<FeedbackElementProps> {
  const rescued: Record<string, unknown> = {};
  const bag = target as Record<string, unknown>;

  for (const key of keys) {
    if (!Object.hasOwn(bag, key)) continue;
    const value = bag[key];
    delete bag[key];
    if (value !== undefined) rescued[key] = value;
  }

  return rescued as Partial<FeedbackElementProps>;
}

/**
 * Seed one signal per property from the defaults, overridden by whatever was
 * rescued.
 *
 * Writing a property after mount therefore updates a signal the widget is already
 * reading, which re-renders the affected part in place — the element never tears
 * the widget down and rebuilds it to apply a prop.
 */
export function createPropSignals(
  rescued: Partial<FeedbackElementProps> = {},
): FeedbackPropSignals {
  const initial: FeedbackElementProps = { ...DEFAULT_FEEDBACK_ELEMENT_PROPS, ...rescued };
  return {
    authorKey: propSignal(initial.authorKey),
    route: propSignal(initial.route),
    labels: propSignal(initial.labels),
    headerActions: propSignal(initial.headerActions),
    renderItemMeta: propSignal(initial.renderItemMeta),
    pinColor: propSignal(initial.pinColor),
    hideItem: propSignal(initial.hideItem),
  };
}

/**
 * Install one accessor per property on `target`, backed by `signals`.
 *
 * Defined on the INSTANCE rather than the prototype, deliberately: the instance is
 * where the pre-upgrade own properties were, so defining here is what replaces
 * them, and an own accessor cannot be shadowed by anything later. `configurable`
 * stays true so a host that needs to wrap a property still can.
 *
 * The cast is the price of iterating a mapped type generically; it is confined to
 * this loop, and the accessors it produces are fully typed for callers through
 * `FeedbackElementProps`.
 */
export function definePropAccessors(target: object, signals: FeedbackPropSignals): void {
  for (const key of FEEDBACK_ELEMENT_PROP_KEYS) {
    const [get, set] = signals[key] as PropSignal<unknown>;
    Object.defineProperty(target, key, {
      get: () => get(),
      set: (value: unknown) => set(value),
      enumerable: true,
      configurable: true,
    });
  }
}
