/**
 * The custom element's LIGHT-DOM contract, tested against hand-rolled fakes.
 *
 * There is no jsdom/happy-dom in this repo (deliberately — see
 * `packages/core/test/fake-dom.ts`), so this suite does not mount a
 * custom element. What it does instead is exercise the exact functions the
 * element body calls, with plain objects standing in for the host node, its
 * shadow root and the CSSStyleSheet constructor. The three claims covered are the
 * three that break the outside world if they regress:
 *
 *   1. the host carries data-feedback-ui / data-machine / data-state,
 *   2. data-state tracks the REAL machine through all five published states,
 *   3. the package's stylesheet is adopted into the shadow root, not the page.
 *
 * NOT covered here, and unverifiable without a browser — left to the end-to-end
 * layer rather than faked: `customElements.define` and the upgrade reaction
 * actually constructing the element, `attachShadow({ mode: "open" })`, the real
 * `adoptedStyleSheets` accepting a real `CSSStyleSheet`, `render()` inserting into
 * a shadow root, `elementsFromPoint` retargeting a shadow descendant to the host,
 * `composed` events crossing the boundary, the once-per-element stylesheet guard
 * across a disconnect/reconnect cycle, and the one-line `onActor` hand-off inside
 * `FeedbackWidget`.
 *
 * Two more that look unit-testable but are not, and are called out so nobody
 * assumes they are covered. First: a post-mount property write actually reaching
 * the RENDERED widget. `props.test.ts` proves the accessor notifies a Solid reader,
 * but whether the JSX forwarding re-reads it depends on the compiler wrapping those
 * call-expression props in getters, and this package compiles with `jsx: "preserve"`
 * — so no test here ever sees the compiled output. Second: property-wins precedence
 * over an initial attribute, which needs a real upgrade to order the constructor
 * and `attributeChangedCallback` against each other; only its key list is covered
 * next door.
 */

import { createActor, fromPromise, type StateValue } from "xstate";
import { beforeEach, describe, expect, test } from "bun:test";
import type { Anchor, FeedbackItem } from "../types.ts";
import { feedbackMachine } from "../machine.ts";
import { DEFAULT_SELF_SELECTOR } from "../runtime.ts";
import { FEEDBACK_WIDGET_CSS } from "./styles.ts";
import {
  attachStyles,
  pairSurfaceTokens,
  markFeedbackHost,
  MACHINE_ATTR,
  MACHINE_NAME,
  PUBLISHED_FEEDBACK_STATES,
  reflectMachineState,
  SELF_ATTR,
  STATE_ATTR,
  type StyleTarget,
} from "./host.ts";

/** Fake constructable stylesheet: records what was adopted. */
class FakeSheet {
  cssText = "";
  replaceSync(css: string): void {
    this.cssText = css;
  }
}

/** Fake shadow root — only `adoptedStyleSheets` is touched. */
class FakeShadowRoot {
  adoptedStyleSheets: FakeSheet[] = [];
}

/** Fake host element: records every attribute written to it. */
class FakeHost {
  attributes = new Map<string, string>();
  renderRoot = new FakeShadowRoot();
  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
}

/** What the element's `connectedCallback` does to its host, in the same order. */
function connect(): FakeHost {
  const host = new FakeHost();
  markFeedbackHost(host);
  attachStyles(host.renderRoot as unknown as StyleTarget);
  return host;
}

beforeEach(() => {
  // attachStyles constructs a CSSStyleSheet, which the test runner has no
  // implementation of. Hand it the fake; this is the DOM object the browser
  // would supply, with the two members the code path uses.
  (globalThis as { CSSStyleSheet?: unknown }).CSSStyleSheet = FakeSheet;
});

/** Widened for `toContain`, which otherwise narrows the expected argument to the
 *  literal union and rejects a plain string. */
const PUBLISHED_STATES: readonly string[] = PUBLISHED_FEEDBACK_STATES;

