/**
 * `<fusen-widget>` — the package's public surface.
 *
 * Solid is a PRIVATE implementation detail on the other side of this file. A host
 * page needs three things and no framework: the tag, five properties, and two DOM
 * events. Nothing in the contract mentions a component, a signal or a JSX type —
 * the two slot hooks are typed as `Node | string | null`, which is what any
 * framework's rendered output already is (Solid JSX included, since it compiles to
 * real DOM nodes). See `props.ts` for the property surface itself.
 *
 * SHADOW DOM IS `mode: "open"`, DELIBERATELY. Style isolation is identical either
 * way; what open buys is that raw-DOM code outside the widget can still reach in
 * when it must. That matters concretely: a closed root would break the embedding
 * app's browser tests and its own page-context collector, both of which use raw
 * DOM APIs from an evaluated page script. Nothing here asks for `closed` and
 * nothing should.
 *
 * THE STATE CONTRACT LIVES IN `host.ts`. `data-machine="feedback"` plus
 * `data-state="<one of five names>"` is reflected onto this element's LIGHT-DOM
 * host, because `document.querySelectorAll("[data-machine]")` does not pierce a
 * shadow root. That contract, the five published names, and the reason THE MACHINE
 * MUST STAY NON-PARALLEL are written out in that file's header — read it before
 * touching the machine, because renaming or re-nesting a state is a breaking
 * change to code outside this repo's reach.
 *
 * WHY THIS IS HAND-ROLLED rather than built on `solid-element`. That library's
 * element (via `component-register`) assigns `undefined` to every declared
 * property key in its constructor, and only afterwards reads the instance for
 * pre-existing values. Any property the host set BEFORE the definition loaded is
 * therefore destroyed on upgrade — see the pitfall walk-through in `props.ts` —
 * and the library exposes no constructor seam to fix that from outside. A few
 * dozen lines of standard custom-element plumbing buys correctness there, one
 * fewer dependency, and disposal we can see.
 *
 * The element does NOT register itself on import — call `defineFusenElement()`.
 * Two reasons: this package declares `"sideEffects": false`, so a bundler is
 * entitled to drop a module whose only effect is a `customElements.define()` call;
 * and an auto-registering import cannot be loaded anywhere without a
 * `customElements` registry, including a plain unit test.
 */

import { onCleanup } from "solid-js";
import { render } from "solid-js/web";
import { FeedbackWidget } from "../components/FeedbackWidget.tsx";
import { resolveAuthorKey } from "../identity.ts";
import { feedbackRuntime } from "../runtime.ts";
import { attachStyles, markFeedbackHost, pairSurfaceTokens, reflectMachineState } from "./host.ts";
import { createFeedbackLayer } from "./layer.ts";
import {
  createPropSignals,
  definePropAccessors,
  FEEDBACK_ELEMENT_ATTRIBUTES,
  rescuePreUpgradeProps,
  type FeedbackElementProps,
  type FeedbackPropSignals,
} from "./props.ts";

export {
  DEFAULT_FEEDBACK_ELEMENT_PROPS,
  FEEDBACK_ELEMENT_ATTRIBUTES,
  FEEDBACK_ELEMENT_PROP_KEYS,
  type FeedbackElementProps,
  type FeedbackItemMetaRenderer,
  type FeedbackSlotContent,
  type ItemHider,
  type PanelHeaderActions,
  type PanelHeaderActionsFactory,
  type PanelHeaderContext,
  type PinColorer,
} from "./props.ts";

/** Default tag name. `defineFusenElement` accepts another if it collides. */
export const FUSEN_ELEMENT_TAG = "fusen-widget";

/** Emitted when the user asks to go somewhere. The widget NEVER navigates
 *  itself — the host owns its router and decides whether to honour this. */
export const FEEDBACK_NAVIGATE_EVENT = "feedback-navigate";
/** Emitted when the widget has something to tell the user (e.g. a comment's
 *  element no longer exists on the page). The host owns its toast system. */
export const FEEDBACK_NOTIFY_EVENT = "feedback-notify";

export type FeedbackNavigateDetail = { route: string };
export type FeedbackNotifyDetail = { message: string };

/**
 * The element, as a type, for a host writing TypeScript: the tag returns an
 * `HTMLElement` that also carries the five properties. Deliberately NOT the class
 * itself — the class is created per registration and is not part of the contract.
 */
export type FeedbackWidgetElement = HTMLElement & FeedbackElementProps;

/**
 * Build the element class.
 *
 * Deferred into a function on purpose: `class … extends HTMLElement` evaluated at
 * module scope would throw in any environment without a DOM, which would make this
 * module — and therefore the package's `index.ts` — unimportable in a plain unit
 * test.
 */
