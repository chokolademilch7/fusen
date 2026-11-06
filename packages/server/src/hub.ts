/**
 * The realtime hub: one set of open streams, one `publish`.
 *
 * Kept separate from the router because it is the half a host may need to reach
 * directly. The four CRUD frames are emitted by this package as a side effect of
 * the writes it handles, but `status_changed` has no write behind it — it is how
 * an application pushes ITS OWN vocabulary (a review status, a ticket number)
 * onto an existing comment, from a workflow this package knows nothing about.
 * A hub closed to it would mean an application with a triage pipeline could
 * never adopt this server, which would defeat the point.
 */

import type { FeedbackFrame } from "@fusen/core";

type Client = {
  send: (chunk: string) => void;
  close: () => void;
};

export type FeedbackHub = {
  /** Push one frame to every open stream. */
  publish: (frame: FeedbackFrame) => void;
  /** An SSE `Response` for one subscriber. */
  stream: () => Response;
  /** Open stream count. For tests and health endpoints. */
  size: () => number;
  /** Close every stream. For a graceful shutdown, and for test teardown —
   *  an open interval keeps a process alive. */
  closeAll: () => void;
};

function encodeFrame(frame: FeedbackFrame): string {
  return `data: ${JSON.stringify(frame)}\n\n`;
}

export function createHub(keepAliveMs = 25_000): FeedbackHub {
  const clients = new Set<Client>();

  function publish(frame: FeedbackFrame): void {
    const chunk = encodeFrame(frame);
    for (const client of clients) {
      try {
        client.send(chunk);
      } catch {
        // A stream the runtime already tore down. Drop it rather than letting
        // one dead subscriber break delivery for the rest.
        clients.delete(client);
      }
    }
  }

  function stream(): Response {
    let client: Client;
    let timer: ReturnType<typeof setInterval> | null = null;

    const body = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        client = {
          send: (chunk) => controller.enqueue(encoder.encode(chunk)),
          close: () => {
            try {
              controller.close();
            } catch {
              /* already closed */
            }
          },
        };
        clients.add(client);
        // Say something immediately: a proxy that buffers until first byte
        // otherwise holds the whole response, and the reader shows
        // "connecting" until it arrives.
        client.send(encodeFrame({ type: "ping" }));
        if (keepAliveMs > 0) {
          timer = setInterval(() => {
            try {
              client.send(encodeFrame({ type: "ping" }));
            } catch {
              clients.delete(client);
              if (timer) clearInterval(timer);
            }
          }, keepAliveMs);
          // Do not hold the process open on account of a heartbeat.
          (timer as { unref?: () => void }).unref?.();
        }
      },
      cancel() {
        clients.delete(client);
        if (timer) clearInterval(timer);
      },
    });

    return new Response(body, {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
        // Nginx and friends buffer proxied responses by default, which turns a
        // live feed into nothing until the connection ends.
        "x-accel-buffering": "no",
      },
    });
  }

  return {
    publish,
    stream,
    size: () => clients.size,
    closeAll() {
      for (const client of clients) client.close();
      clients.clear();
    },
  };
}