const sampleAnchor: Anchor = {
  version: 1,
  route: "/watch/1",
  selectorPath: "main > .player",
  fingerprint: { tag: "div", dataAttrs: {}, classList: ["player"], textSnippet: "" },
  rectRatio: { x: 0.5, y: 0.5 },
};

describe("markFeedbackHost", () => {
  test("marks the host with all three light-DOM attributes", () => {
    const host = new FakeHost();
    markFeedbackHost(host);

    expect(host.attributes.get(SELF_ATTR)).toBe("");
    expect(host.attributes.get(MACHINE_ATTR)).toBe(MACHINE_NAME);
    expect(host.attributes.get(STATE_ATTR)).toBe("idle");
  });

  test("the self-marking attribute is the one the hit-test selector excludes", () => {
    // elementsFromPoint retargets to the shadow HOST, so an unmarked host would
    // be picked as the anchor target on every tap.
    expect(DEFAULT_SELF_SELECTOR).toBe(`[${SELF_ATTR}]`);
  });

  test("data-state is present from the very first synchronous frame", () => {
    // A consumer waits on [data-machine="feedback"][data-state="idle"]; a frame
    // with the attribute missing (or empty) is a race, so this must not need the
    // machine to have notified anybody yet.
    const host = connect();
    expect(PUBLISHED_STATES).toContain(host.attributes.get(STATE_ATTR)!);
  });

  test("touches no stylesheet, so it is safe to re-run on every connect", () => {
    // The element re-marks on each connect but adopts the sheet once per element;
    // the two are separate functions precisely so a reconnect cannot pile up a
    // duplicate sheet. Keeping this split is what that guard rests on.
    const host = new FakeHost();
    markFeedbackHost(host);
    markFeedbackHost(host);

    expect(host.renderRoot.adoptedStyleSheets).toHaveLength(0);
  });

  test("adopts the package stylesheet into the shadow root", () => {
    const host = connect();

    expect(host.renderRoot.adoptedStyleSheets).toHaveLength(1);
    expect(host.renderRoot.adoptedStyleSheets[0]!.cssText).toBe(FEEDBACK_WIDGET_CSS);
  });
});

describe("attachStyles", () => {
  test("appends rather than replacing what the root already adopted", () => {
    const root = new FakeShadowRoot();
    const existing = new FakeSheet();
    root.adoptedStyleSheets = [existing];

    attachStyles(root as unknown as { adoptedStyleSheets: readonly CSSStyleSheet[] });

    expect(root.adoptedStyleSheets).toHaveLength(2);
    expect(root.adoptedStyleSheets[0]).toBe(existing);
  });

  test("ships the rules inside the sheet, not as a URL to fetch", () => {
    const root = new FakeShadowRoot();
    attachStyles(root as unknown as { adoptedStyleSheets: readonly CSSStyleSheet[] });
    const css = root.adoptedStyleSheets[0]!.cssText;

    expect(css).toContain(".feedback-badge");
    expect(css).not.toContain("@import");
    expect(css).not.toContain("url(");
  });
});

