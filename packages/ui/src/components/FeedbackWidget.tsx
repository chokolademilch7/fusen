import { createMemo, createSignal, type JSX, onCleanup, Show } from "solid-js";
import type { ActorRefFrom } from "xstate";
import type { Anchor, FeedbackItem } from "../types.ts";
import { type FeedbackLabels, resolveLabels } from "../labels.ts";
import {
  type ItemHider,
  type PanelHeaderActions,
  type PinColorer,
  visibleItems,
} from "../slots.ts";
import { clearFocusOwnedBy, clearOrphanedFocus, focusAnchorFor } from "../focus.ts";
import { ensureFeedbackSync, feedbackItems } from "../store.ts";
import { feedbackMachine } from "../machine.ts";
import { stateAttr, useMachine } from "../solid.ts";
import { Badge } from "./Badge.tsx";
import { Composer } from "./Composer.tsx";
import { Panel } from "./Panel.tsx";
import { PickHighlight } from "./PickHighlight.tsx";
import { Pins } from "./Pins.tsx";
import { PickOverlay } from "./PickOverlay.tsx";

/**
 * Everything the widget needs from whatever application embeds it.
 *
 * Exported as a named type so a wrapper (a custom element, a different
 * framework's adapter) can accept the same bag and forward it verbatim — the
 * composition root is deliberately a single component taking one flat props
 * object, with no internal reliance on a router, a toast system or a session.
 */
export type FeedbackWidgetProps = {
  /**
   * Opaque key identifying the signed-in reader, compared with `===` against an
   * item's `author_key` to decide whether to draw a delete button.
   *
   * IDENTITY CONTRACT — this is for DISPLAY AND UI BRANCHING ONLY. It must never
   * be what authorizes a write or a delete. Anything reaching the widget from
   * the host is client-side data and therefore forgeable; the server derives the
   * acting identity from the session itself and enforces every permission there.
   * Passing the wrong value here can only ever draw or hide a button — never
   * grant access. Do not add a prop that changes what the widget is ALLOWED to
   * do; add one that changes what it SHOWS.
   */
  authorKey: string;
  /** Current route, as an accessor so the widget re-reads it on navigation. The
   *  host's router is not the widget's business. */
  currentRoute: () => string;
  /** Navigation INTENT. The widget never navigates itself; the host decides how
   *  (and whether) to honour the route, and wraps it in whatever transition it
   *  likes. */
  onNavigate: (route: string) => void;
  /** How to tell the user something: a comment was sent (`labels.sent`), a pin's
   *  element no longer exists (`labels.focusNotFound`). The host owns the toast. */
  onNotify: (message: string) => void;
  /** Copy overrides. Anything omitted keeps the shipped default. */
  labels?: Partial<FeedbackLabels>;
  /** Host-specific buttons for the panel header. Finished content, or a factory
   *  handed the panel's own actions — see `Panel` and `slots.ts`. */
  panelHeaderActions?: PanelHeaderActions;
  /** Renderer for application-specific fields on an item. See `Panel`. */
  renderItemMeta?: (item: FeedbackItem) => JSX.Element;
  /** Ring colour for an on-page pin. See `Pins` and `slots.ts`. */
  pinColor?: PinColorer;
  /** Items to leave out of the panel and the pins. See `slots.ts`. */
  hideItem?: ItemHider;
  /**
   * Handed the machine actor once, at mount.
   *
   * This exists so a WRAPPER can publish the machine's state somewhere the
   * widget's own DOM cannot reach — specifically, the custom element reflects
   * `data-state` onto its light-DOM host, because raw `document` queries do not
   * pierce a shadow root. Read-only by intent: subscribe to it, do not send to
   * it. Driving the widget from outside is not part of the contract.
   */
  onActor?: (actor: ActorRefFrom<typeof feedbackMachine>) => void;
};

/**
 * Composition root — owns the single machine actor and the (machine-external)
 * panel-open flag, and wires the pieces together. Mount once, near the root of
 * the embedding app.
 *
 * Networking, realtime, anchoring and page-context capture come from
 * `configureFusenWidget()` rather than props: they are process-wide, and
 * separating them keeps this component a pure function of what is on screen —
 * which is what lets a custom-element wrapper drive it by forwarding props and
 * calling `configureFusenWidget` once at definition time.
 */
