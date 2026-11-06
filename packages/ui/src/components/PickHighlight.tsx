import { createEffect, createSignal, onCleanup, onMount, Show } from "solid-js";
import type { Anchor } from "../types.ts";
import { anchoring } from "../runtime.ts";

/** Highlight box drawn over the element the user picked, shown throughout
 *  mode.composing / mode.submitting / mode.error so the writer can always
 *  see what their comment refers to. Re-resolves the anchor on every reflow
 *  (same fixed-position technique as Pins) rather than holding onto the
 *  captured Element directly, so a DOM re-render between PICK and now is
 *  handled the same way pins already are. If the element can no longer be
 *  resolved the box simply disappears instead of erroring.
 *
 *  The same box also serves the "focus an item from the list" highlight, which
 *  differs only in looks — hence the `class` override. */
export function PickHighlight(props: { anchor: Anchor; class?: string }) {
  const [rect, setRect] = createSignal<DOMRect | null>(null);

  const reflow = () => {
    const el = anchoring().resolveAnchor(props.anchor);
    setRect(el ? el.getBoundingClientRect() : null);
  };

  onMount(() => {
    reflow();
    window.addEventListener("scroll", reflow, { passive: true, capture: true });
    window.addEventListener("resize", reflow);
  });
  onCleanup(() => {
    window.removeEventListener("scroll", reflow, true);
    window.removeEventListener("resize", reflow);
  });

  // Anchor identity changes whenever a new element is picked (composer
  // remounts fresh per pick since it's gated by mode.composing/.../.error).
  createEffect(() => {
    props.anchor;
    reflow();
  });

  return (
    <Show when={rect()}>
      {(r) => (
        <div
          class={props.class ?? "feedback-pick-highlight"}
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
  );
}
