/**
 * Realtime frame narrowing + the default EventSource transport.
 *
 * WHY A HAND-ROLLED CHECK INSTEAD OF AN INJECTED VALIDATOR: the host validated
 * these frames with a zod schema, and this package will not force zod (or any
 * schema library) on a consumer. The alternative — taking the validator as an
 * injected function — was rejected because it would make realtime *not work at
 * all* until a host supplies one, turning an optional integration point into a
 * mandatory chore for the common case. The union is five small shapes; the
 * predicate below is a dozen lines and, unlike an injected validator, keeps the
 * zero-config path working. A host wanting contract-grade validation still has
 * a seam: it supplies its own `FeedbackTransport` and validates in there.
 *
 * Unparseable frames are dropped silently, exactly as the schema-based version
 * did (safeParse → ignore). A realtime feed is a convenience layer: every
 * missed frame is healed by the snapshot refetch on the next reconnect.
 */

import type { ConnectionStatus, FeedbackFrame, FeedbackItem, FeedbackTransport } from "./types.ts";
import { DEFAULT_BASE_PATH } from "./http.ts";

/** SSE reconnect backoff. */
const RECONNECT_DELAY_MS = 1500;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Narrow one decoded frame, or null if it is not one we understand.
 *
 * `status_changed` is treated structurally: everything except `type` and `id` is
 * collected into an opaque patch. That is what keeps one application's workflow
 * vocabulary (a review status, a ticket number, …) out of this package while
 * still speaking the wire format the server already emits.
 */
export function parseFeedbackFrame(value: unknown): FeedbackFrame | null {
  if (!isRecord(value)) return null;
  switch (value.type) {
    case "ping":
      return { type: "ping" };
    case "created":
      if (!isRecord(value.feedback) || typeof value.feedback.id !== "number") return null;
      if (typeof value.nonce !== "string") return null;
      return {
        type: "created",
        feedback: value.feedback as unknown as FeedbackItem,
        nonce: value.nonce,
      };
    case "voted":
      if (typeof value.id !== "number" || typeof value.votes !== "number") return null;
      if (typeof value.nonce !== "string") return null;
      return { type: "voted", id: value.id, votes: value.votes, nonce: value.nonce };
    case "deleted":
      if (typeof value.id !== "number" || typeof value.nonce !== "string") return null;
      return { type: "deleted", id: value.id, nonce: value.nonce };
    case "status_changed": {
      if (typeof value.id !== "number") return null;
      const patch: Record<string, unknown> = {};
      for (const [key, entry] of Object.entries(value)) {
        if (key === "type" || key === "id") continue;
        patch[key] = entry;
      }
      return { type: "status_changed", id: value.id, patch };
    }
    default:
      return null;
  }
}

export type EventSourceTransportOptions = {
  /** Full URL of the event stream. Defaults to `{basePath}/events`. */
  path?: string;
  /** Only used to derive the default `path`. */
  basePath?: string;
};

/** The v1 transport: EventSource with auto-reconnect. Swappable for polling
 *  without touching a call site (the escape hatch if SSE does not survive a
 *  production proxy). */
export function createEventSourceTransport(
  options: EventSourceTransportOptions = {},
): FeedbackTransport {
  const url = options.path ?? `${options.basePath ?? DEFAULT_BASE_PATH}/events`;

  return {
    subscribe(onFrame: (f: FeedbackFrame) => void, onStatus: (s: ConnectionStatus) => void) {
      let es: EventSource | null = null;
      let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
      let closed = false;

      function open(): void {
        if (closed) return;
        onStatus("connecting");
        es = new EventSource(url);
        es.onopen = () => onStatus("live");
        es.onmessage = (ev: MessageEvent) => {
          let parsed: unknown;
          try {
            parsed = JSON.parse(ev.data as string);
          } catch {
            return;
          }
          const frame = parseFeedbackFrame(parsed);
          if (frame) onFrame(frame);
        };
        es.onerror = () => {
          onStatus("reconnecting");
          es?.close();
          es = null;
          if (!closed && reconnectTimer === null) {
            reconnectTimer = setTimeout(() => {
              reconnectTimer = null;
              open();
            }, RECONNECT_DELAY_MS);
          }
        };
      }
      open();

      return () => {
        closed = true;
        if (reconnectTimer !== null) clearTimeout(reconnectTimer);
        es?.close();
        es = null;
      };
    },
  };
}
