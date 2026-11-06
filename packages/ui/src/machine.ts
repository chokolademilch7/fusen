import { assign, emit, fromPromise, setup } from "xstate";
import type { Anchor } from "./types.ts";
import { submitFeedback } from "./store.ts";

type PickEvent = { type: "PICK"; anchor: Anchor; point: { x: number; y: number } };
type SubmitEvent = { type: "SUBMIT"; body: string };

/**
 * Single interaction machine for the widget: badge toggle → element pick →
 * compose → submit.
 *
 * Deliberately NOT a parallel machine. The widget publishes its current state as
 * one joined `data-state` string on the badge (see `Badge.tsx`), and a
 * leaf-state coverage gate enumerates those strings; parallel regions produce a
 * value that such a gate cannot express. Connection status lives in `store.ts`
 * as a plain signal for the same reason — adding it here would multiply the leaf
 * states.
 *
 * The five state names — `idle`, `mode.picking`, `mode.composing`,
 * `mode.submitting`, `mode.error` — are now a PUBLISHED CONTRACT of this
 * package: they are what an embedding app's e2e gate asserts against and what
 * `data-state` exposes. Renaming or nesting them differently is a breaking
 * change, not a refactor.
 */
export const feedbackMachine = setup({
  types: {
    context: {} as {
      anchor: Anchor | null;
      point: { x: number; y: number } | null;
      pendingBody: string;
    },
    events: {} as
      | { type: "TOGGLE" }
      | PickEvent
      | { type: "CANCEL" }
      | SubmitEvent
      | { type: "RETRY" },
    /** `sent`: the server accepted a comment. Not inferable from landing in
     *  idle — a badge tap that abandons an in-flight submit lands there too. */
    emitted: {} as { type: "sent" },
  },
  actors: {
    submitFeedback: fromPromise(async ({ input }: { input: { anchor: Anchor; body: string } }) => {
      return submitFeedback(input.anchor.route, input.body, input.anchor);
    }),
  },
  actions: {
    assignPick: assign({
      anchor: ({ event }) => (event as unknown as PickEvent).anchor,
      point: ({ event }) => (event as unknown as PickEvent).point,
    }),
    setPendingBody: assign({
      pendingBody: ({ event }) => (event as unknown as SubmitEvent).body,
    }),
    clearPending: assign({
      pendingBody: "",
      anchor: null,
      point: null,
    }),
  },
}).createMachine({
  id: "feedback",
  initial: "idle",
  context: {
    anchor: null,
    point: null,
    pendingBody: "",
  },
  states: {
    idle: {
      on: {
        TOGGLE: "mode",
      },
    },
    mode: {
      type: "compound",
      initial: "picking",
      // Badge tap closes the widget from any sub-mode.
      on: {
        TOGGLE: "idle",
      },
      states: {
        picking: {
          on: {
            PICK: {
              target: "composing",
              actions: "assignPick",
            },
          },
        },
        composing: {
          on: {
            CANCEL: {
              target: "picking",
              actions: "clearPending",
            },
            SUBMIT: {
              target: "submitting",
              actions: "setPendingBody",
            },
          },
        },
        submitting: {
          invoke: {
            src: "submitFeedback",
            input: ({ context }) => ({
              anchor: context.anchor as Anchor,
              body: context.pendingBody,
            }),
            // A sent comment ends the session: close the mode back to idle.
            onDone: {
              target: "#feedback.idle",
              actions: ["clearPending", emit({ type: "sent" })],
            },
            onError: "error",
          },
        },
        error: {
          on: {
            RETRY: "submitting",
            CANCEL: {
              target: "picking",
              actions: "clearPending",
            },
          },
        },
      },
    },
  },
});
