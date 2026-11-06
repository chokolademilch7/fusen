import { createSignal, onCleanup, onMount, Show } from "solid-js";
import type { Anchor } from "../types.ts";
import type { FeedbackLabels } from "../labels.ts";
import { anchoring, selfSelector } from "../runtime.ts";

/** Full-viewport capture layer, mounted only while the machine is in
 *  mode.picking. Intercepts the next tap before it reaches page content (media
 *  controls etc.), resolves the tapped element via elementsFromPoint — skipping
 *  the widget's own layers via the configured self-selector — and hands the
 *  anchor back to the caller. ESC or a second badge tap exits picking.
 *
 *  Also tracks a lightweight hover preview: on pointermove, the element
 *  currently under the pointer is outlined so the user can see what a tap
 *  would land on before committing. Touch devices don't fire hover-ish
 *  pointermove without contact, so this is a no-op there — the composing
 *  highlight (PickHighlight) is what carries the UX on touch. */
export function PickOverlay(props: {
  route: string;
  onPick: (anchor: Anchor, point: { x: number; y: number }) => void;
  onExit: () => void;
  labels: FeedbackLabels;
}) {
  let ref: HTMLDivElement | undefined;
  const [hoverRect, setHoverRect] = createSignal<DOMRect | null>(null);
  let rafId: number | null = null;
  let pendingPoint: { x: number; y: number } | null = null;

  function resolveTarget(x: number, y: number): Element | null {
    const stack = document.elementsFromPoint(x, y);
    const skip = selfSelector();
    return stack.find((el) => !el.closest(skip)) ?? null;
  }

  function flushHover(): void {
    rafId = null;
    const point = pendingPoint;
    if (!point) return;
    const target = resolveTarget(point.x, point.y);
    setHoverRect(target ? target.getBoundingClientRect() : null);
  }

  function handlePointerMove(e: PointerEvent): void {
    pendingPoint = { x: e.clientX, y: e.clientY };
    if (rafId === null) rafId = requestAnimationFrame(flushHover);
  }

  function handlePointerDown(e: PointerEvent): void {
    e.preventDefault();
    e.stopPropagation();
    const point = { x: e.clientX, y: e.clientY };
    const target = resolveTarget(point.x, point.y);
    if (!target) return;
    const anchor = anchoring().captureAnchor(target, point, props.route);
    props.onPick(anchor, point);
  }

  function handleKeyDown(e: KeyboardEvent): void {
    if (e.key !== "Escape") return;
    // Cancelled, in the capture phase: inside a host's modal <dialog>, the same
    // Escape would also close the dialog the user was about to comment on.
    // Still propagated, so the host's own key handlers keep seeing it.
    e.preventDefault();
    props.onExit();
  }

  onMount(() => {
    ref?.addEventListener("pointerdown", handlePointerDown, { capture: true });
    ref?.addEventListener("pointermove", handlePointerMove, { capture: true });
    window.addEventListener("keydown", handleKeyDown, { capture: true });
  });
  onCleanup(() => {
    ref?.removeEventListener("pointerdown", handlePointerDown, { capture: true });
    ref?.removeEventListener("pointermove", handlePointerMove, { capture: true });
    window.removeEventListener("keydown", handleKeyDown, { capture: true });
    if (rafId !== null) cancelAnimationFrame(rafId);
  });

  return (
    <div ref={ref} class="feedback-overlay" data-feedback-ui role="presentation">
      <div class="feedback-overlay-hint">{props.labels.pickHint}</div>
      <Show when={hoverRect()}>
        {(r) => (
          <div
            class="feedback-pick-hover"
            data-feedback-ui
            style={{
              left: `${r().left}px`,
              top: `${r().top}px`,
              width: `${r().width}px`,
              height: `${r().height}px`,
            }}
          />
        )}
      </Show>
    </div>
  );
}
