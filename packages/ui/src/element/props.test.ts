/**
 * The custom element's PROPERTY PLANE, tested without a DOM.
 *
 * There is no jsdom/happy-dom in this repo (deliberately — see
 * `packages/core/test/fake-dom.ts`), so nothing here constructs a
 * real custom element. It does not have to: the pre-upgrade pitfall is entirely a
 * question of own data properties versus accessors on a plain object, which is
 * exactly what these tests set up. A plain `{}` playing the part of the instance
 * reproduces the bug and proves the fix.
 *
 * The scenario each test below is standing in for:
 *
 *     const el = document.createElement("fusen-widget"); // tag unknown yet
 *     el.route = "/watch/1";                                    // own data prop
 *     defineFusenElement();                                  // upgrade → ctor
 *
 * WHAT THIS FILE CANNOT COVER, and is therefore left to the end-to-end layer:
 * `customElements.define` and the upgrade reaction actually calling the
 * constructor, `attachShadow`, `adoptedStyleSheets`, `render()` into a shadow
 * root, `elementsFromPoint` retargeting to the host, and event `composed`
 * propagation. Every one of those needs a real engine; asserting them against
 * fakes would only prove the fakes.
 */

import { createRoot, createEffect } from "solid-js";
import { describe, expect, test } from "bun:test";
import type { FeedbackItem } from "../types.ts";
import {
  createPropSignals,
  DEFAULT_FEEDBACK_ELEMENT_PROPS,
  definePropAccessors,
  FEEDBACK_ELEMENT_ATTRIBUTES,
  FEEDBACK_ELEMENT_PROP_KEYS,
  rescuePreUpgradeProps,
  type FeedbackElementProps,
} from "./props.ts";

/** Widened so `toContain` accepts a plain string. */
const PROP_KEYS: readonly string[] = FEEDBACK_ELEMENT_PROP_KEYS;

/**
 * What the element's constructor does, on a plain object. Everything after this
 * line in a real element is DOM work; everything up to it is what these tests
 * exercise.
 */
function upgrade(instance: object): void {
  definePropAccessors(instance, createPropSignals(rescuePreUpgradeProps(instance)));
}

const sampleItem = { id: "1", body: "The volume is too low" } as unknown as FeedbackItem;

describe("the key list", () => {
  test("covers exactly the documented props, so none can skip buffering", () => {
    // A prop added to the type and the defaults but forgotten here would get no
    // accessor and silently lose its pre-upgrade value.
    expect([...PROP_KEYS].sort()).toEqual(Object.keys(DEFAULT_FEEDBACK_ELEMENT_PROPS).sort());
  });

  test("every attribute maps to a real property", () => {
    for (const key of Object.values(FEEDBACK_ELEMENT_ATTRIBUTES)) {
      expect(PROP_KEYS).toContain(key);
    }
  });

  test("attribute names are the dash-cased form of their property", () => {
    // A host setting `author-key=""` in markup and getting nothing is a silent
    // failure, so the mapping is asserted rather than assumed.
    expect(FEEDBACK_ELEMENT_ATTRIBUTES).toEqual({ "author-key": "authorKey", route: "route" });
  });
});

describe("rescuePreUpgradeProps", () => {
  test("captures a value the host set before the element was upgraded", () => {
    const instance = { route: "/watch/1" };
    expect(rescuePreUpgradeProps(instance)).toEqual({ route: "/watch/1" });
  });

  test("DELETES the own property, which is what un-shadows the accessor", () => {
    // The whole bug is that an own data property wins over a prototype accessor.
    // If this delete ever goes away, reads go stale and writes vanish.
    const instance: Record<string, unknown> = { route: "/watch/1" };
    rescuePreUpgradeProps(instance);
    expect(Object.hasOwn(instance, "route")).toBe(false);
  });

  test("rescues functions and objects, not just strings", () => {
    const renderItemMeta = () => "meta";
    const labels = { openPanel: "List" };
    const headerActions = "slot" as const;
    const rescued = rescuePreUpgradeProps({ renderItemMeta, labels, headerActions });

    expect(rescued.renderItemMeta).toBe(renderItemMeta);
    expect(rescued.labels).toBe(labels);
    expect(rescued.headerActions).toBe(headerActions);
  });

  test("ignores keys the host never touched", () => {
    expect(rescuePreUpgradeProps({})).toEqual({});
  });

  test("drops an explicit undefined instead of overriding the default", () => {
    const instance = { authorKey: undefined };
    const rescued = rescuePreUpgradeProps(instance);

    expect(Object.hasOwn(rescued, "authorKey")).toBe(false);
    // Still deleted, so the accessor can take the key over.
    expect(Object.hasOwn(instance, "authorKey")).toBe(false);
  });

  test("reports exactly the pre-set keys, which is what property-wins keys off", () => {
    // The element turns these keys into a hold-list so the markup's stale
    // `route="/a"` cannot overwrite a pre-upgrade `el.route = "/b"` during the
    // upgrade's initial attributeChangedCallback pass. A key wrongly present here
    // would swallow a real attribute change instead.
    const rescued = rescuePreUpgradeProps({ route: "/b", authorKey: undefined });
    expect(Object.keys(rescued)).toEqual(["route"]);
  });

  test("leaves properties that are not part of the contract alone", () => {
    const instance: Record<string, unknown> = { route: "/a", id: "keep-me" };
    rescuePreUpgradeProps(instance);
    expect(instance.id).toBe("keep-me");
  });
});

