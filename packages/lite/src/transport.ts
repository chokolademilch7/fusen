/**
 * "Realtime" without a network: other TABS of the same browser.
 *
 * The widget wants a feed so a second view of the same page stays in step. With
 * no server there is still a real version of that question — two tabs open on
 * the same site — and `BroadcastChannel` answers it exactly, same-origin and
 * same-device. So the seam is filled rather than stubbed out, and the widget's
 * reconciliation logic runs the same way it does against SSE.
 *
 * Status is reported as `live` immediately and never changes. That is not a
 * shortcut: there is no connection to lose. Reporting `connecting` first would
 * make the widget draw a spinner for a state that cannot fail, and reporting a
 * reconnect would make it refetch a snapshot that cannot have drifted.
 */

import type { ConnectionStatus, FeedbackFrame, FeedbackItem, FeedbackTransport } from "@fusen/core";

export const DEFAULT_CHANNEL = "fusen";

export type LocalRealtime = {
  transport: FeedbackTransport;
  /** Tell the other tabs. Called by the store after each mutation. */
  publish: (change: FeedbackItem | { deletedId: number }) => void;
  /** Release the channel. */
  close: () => void;
};

function frameFor(change: FeedbackItem | { deletedId: number }): FeedbackFrame {
  // Any nonce works here. A receiving tab is by definition not the tab that
  // wrote the comment, so it has no pending nonce to match and will apply the
  // frame — which is what we want.
  const nonce = `local-${Date.now().toString(36)}`;
  // `"deletedId" in change` does NOT narrow this union: `FeedbackItem` carries an
  // index signature for application-specific fields, so every key is a possible
  // key of it. Test the value's type instead.
  const deletedId = (change as { deletedId?: unknown }).deletedId;
  if (typeof deletedId === "number") return { type: "deleted", id: deletedId, nonce };
  return { type: "created", feedback: change as FeedbackItem, nonce };
}

export function createLocalRealtime(channelName: string = DEFAULT_CHANNEL): LocalRealtime {
  // BroadcastChannel is not universal (older Safari, and any non-browser
  // context). Its absence costs cross-tab updates and nothing else, so degrade
  // rather than refuse to start.
  const channel = typeof BroadcastChannel === "function" ? new BroadcastChannel(channelName) : null;

  const listeners = new Set<(frame: FeedbackFrame) => void>();

  if (channel) {
    channel.onmessage = (event: MessageEvent) => {
      const frame = event.data as FeedbackFrame;
      if (!frame || typeof frame.type !== "string") return;
      for (const listener of listeners) listener(frame);
    };
  }

  return {
    transport: {
      subscribe(
        onFrame: (frame: FeedbackFrame) => void,
        onStatus: (status: ConnectionStatus) => void,
      ) {
        listeners.add(onFrame);
        onStatus("live");
        return () => {
          listeners.delete(onFrame);
        };
      },
    },
    publish(change) {
      channel?.postMessage(frameFor(change));
    },
    close() {
      listeners.clear();
      channel?.close();
    },
  };
}
