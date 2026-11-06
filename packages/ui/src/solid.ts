/**
 * The two Solid/XState glue pieces the widget needs, kept local so this package
 * has no import into any host app.
 *
 * `useMachine` comes straight from `@xstate/solid` — the host had a bare
 * re-export of it, which is not a dependency worth inheriting. Integration
 * pattern (@xstate/solid@2, xstate v5): `useMachine(logic)` → `[state, send,
 * actor]`, where `state` is a Solid createImmutable store read as
 * `state.value` / `state.context` — NOT an Accessor, so never call `state()`.
 */
export { useMachine } from "@xstate/solid";

import type { StateValue } from "xstate";

/**
 * Flatten an XState StateValue into the dot-joined string that goes into
 * `data-state`. Copied from the host rather than imported: the attribute it
 * feeds is part of this widget's published contract (see `machine.ts`), so the
 * code that formats it has to travel with the widget.
 *
 * Accepts undefined for the initial pre-start snapshot case.
 *   'idle'              → 'idle'
 *   { mode: 'picking' } → 'mode.picking'
 *   undefined           → ''
 */
export function stateAttr(stateValue: StateValue | undefined): string {
  if (stateValue === undefined) return "";
  if (typeof stateValue === "string") return stateValue;
  return Object.entries(stateValue)
    .map(([k, v]) => `${k}.${stateAttr(v)}`)
    .join(" ");
}