describe("a property set before upgrade", () => {
  test("is readable through the accessor afterwards", () => {
    const instance = { route: "/watch/1", authorKey: "reader-7" } as Partial<FeedbackElementProps>;
    upgrade(instance);

    expect(instance.route).toBe("/watch/1");
    expect(instance.authorKey).toBe("reader-7");
  });

  test("does not block LATER writes — the regression the delete prevents", () => {
    const instance = { route: "/watch/1" } as Partial<FeedbackElementProps>;
    upgrade(instance);

    instance.route = "/watch/2";

    expect(instance.route).toBe("/watch/2");
  });

  test("survives as a function value, without being taken for a signal updater", () => {
    // createSignal(fn) and set(fn) both treat a function specially; a naive
    // implementation stores the RESULT of calling it. The rescued renderItemMeta
    // must come back out as the very same function.
    const renderItemMeta = (item: FeedbackItem) => item.body;
    const instance = { renderItemMeta } as Partial<FeedbackElementProps>;
    upgrade(instance);

    expect(instance.renderItemMeta).toBe(renderItemMeta);
    expect(instance.renderItemMeta?.(sampleItem)).toBe("The volume is too low");
  });

  test("keeps the documented default for every key the host did not set", () => {
    const instance = { route: "/watch/1" } as Partial<FeedbackElementProps>;
    upgrade(instance);

    expect(instance.authorKey).toBe(DEFAULT_FEEDBACK_ELEMENT_PROPS.authorKey);
    expect(instance.labels).toBeUndefined();
    expect(instance.headerActions).toBeUndefined();
    expect(instance.renderItemMeta).toBeUndefined();
  });

  test("every key in the contract is buffered, not just the two scalars", () => {
    const renderItemMeta = (item: FeedbackItem) => item.body;
    const preset: FeedbackElementProps = {
      authorKey: "reader-7",
      route: "/watch/1",
      labels: { openPanel: "List" },
      headerActions: "actions",
      renderItemMeta,
      pinColor: () => "var(--done)",
      hideItem: () => false,
    };
    const instance = { ...preset } as Partial<FeedbackElementProps>;
    upgrade(instance);

    for (const key of FEEDBACK_ELEMENT_PROP_KEYS) {
      expect(instance[key]).toBe(preset[key]);
    }
  });
});

describe("accessors installed by the upgrade", () => {
  test("replace the own data property with a real accessor", () => {
    const instance = { route: "/watch/1" };
    upgrade(instance);

    const descriptor = Object.getOwnPropertyDescriptor(instance, "route");
    expect(typeof descriptor?.get).toBe("function");
    expect(typeof descriptor?.set).toBe("function");
    // Configurable so a host that needs to wrap a property still can.
    expect(descriptor?.configurable).toBe(true);
  });

  test("exist for every key, whether or not it was pre-set", () => {
    const instance = {};
    upgrade(instance);

    for (const key of FEEDBACK_ELEMENT_PROP_KEYS) {
      expect(typeof Object.getOwnPropertyDescriptor(instance, key)?.get).toBe("function");
    }
  });

  test("are enumerable, so a framework can see the props it may set", () => {
    const instance = {};
    upgrade(instance);
    expect(Object.keys(instance).sort()).toEqual([...PROP_KEYS].sort());
  });
});

describe("a property set after mount", () => {
  test("notifies a Solid reader, so the widget updates without remounting", () => {
    // This is the reactivity half of the contract: the element hands these signals
    // to the widget once, at connect, and a later write must reach it.
    const seen: string[] = [];
    const dispose = createRoot((disposer) => {
      const instance = {} as Partial<FeedbackElementProps>;
      upgrade(instance);
      createEffect(() => seen.push(instance.route!));

      // Effects run on flush, so the first read lands before any write.
      queueMicrotask(() => {
        instance.route = "/watch/2";
      });
      return disposer;
    });

    return Bun.sleep(5).then(() => {
      dispose();
      expect(seen).toEqual(["", "/watch/2"]);
    });
  });

  test("notifies for a function prop too", () => {
    const renderItemMeta = (item: FeedbackItem) => item.body;
    const seen: (unknown | undefined)[] = [];
    const dispose = createRoot((disposer) => {
      const instance = {} as Partial<FeedbackElementProps>;
      upgrade(instance);
      createEffect(() => seen.push(instance.renderItemMeta));
      queueMicrotask(() => {
        instance.renderItemMeta = renderItemMeta;
      });
      return disposer;
    });

    return Bun.sleep(5).then(() => {
      dispose();
      expect(seen).toEqual([undefined, renderItemMeta]);
    });
  });
});
