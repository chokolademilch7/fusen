/**
 * `@fusen/ui` — the pin / composer / panel interface for
 * `@fusen/core`, with no knowledge of any particular application.
 *
 * Everything one app used to supply implicitly is now an explicit seam:
 *
 *   HTTP + realtime     `configureFusenWidget({ http, transport })`
 *   page-context probe  `configureFusenWidget({ captureContext })`
 *   anchoring policy    `configureFusenWidget({ volatileDataKeys, selfSelector })`
 *   current route       `<FeedbackWidget currentRoute={...} />`  (an accessor)
 *   navigation          `onNavigate` — the widget emits an intent, the host moves
 *   notifications       `onNotify` (sent, pin not found — the host shows them)
 *   identity            `authorKey` (DISPLAY ONLY — see FeedbackWidgetProps)
 *   app vocabulary      `renderItemMeta`, `pinColor`, `hideItem`, `panelHeaderActions` (a header action
 *                       that leads into the host's own pages is a FACTORY, so it
 *                       can reuse the panel's close-then-navigate — see slots.ts)
 *   copy                `labels`
 *
 * THE RECOMMENDED WAY IN IS THE CUSTOM ELEMENT. `defineFusenElement()`
 * registers `<fusen-widget>`, which opens its own shadow root (`mode:
 * "open"`), carries its own stylesheet and icons, and needs nothing at all from
 * the embedding page's CSS beyond design tokens it can also do without. With
 * that route Solid never appears in the host's vocabulary: the surface is a tag,
 * five properties, and two DOM events. See `element/element.tsx`.
 *
 * `FeedbackWidget` — the Solid component — stays exported for a host that IS a
 * Solid app and would rather mount it directly, but then the host owns the
 * styling. Solid is otherwise a PRIVATE implementation detail and this package's
 * own dependency, not something a consumer must adopt.
 *
 * The five machine state names and the `data-machine`/`data-state` pair ARE part
 * of the surface, and the custom element reflects that pair onto its light-DOM
 * host so raw `document` queries can still see it — see `machine.ts` and
 * `element/host.ts`.
 *
 * Zero configuration is a working configuration: without a
 * `configureFusenWidget()` call the widget speaks the original `/api/feedback`
 * endpoints over `fetch` and EventSource, and posts comments without a page
 * snapshot.
 */

export {
  DEFAULT_FEEDBACK_ELEMENT_PROPS,
  defineFusenElement,
  FEEDBACK_ELEMENT_ATTRIBUTES,
  FEEDBACK_ELEMENT_PROP_KEYS,
  FUSEN_ELEMENT_TAG,
  FEEDBACK_NAVIGATE_EVENT,
  FEEDBACK_NOTIFY_EVENT,
  type FeedbackElementProps,
  type FeedbackItemMetaRenderer,
  type FeedbackNavigateDetail,
  type FeedbackNotifyDetail,
  type FeedbackSlotContent,
  type FeedbackWidgetElement,
  type ItemHider,
  type PanelHeaderActions,
  type PanelHeaderActionsFactory,
  type PanelHeaderContext,
  type PinColorer,
} from "./element/element.tsx";

export { FEEDBACK_WIDGET_CSS } from "./element/styles.ts";

export {
  MACHINE_ATTR,
  MACHINE_NAME,
  PUBLISHED_FEEDBACK_STATES,
  SELF_ATTR,
  STATE_ATTR,
  type PublishedFeedbackState,
} from "./element/host.ts";

export { DOCKED_BREAKPOINT_PX, DOCKED_QUERY } from "./breakpoints.ts";

export { FeedbackWidget } from "./components/FeedbackWidget.tsx";
export type { FeedbackWidgetProps } from "./components/FeedbackWidget.tsx";

export {
  configureFusenWidget,
  DEFAULT_SELF_SELECTOR,
  type FeedbackWidgetRuntime,
} from "./runtime.ts";

export { createFetchHttp, DEFAULT_BASE_PATH, type FetchHttpOptions } from "./http.ts";
export {
  createEventSourceTransport,
  parseFeedbackFrame,
  type EventSourceTransportOptions,
} from "./realtime.ts";

export { DEFAULT_LABELS, type FeedbackLabels } from "./labels.ts";

export type {
  Anchor,
  ConnectionStatus,
  FeedbackFrame,
  FeedbackHttp,
  FeedbackItem,
  FeedbackTransport,
  PageContext,
} from "./types.ts";

/** Read-side access to the shared list, for hosts that want to show a count or
 *  a connection indicator of their own outside the widget. */
export { connectionStatus, displayVotes, feedbackItems } from "./store.ts";

/** The machine itself, exported so a host can assert against the published state
 *  names (or drive the widget in a test) without reaching into internals. */
export { feedbackMachine } from "./machine.ts";
