import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import type { FeedbackItem } from "../types.ts";
import type { FeedbackLabels } from "../labels.ts";
import { clearFocus, isFocusedItem } from "../focus.ts";
import { displayVotes, removeFeedback, vote } from "../store.ts";
import { anchoring } from "../runtime.ts";
import { type PinColorer, resolvePinColor } from "../slots.ts";
import { Icon } from "./Icon.tsx";
import { DELETE_BUTTON_CLASS, isDeleteButtonTap } from "./delete-confirm.ts";

const MUTATION_DEBOUNCE_MS = 200;
/** Anchors within this many px of each other are treated as "the same
 *  spot" and folded into one pin cluster. */
const CLUSTER_RADIUS_PX = 24;
/** Avatars shown in the stack before collapsing the rest into a "+N" chip. */
const CLUSTER_VISIBLE_AVATARS = 3;

type Positioned = { item: FeedbackItem; x: number; y: number; el: Element };
type Cluster = { x: number; y: number; el: Element; items: FeedbackItem[] };
type Selected = { items: FeedbackItem[]; x: number; y: number };

/** Popover width mirrors the CSS rule: min(360px, 100vw - 2*margin). */
const POPOVER_MAX_WIDTH = 360;
const POPOVER_MARGIN = 16;

/** Small round avatar for a comment's author: initial-char fallback, and an
 *  explicit pixel size on .name-avatar (via CSS) so an author picture never
 *  inflates to 100% of its container. */
function CommenterAvatar(props: { name: string; picture: string | null }) {
  return (
    <Show
      when={props.picture}
      fallback={<span class="name-avatar">{[...props.name][0] ?? "?"}</span>}
    >
      {(pic) => (
        <img class="name-avatar name-avatar-img" src={pic()} referrerpolicy="no-referrer" alt="" />
      )}
    </Show>
  );
}

/** Absolute-positioned pin layer for comments whose anchor resolves on the
 *  current route. Unresolvable anchors are simply not pinned — they remain
 *  visible in the Panel (degrade without losing data). Repositions on
 *  resize/scroll, on route change, and on DOM mutation (debounced) so pins track
 *  layout shifts without a reload. */
