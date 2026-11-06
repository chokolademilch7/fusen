import type { FeedbackLabels } from "../labels.ts";
import { Icon } from "./Icon.tsx";

/** Persistent floating badge — the one element mounted across every leaf state,
 *  so it is where the machine's `data-machine`/`data-state` pair lives. That
 *  pair is a published contract (see `machine.ts`): a host's coverage gate reads
 *  it, so its attribute names and value format must not change. Note that inside
 *  the custom element this copy of the pair lives in the SHADOW root, so a
 *  `document.querySelectorAll("[data-machine]")` sweep never sees it — the
 *  light-DOM host carries the pair for those readers (see `element/host.ts`).
 *  Keeping it here as well costs nothing and keeps the badge meaningful when the
 *  component is mounted directly rather than through the element.
 *
 *  Discreet by design: fixed corner placement, small footprint, doesn't cover
 *  content. */
export function Badge(props: {
  stateAttr: string;
  active: boolean;
  onToggle: () => void;
  onOpenPanel: () => void;
  /** At >=640px the list becomes a right-hand drawer, so while it is open the
   *  cluster shifts left by that width (the CSS watches data-panel-open). */
  panelOpen: boolean;
  labels: FeedbackLabels;
}) {
  return (
    <div
      class="feedback-badge-cluster"
      data-feedback-ui
      data-panel-open={props.panelOpen || undefined}
    >
      <button
        type="button"
        class="feedback-panel-toggle"
        onClick={props.onOpenPanel}
        aria-label={props.labels.openPanel}
      >
        <Icon name="list_alt" />
      </button>
      <button
        type="button"
        class="feedback-badge"
        classList={{ active: props.active }}
        data-machine="feedback"
        data-state={props.stateAttr}
        onClick={props.onToggle}
        aria-pressed={props.active}
        aria-label={props.active ? props.labels.endMode : props.labels.startMode}
      >
        <Icon name={props.active ? "close" : "chat_bubble"} />
      </button>
    </div>
  );
}