export function FeedbackWidget(props: FeedbackWidgetProps) {
  const [state, send, actor] = useMachine(feedbackMachine);
  const [panelOpen, setPanelOpen] = createSignal(false);
  const labels = () => resolveLabels(props.labels);

  // Setup-time, once: whoever wants to mirror the machine gets the actor before
  // the first paint, so no state change can slip past them.
  props.onActor?.(actor);

  // The host, not the widget, owns the toast. A subscription to the emitted
  // event rather than a machine action, so the machine itself stays host-free.
  const sent = actor.on("sent", () => props.onNotify(labels().sent));
  onCleanup(() => sent.unsubscribe());

  const stop = ensureFeedbackSync();
  onCleanup(stop);
  // Identifies this mount as the owner of a focus its panel starts, so a second
  // mounted widget's hideItem or unmount leaves that focus alone.
  const focusOwner = {};
  onCleanup(() => clearFocusOwnedBy(focusOwner));

  const isPicking = () => state.matches({ mode: "picking" });
  const isComposing = () => state.matches({ mode: "composing" });
  const isSubmitting = () => state.matches({ mode: "submitting" });
  const isError = () => state.matches({ mode: "error" });
  const active = () => !state.matches("idle");

  const toggle = () => send({ type: "TOGGLE" });
  const pick = (anchor: Anchor, point: { x: number; y: number }) =>
    send({ type: "PICK", anchor, point });
  const submit = (body: string) => send({ type: "SUBMIT", body });
  const cancel = () => send({ type: "CANCEL" });
  const retry = () => send({ type: "RETRY" });
  // Pins and the panel both read it; filter once per change, not per read.
  const items = createMemo(() => visibleItems(props.hideItem, feedbackItems()));
  // A hidden or deleted item takes its row and pin away; take the highlight too.
  clearOrphanedFocus(items, focusOwner);

  return (
    <>
      <Badge
        stateAttr={stateAttr(state.value)}
        active={active()}
        onToggle={toggle}
        onOpenPanel={() => setPanelOpen(true)}
        panelOpen={panelOpen()}
        labels={labels()}
      />
      {/* Pins stay hidden during ordinary use: only while comment mode is on. */}
      <Show when={active()}>
        <Pins
          items={items()}
          route={props.currentRoute()}
          authorKey={props.authorKey}
          labels={labels()}
          pinColor={props.pinColor}
        />
      </Show>
      <Show when={isPicking()}>
        <PickOverlay route={props.currentRoute()} onPick={pick} onExit={toggle} labels={labels()} />
      </Show>
      {/* The picked anchor stays in context through composing/submitting/error
       *  (cleared only on CANCEL or a successful submit), so it doubles as
       *  the "is there something to highlight" condition here. */}
      <Show when={(isComposing() || isSubmitting() || isError()) && state.context.anchor}>
        {(anchor) => <PickHighlight anchor={anchor()} />}
      </Show>
      <Show when={isComposing() || isSubmitting() || isError()}>
        <Composer
          submitting={isSubmitting()}
          error={isError()}
          onSubmit={submit}
          onCancel={cancel}
          onRetry={retry}
          labels={labels()}
        />
      </Show>
      {/* Where a comment tapped in the list lives. Shown independently of comment
       *  mode — the list can be opened with the mode off. */}
      <Show when={focusAnchorFor(focusOwner)}>
        {(anchor) => <PickHighlight anchor={anchor()} class="feedback-focus-highlight" />}
      </Show>
      <Show when={panelOpen()}>
        <Panel
          items={items()}
          onClose={() => setPanelOpen(false)}
          authorKey={props.authorKey}
          currentRoute={props.currentRoute}
          onNavigate={props.onNavigate}
          onNotify={props.onNotify}
          headerActions={props.panelHeaderActions}
          renderItemMeta={props.renderItemMeta}
          labels={labels()}
          focusOwner={focusOwner}
        />
      </Show>
    </>
  );
}