export function Pins(props: {
  items: FeedbackItem[];
  route: string;
  /** See the identity contract on `FeedbackWidget`: this gates whether a delete
   *  button is DRAWN. The server is what actually authorizes the delete. */
  authorKey: string;
  labels: FeedbackLabels;
  /** Host colour for a cluster's ring; `null` keeps the default. */
  pinColor?: PinColorer;
}) {
  const [tick, setTick] = createSignal(0);
  const [selected, setSelected] = createSignal<Selected | null>(null);
  // Two-step delete confirmation, same idiom as Panel.tsx (one item at a time).
  const [confirmingId, setConfirmingId] = createSignal<number | null>(null);
  const reflow = () => setTick((t) => t + 1);

  /** Inline position for the popover, computed once at open time from the
   *  tapped cluster's viewport coords, so it never collides with the
   *  bottom composer sheet. Horizontal: clamp so the (translateX(-50%))
   *  centered popover stays fully on-screen. Vertical: flip above/below
   *  the pin depending on which half of the viewport it's in. */
  const popoverStyle = (pos: { x: number; y: number }) => {
    const w = Math.min(POPOVER_MAX_WIDTH, window.innerWidth - 2 * POPOVER_MARGIN);
    const left = Math.min(
      Math.max(pos.x, POPOVER_MARGIN + w / 2),
      window.innerWidth - POPOVER_MARGIN - w / 2,
    );
    const style: Record<string, string> = { left: `${left}px`, transform: "translateX(-50%)" };
    if (pos.y > window.innerHeight * 0.5) {
      style.bottom = `${window.innerHeight - pos.y + 36}px`;
    } else {
      style.top = `${pos.y + 12}px`;
    }
    return style;
  };

  let mo: MutationObserver | undefined;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  onMount(() => {
    window.addEventListener("scroll", reflow, { passive: true, capture: true });
    window.addEventListener("resize", reflow);
    mo = new MutationObserver(() => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(reflow, MUTATION_DEBOUNCE_MS);
    });
    mo.observe(document.body, { childList: true, subtree: true, attributes: true });
  });
  onCleanup(() => {
    window.removeEventListener("scroll", reflow, true);
    window.removeEventListener("resize", reflow);
    mo?.disconnect();
    if (debounceTimer) clearTimeout(debounceTimer);
  });

  // route change (and any items() change) triggers a reflow too
  createEffect(() => {
    props.route;
    props.items;
    reflow();
  });

  // Tap elsewhere / press Escape while confirming cancels. Same idiom as Panel.
  createEffect(() => {
    if (confirmingId() === null) return;
    const cancelOnOutside = (e: PointerEvent) => {
      if (!isDeleteButtonTap(e)) setConfirmingId(null);
    };
    const cancelOnEscape = (e: KeyboardEvent) => {
      // stopPropagation for the same reason as Panel.tsx.
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

  // Fold the confirmation away if the item it belongs to disappears (reason: see
  // the same-named effect in Panel.tsx).
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
    if (isFocusedItem(item)) clearFocus();
    void removeFeedback(item.id);
  };

  const positioned = createMemo<Positioned[]>(() => {
    tick();
    const route = props.route;
    const resolve = anchoring().resolveAnchor;
    const out: Positioned[] = [];
    for (const item of props.items) {
      if (item.anchor.route !== route) continue;
      const el = resolve(item.anchor);
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      out.push({
        item,
        el,
        x: rect.left + rect.width * item.anchor.rectRatio.x,
        y: rect.top + rect.height * item.anchor.rectRatio.y,
      });
    }
    return out;
  });

  // Fold anchors that land on the same element (or within CLUSTER_RADIUS_PX
  // of each other) into one cluster, so multiple people commenting on the
  // same spot show as one stack instead of overlapping pins.
  const clusters = createMemo<Cluster[]>(() => {
    const out: Cluster[] = [];
    for (const p of positioned()) {
      const match = out.find(
        (c) => c.el === p.el || Math.hypot(c.x - p.x, c.y - p.y) < CLUSTER_RADIUS_PX,
      );
      if (match) match.items.push(p.item);
      else out.push({ x: p.x, y: p.y, el: p.el, items: [p.item] });
    }
    return out;
  });

  return (
    <div class="feedback-pins" data-feedback-ui>
      <For each={clusters()}>
        {(cluster) => (
          <button
            type="button"
            class="feedback-pin"
            style={{ left: `${cluster.x}px`, top: `${cluster.y}px` }}
            onClick={() => setSelected({ items: cluster.items, x: cluster.x, y: cluster.y })}
            aria-label={
              cluster.items.length > 1
                ? props.labels.pinCluster(
                    cluster.items.length,
                    anchoring().describeAnchor(cluster.items[0]!.anchor),
                  )
                : anchoring().describeAnchor(cluster.items[0]!.anchor)
            }
          >
            <span
              class="feedback-pin-stack"
              data-toned={resolvePinColor(props.pinColor, cluster.items) !== null || undefined}
              style={{
                "border-color": resolvePinColor(props.pinColor, cluster.items) ?? undefined,
              }}
            >
              <For each={cluster.items.slice(0, CLUSTER_VISIBLE_AVATARS)}>
                {(item) => (
                  <CommenterAvatar name={item.author_name} picture={item.author_picture} />
                )}
              </For>
              <Show when={cluster.items.length > CLUSTER_VISIBLE_AVATARS}>
                <span class="feedback-pin-more">
                  +{cluster.items.length - CLUSTER_VISIBLE_AVATARS}
                </span>
              </Show>
            </span>
          </button>
        )}
      </For>
      <Show when={selected()}>
        {(sel) => (
          <div class="feedback-pin-popover" data-feedback-ui style={popoverStyle(sel())}>
            <button
              type="button"
              class="feedback-pin-popover-close"
              onClick={() => setSelected(null)}
              aria-label={props.labels.close}
            >
              <Icon name="close" />
            </button>
            <div class="feedback-pin-popover-list">
              <For each={sel().items}>
                {(item) => (
                  <div class="feedback-item">
                    <div class="feedback-item-author">
                      <CommenterAvatar name={item.author_name} picture={item.author_picture} />
                      <span class="feedback-item-author-name">{item.author_name}</span>
                    </div>
                    <div class="feedback-item-text">{item.body}</div>
                    <div class="feedback-item-row">
                      <button
                        type="button"
                        class="feedback-item-vote"
                        onClick={() => vote(item.id, 1)}
                      >
                        <Icon name="add" />
                      </button>
                      <span class="feedback-item-votes">{displayVotes(item)}</span>
                      <span class="spacer" />
                      {/* Only own comments get a delete button; others' get no
                       *  button at all (don't hint that it exists). */}
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
            </div>
          </div>
        )}
      </Show>
    </div>
  );
}