function createFeedbackElementClass(): CustomElementConstructor {
  return class extends HTMLElement {
    static readonly observedAttributes = Object.keys(FEEDBACK_ELEMENT_ATTRIBUTES);

    readonly #props: FeedbackPropSignals;
    #dispose: (() => void) | null = null;
    #refreshLayer = () => {};
    /** Adopting the sheet is once per ELEMENT, not once per connect: one appended
     *  duplicate per reconnect cycle is a leak. */
    #styled = false;
    /**
     * Keys that arrived as a pre-upgrade PROPERTY, still awaiting their initial
     * `attributeChangedCallback`. See that method for why they have to be held.
     */
    readonly #propertyWins: Set<string>;

    constructor() {
      super();
      // FIRST, before anything can read a property: take back whatever the host
      // assigned while this tag was still unknown, and put real accessors where
      // those own properties were. See props.ts.
      const rescued = rescuePreUpgradeProps(this);
      this.#propertyWins = new Set(Object.keys(rescued));
      this.#props = createPropSignals(rescued);
      definePropAccessors(this, this.#props);
    }

    /** The open shadow root. Named `renderRoot` because `host.ts` speaks that
     *  shape. */
    get renderRoot(): ShadowRoot {
      return this.shadowRoot ?? this.attachShadow({ mode: "open" });
    }

    #emit<D>(type: string, detail: D): void {
      // `composed` is what lets the event cross the shadow boundary; without it a
      // listener on the host's ancestors never sees it.
      this.dispatchEvent(new CustomEvent<D>(type, { detail, bubbles: true, composed: true }));
    }

    connectedCallback(): void {
      // A MOVE, not a first connect: the UI survived, but taking this element
      // out of the document hid the layer's popover with it.
      if (this.#dispose) return this.#refreshLayer();

      // Synchronous, before the first render. `data-feedback-ui` is what makes the
      // widget's own hit-testing skip this element: `document.elementsFromPoint`
      // retargets a shadow descendant to its HOST, so without the marker here the
      // widget would anchor every comment to itself. The data-machine/data-state
      // pair goes on for the outside readers described in host.ts.
      markFeedbackHost(this);
      const root = this.renderRoot;
      if (!this.#styled) {
        // The full sheet lives in the layer's own shadow root; this one only
        // holds the layer.
        attachStyles(root, ":host { display: contents; }");
        this.#styled = true;
      }
      // The UI is drawn in a top-layer box that follows the host's modal
      // dialogs around, not in this shadow root directly. See layer.ts.
      const layer = createFeedbackLayer(this, root);
      // When the host defines only `--bg`, do not paint with an unreadable text
      // color. Hosts that define both are left alone. Details in host.ts. It is
      // written on the layer because a layer moved into the dialog no longer
      // inherits from this element.
      pairSurfaceTokens(layer.host, (name) => getComputedStyle(this).getPropertyValue(name));

      const props = this.#props;

      // Nobody had to tell us who we are. With the server's anonymous default
      // the key is in an HttpOnly cookie, so it is fetched rather than read —
      // and a failure just leaves the key empty, which costs delete buttons and
      // nothing else. See identity.ts.
      if (!props.authorKey[0]()) {
        void resolveAuthorKey("", feedbackRuntime().http).then((key) => {
          if (key && !props.authorKey[0]()) props.authorKey[1](key);
        });
      }

      this.#dispose = render(
        () => (
          <FeedbackWidget
            authorKey={props.authorKey[0]()}
            currentRoute={props.route[0]}
            onNavigate={(route) =>
              this.#emit<FeedbackNavigateDetail>(FEEDBACK_NAVIGATE_EVENT, { route })
            }
            onNotify={(message) =>
              this.#emit<FeedbackNotifyDetail>(FEEDBACK_NOTIFY_EVENT, { message })
            }
            labels={props.labels[0]()}
            panelHeaderActions={props.headerActions[0]()}
            renderItemMeta={props.renderItemMeta[0]()}
            pinColor={props.pinColor[0]()}
            hideItem={props.hideItem[0]()}
            onActor={(actor) => onCleanup(reflectMachineState(this, actor))}
          />
        ),
        layer.root,
      );
      const unmount = this.#dispose;
      this.#dispose = () => {
        unmount();
        layer.dispose();
      };
      this.#refreshLayer = layer.refresh;
    }

    /**
     * Tear the Solid root down, which disposes every `onCleanup` inside the widget:
     * the realtime subscription, the machine actor, the pick overlay's window
     * listeners and the state reflection. Nothing of ours outlives the element.
     *
     * The microtask wait is what makes a MOVE (remove + re-append, which every
     * framework does when it reorders children) not destroy the widget's state.
     * Only a real detach gets past the `isConnected` check.
     */
    async disconnectedCallback(): Promise<void> {
      await Promise.resolve();
      if (this.isConnected) return;
      this.#dispose?.();
      this.#dispose = null;
    }

    /**
     * PROPERTY WINS OVER AN INITIAL ATTRIBUTE, which is the standard
     * custom-element precedence and needs enforcing here because of upgrade order:
     * the constructor runs first, then one `attributeChangedCallback` per attribute
     * already in the markup, and only then `connectedCallback`. So for
     * `<fusen-widget route="/a">` where the host also assigned
     * `el.route = "/b"` before the definition loaded, the rescued `/b` would be
     * overwritten by the markup's stale `/a` — the more specific value losing to
     * the less specific one. The first attribute notification for a rescued key is
     * therefore dropped; every later one applies normally.
     */
    attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
      const key = FEEDBACK_ELEMENT_ATTRIBUTES[name as keyof typeof FEEDBACK_ELEMENT_ATTRIBUTES];
      if (key === undefined) return;
      if (this.#propertyWins.delete(key)) return;
      // Only the two string properties are attribute-settable, and for both a
      // removed attribute means "back to the default", which is the empty string.
      this.#props[key][1](value ?? "");
    }
  };
}

/**
 * Register the element. Idempotent, and safe to call when something else already
 * claimed the tag. Returns the tag name so a caller can use it directly.
 *
 * Call `configureFusenWidget()` BEFORE the first element connects if you need
 * to override networking, realtime, page-context capture or the anchoring policy;
 * that is the package's other entry point and it is process-wide.
 */
export function defineFusenElement(tagName: string = FUSEN_ELEMENT_TAG): string {
  if (customElements.get(tagName)) return tagName;
  // A fresh class per tag: one constructor may only be registered once, so reusing
  // it would throw for a caller that wants the widget under a second tag name.
  customElements.define(tagName, createFeedbackElementClass());
  return tagName;
}