describe("reflectMachineState", () => {
  /** The machine's submitting state invokes a real network actor. Replace it with
   *  one that never settles so the test can observe mode.submitting instead of
   *  racing it into mode.error. */
  const heldMachine = feedbackMachine.provide({
    actors: { submitFeedback: fromPromise((): Promise<FeedbackItem> => new Promise(() => {})) },
  });

  test("tracks the real machine through every published state", () => {
    const host = connect();
    const actor = createActor(heldMachine);
    const stop = reflectMachineState(host, actor);
    actor.start();

    const seen: string[] = [host.attributes.get(STATE_ATTR)!];
    const record = () => seen.push(host.attributes.get(STATE_ATTR)!);

    expect(host.attributes.get(STATE_ATTR)).toBe("idle");

    actor.send({ type: "TOGGLE" });
    expect(host.attributes.get(STATE_ATTR)).toBe("mode.picking");
    record();

    actor.send({ type: "PICK", anchor: sampleAnchor, point: { x: 1, y: 2 } });
    expect(host.attributes.get(STATE_ATTR)).toBe("mode.composing");
    record();

    actor.send({ type: "SUBMIT", body: "The volume is too low" });
    expect(host.attributes.get(STATE_ATTR)).toBe("mode.submitting");
    record();

    stop();
    actor.stop();

    // Every value written was one of the published names, and nothing outside
    // that list can appear while the machine stays non-parallel.
    for (const value of seen) expect(PUBLISHED_STATES).toContain(value);
  });

  test("reflects mode.error too, and stops writing after unsubscribe", () => {
    const host = connect();
    const failing = feedbackMachine.provide({
      actors: {
        submitFeedback: fromPromise((): Promise<FeedbackItem> =>
          Promise.reject(new Error("network")),
        ),
      },
    });
    const actor = createActor(failing);
    const stop = reflectMachineState(host, actor);
    actor.start();
    actor.send({ type: "TOGGLE" });
    actor.send({ type: "PICK", anchor: sampleAnchor, point: { x: 0, y: 0 } });
    actor.send({ type: "SUBMIT", body: "x" });

    return Bun.sleep(10).then(() => {
      expect(host.attributes.get(STATE_ATTR)).toBe("mode.error");
      expect(PUBLISHED_STATES).toContain("mode.error");

      stop();
      actor.send({ type: "TOGGLE" });
      // The machine moved on; the host did not, because nobody is listening.
      expect(host.attributes.get(STATE_ATTR)).toBe("mode.error");
      actor.stop();
    });
  });

  test("subscribing before the actor starts still publishes idle", () => {
    const host = connect();
    const actor = createActor(heldMachine);
    const stop = reflectMachineState(host, actor);
    expect(host.attributes.get(STATE_ATTR)).toBe("idle");
    stop();
  });

  test("holds the last good value rather than publishing an empty data-state", () => {
    // `stateAttr` flattens an absent state value to "", and publishing that would
    // make every selector in the contract stop matching. A real xstate actor
    // always has a value, so this drives the guard directly with a fake.
    const host = connect();
    const blank = {
      getSnapshot: () => ({ value: undefined as unknown as StateValue }),
      subscribe: () => ({ unsubscribe: () => {} }),
    };

    const stop = reflectMachineState(host, blank);

    expect(host.attributes.get(STATE_ATTR)).toBe("idle");
    stop();
  });
});

describe("pairSurfaceTokens", () => {
  const spy = () => {
    const set: Record<string, string> = {};
    return { host: { style: { setProperty: (k: string, v: string) => void (set[k] = v) } }, set };
  };

  test("a host that defines --bg but not --text gets a readable --text", () => {
    const { host, set } = spy();
    pairSurfaceTokens(host, (n) => (n === "--bg" ? " #171614" : ""));
    expect(set["--text"]).toBe("#f1f1f1");
  });

  test("a light --bg gets the dark text, not the light one", () => {
    const { host, set } = spy();
    pairSurfaceTokens(host, (n) => (n === "--bg" ? "rgb(255, 255, 255)" : ""));
    expect(set["--text"]).toBe("#0f0f0f");
  });

  test("a host that defines both is left alone", () => {
    const { host, set } = spy();
    pairSurfaceTokens(host, (n) => (n === "--bg" ? "#171614" : "#ece8e1"));
    expect(set["--text"]).toBeUndefined();
  });

  test("a host that defines neither is left alone", () => {
    const { host, set } = spy();
    pairSurfaceTokens(host, () => "");
    expect(set["--text"]).toBeUndefined();
  });

  test("a --bg this cannot read is left alone rather than guessed at", () => {
    const { host, set } = spy();
    pairSurfaceTokens(host, (n) => (n === "--bg" ? "linear-gradient(#000, #fff)" : ""));
    expect(set["--text"]).toBeUndefined();
  });
});
