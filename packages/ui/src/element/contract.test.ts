/**
 * THE STATE CONTRACT GATE.
 *
 * `PUBLISHED_FEEDBACK_STATES` is a hand-written literal, and code OUTSIDE this
 * repository reads the `data-state` values it names. Nothing tied that list to
 * the machine it claims to describe, which left one specific hole:
 *
 *   RENAMING a state broke tests (they hardcode the expected strings).
 *   ADDING one broke nothing at all.
 *
 * A new leaf would ship, external consumers' selectors would quietly go stale,
 * and every test here would stay green — because every test asserts membership
 * of states the scenario happens to visit, and a state nobody visits is asserted
 * by nobody.
 *
 * So this derives the leaves from the REAL machine definition and compares. Add
 * a state and this fails on the spot, which forces the decision that adding one
 * actually is: publish it (and tell consumers) or nest it under an existing
 * published leaf so the outside world never sees it.
 *
 * It is a unit test rather than a browser check on purpose: it should fail the
 * moment the machine changes, not after a browser boots.
 */

import { describe, expect, test } from "bun:test";
import { feedbackMachine } from "../machine.ts";
import { MACHINE_ATTR, MACHINE_NAME, PUBLISHED_FEEDBACK_STATES, STATE_ATTR } from "./host.ts";

type StateNode = { states?: Record<string, StateNode> };

/**
 * Every leaf state, dotted, derived from the machine's own definition.
 *
 * Leaves only: `mode` is a compound node and is never a value the widget
 * settles in, so it is not part of the published surface. `stateAttr` joins the
 * path with ".", which is what makes "mode.picking" the published form.
 */
function collectLeafStates(node: StateNode, prefix = ""): string[] {
  const states = node.states ?? {};
  const keys = Object.keys(states);
  if (keys.length === 0) return prefix ? [prefix] : [];
  return keys.flatMap((key) => collectLeafStates(states[key]!, prefix ? `${prefix}.${key}` : key));
}

describe("published state contract", () => {
  test("the published list is exactly the machine's leaf states", () => {
    const derived = collectLeafStates(feedbackMachine.root as unknown as StateNode).sort();
    const published = [...PUBLISHED_FEEDBACK_STATES].sort();

    // Failing here means one of two things, and they need different answers:
    //   extra in `derived`   — a state was ADDED. Publishing it is a breaking
    //                          change for anyone reading data-state; nesting it
    //                          under an existing leaf is not.
    //   extra in `published` — the list names a state the machine no longer has.
    expect(derived).toEqual(published);
  });

  test("the derived leaves are not accidentally empty", () => {
    // Guards the guard: if `feedbackMachine.root` ever stops exposing `states`
    // in the shape this walker expects, `collectLeafStates` would return [] and
    // the test above would only pass if the published list were empty too. This
    // is what stops that from degrading into a vacuous pass.
    const derived = collectLeafStates(feedbackMachine.root as unknown as StateNode);
    expect(derived.length).toBeGreaterThanOrEqual(5);
    expect(derived).toContain("idle");
    expect(derived).toContain("mode.picking");
  });

  test("the attribute names are what external code queries", () => {
    // These two strings are the whole reason the state names are reachable from
    // outside the shadow root. They are as much a part of the contract as the
    // state values, and nothing else pins them.
    expect(MACHINE_ATTR).toBe("data-machine");
    expect(STATE_ATTR).toBe("data-state");
    expect(MACHINE_NAME).toBe("feedback");
  });
});
