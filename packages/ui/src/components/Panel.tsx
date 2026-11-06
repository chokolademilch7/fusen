import { createEffect, createSignal, For, type JSX, onCleanup, onMount, Show } from "solid-js";
import { isSafeRoute } from "@fusen/core";
import type { FeedbackItem } from "../types.ts";
import type { FeedbackLabels } from "../labels.ts";
import {
  createPanelHeaderContext,
  type PanelHeaderActions,
  resolveHeaderActions,
} from "../slots.ts";
import { clearFocus, focusOnAnchor, isFocusedItem } from "../focus.ts";
import { displayVotes, removeFeedback, vote } from "../store.ts";
import { anchoring } from "../runtime.ts";
import { DOCKED_QUERY } from "../breakpoints.ts";
import { Icon } from "./Icon.tsx";
import { DELETE_BUTTON_CLASS, isDeleteButtonTap } from "./delete-confirm.ts";

/** Cross-page comment list, newest first. Every submitted item is always
 *  reachable here even when its pin can't re-resolve on the page (degrade
 *  without losing data). */
export function Panel(props: {
  items: FeedbackItem[];
  onClose: () => void;
  /** See the identity contract on `FeedbackWidget`. */
  authorKey: string;
  /** Current route of the embedding app. An accessor, not a string, so the panel
   *  re-reads it after the host navigates. */
  currentRoute: () => string;
  /** The widget never navigates; it asks. The host owns its router, and owns
   *  whatever transition it wants to wrap the navigation in. */
  onNavigate: (route: string) => void;
  /** How the host tells the user something. A widget must not assume a toast
   *  system exists, let alone which one. */
  onNotify: (message: string) => void;
  /** Host-specific actions for the panel header, rendered before the close
   *  button. This is where an app puts links into its own pages — the widget has
   *  no business knowing such a page exists. A factory gets the panel's own
   *  actions to wire onto (`goTo` closes before navigating); see `slots.ts`. */
  headerActions?: PanelHeaderActions;
  /** Optional per-item renderer for application-specific fields the server
   *  attaches (workflow status, ticket number, …). Those live in one app's
   *  vocabulary, so the widget passes the item back and renders whatever comes
   *  out, between the body and the meta row. */
  renderItemMeta?: (item: FeedbackItem) => JSX.Element;
  labels: FeedbackLabels;
  /** The mounting widget's identity for the shared focus (see `focusOwner`). */
  focusOwner?: object;
}) {
  const [docked, setDocked] = createSignal(false);
  // Two-step delete confirmation: holds the tapped item.id. One at a time is
  // enough — the point is preventing a mis-tap, not confirming in bulk.
  const [confirmingId, setConfirmingId] = createSignal<number | null>(null);

  onMount(() => {
    const mq = window.matchMedia(DOCKED_QUERY);
    const sync = () => setDocked(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    onCleanup(() => mq.removeEventListener("change", sync));
  });

  // Tap elsewhere / press Escape while confirming cancels. A tap on the button
  // itself (the 2nd = commit) is let through by the event-path check and handled
  // by onClick — the same capture-listener idiom PickOverlay uses.
  createEffect(() => {
    if (confirmingId() === null) return;
    const cancelOnOutside = (e: PointerEvent) => {
      if (!isDeleteButtonTap(e)) setConfirmingId(null);
    };
    const cancelOnEscape = (e: KeyboardEvent) => {
      // Stop at cancelling the confirmation. If "Escape closes the panel" is
      // ever added, one keypress must not do both.
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setConfirmingId(null);
    };
    document.addEventListener("pointerdown", cancelOnOutside, { capture: true });
    document.addEventListener("keydown", cancelOnEscape);
    onCleanup(() => {
      document.removeEventListener("pointerdown", cancelOnOutside, { capture: true });
      document.removeEventListener("keydown", cancelOnEscape);
    });
  });

  // Fold the confirmation away if its item disappears. Panel and Pins can be
  // mounted at once with independent confirmation state, and the outside-tap
  // check lets every delete button through, so a delete committed in one cannot
  // clear the other's confirmation.
  createEffect(() => {
    const id = confirmingId();
    if (id !== null && !props.items.some((it) => it.id === id)) setConfirmingId(null);
  });

  const handleDeleteTap = (item: FeedbackItem) => {
    if (confirmingId() !== item.id) {
      setConfirmingId(item.id);
      return;
    }
    setConfirmingId(null);
    // removeFeedback is optimistic, so the row vanishes immediately — drop the
    // highlight with it. If the delete later rolls back, not restoring the
    // highlight is a small cost for an operation users treat as final.
    if (isFocusedItem(item)) clearFocus();
    void removeFeedback(item.id);
  };

  const sorted = () => [...props.items].sort((a, b) => b.created_at.localeCompare(a.created_at));

  /** The one implementation of "close, then navigate" — shared by the per-item
   *  route buttons and by whatever the host wires into the header slot. Closing
   *  first is what stops a fullscreen panel from covering the destination. */
  const header = createPanelHeaderContext({
    close: () => props.onClose(),
    navigate: (route) => {
      if (isSafeRoute(route)) props.onNavigate(route);
    },
  });

  /** Tapping a comment body = go to where it was left and highlight it. The
   *  fullscreen panel would cover the target, so it closes; the docked sidebar
   *  stays open so a reader can walk the list item by item. */
  const focusItem = async (item: FeedbackItem) => {
    if (!docked()) props.onClose();
    if (props.currentRoute() !== item.anchor.route) {
      // Rows written before the server checked routes may hold anything;
      // never hand a `javascript:` or external URL to the host's router.
      if (!isSafeRoute(item.anchor.route)) {
        props.onNotify(props.labels.focusNotFound);
        return;
      }
      // Navigate to, and compare against, anchor.route — Pins treats it as the
      // authority too.
      props.onNavigate(item.anchor.route);
    }
    const found = await focusOnAnchor(item.anchor, props.focusOwner);
    if (!found) props.onNotify(props.labels.focusNotFound);
  };

  return (
    <div class="feedback-panel" data-feedback-ui>
      <div class="feedback-panel-head">
        <h2>{props.labels.panelTitle}</h2>
        <div class="feedback-panel-head-actions">
          {resolveHeaderActions(props.headerActions, header)}
          <button
            type="button"
            class="icon-btn"
            onClick={props.onClose}
            aria-label={props.labels.close}
          >
            <Icon name="close" />
          </button>
        </div>
      </div>
      <div class="feedback-panel-list">
        <Show
          when={sorted().length > 0}
          fallback={<p class="muted center">{props.labels.panelEmpty}</p>}
        >
          <For each={sorted()}>
            {(item) => (
              <div class="feedback-item">
                <button
                  type="button"
                  class="feedback-item-route"
                  onClick={() => header.goTo(item.route)}
                >
                  {item.route}
                </button>
                <button
                  type="button"
                  class="feedback-item-text feedback-item-focus"
                  onClick={() => void focusItem(item)}
                  title={props.labels.itemFocusHint}
                >
                  {item.body}
                </button>
                {props.renderItemMeta?.(item)}
                <div class="feedback-item-row">
                  <span class="muted feedback-item-anchor">
                    {anchoring().describeAnchor(item.anchor)}
                  </span>
                  <span class="muted">{props.labels.formatRelativeTime(item.created_at)}</span>
                  <span class="spacer" />
                  <button
                    type="button"
                    class="feedback-item-vote"
                    onClick={() => vote(item.id, 1)}
                    aria-label={props.labels.voteUp}
                  >
                    <Icon name="add" />
                  </button>
                  <span class="feedback-item-votes">{displayVotes(item)}</span>
                  {/* Only own comments get a delete button; others' get no button
                   *  at all (don't hint that it exists). */}
                  <Show when={item.author_key === props.authorKey}>
                    <button
                      type="button"
                      class={DELETE_BUTTON_CLASS}
                      classList={{ confirming: confirmingId() === item.id }}
                      onClick={() => handleDeleteTap(item)}
                      aria-label={
                        confirmingId() === item.id
                          ? props.labels.deleteConfirmHint
                          : props.labels.deleteItem
                      }
                    >
                      <Show when={confirmingId() === item.id} fallback={<Icon name="delete" />}>
                        {props.labels.deleteConfirmText}
                      </Show>
                    </button>
                  </Show>
                </div>
              </div>
            )}
          </For>
        </Show>
      </div>
    </div>
  );
}
