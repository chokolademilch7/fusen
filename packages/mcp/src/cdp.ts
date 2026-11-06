/**
 * Talking to a browser over the Chrome DevTools Protocol.
 *
 * This is the transport for the lite build, where there is no server: the
 * comments live in a page's IndexedDB and the only way to reach them from
 * another process is to run code inside the page.
 *
 * It never opens IndexedDB itself — it calls `window.__fusen.dump()`, the API
 * the page publishes. Reaching into the database directly would couple every
 * reader to the storage layout, and that coupling fails by returning an empty
 * list, which is indistinguishable from "no comments yet".
 *
 * One implementation, two consumers: the MCP store (`cdp-store.ts`) and the
 * standalone script (`scripts/read-via-cdp.ts`). They must not drift.
 */

import type { FeedbackItem } from "@fusen/core";

export const DEFAULT_CDP_PORT = 9222;

/** The bridge shape this code understands. A page reporting anything else is
 *  reported rather than silently misread. */
export const SUPPORTED_BRIDGE_VERSION = 1;

export type FusenPage = {
  url: string;
  title: string;
  version: number;
  comments: FeedbackItem[];
};

/** Thrown when the browser itself cannot be reached. Distinct from "reached the
 *  browser, no fusen page open", because the two need different fixes and a
 *  caller that conflates them tells the user to do the wrong thing. */
export class CdpUnreachableError extends Error {
  constructor(readonly port: number) {
    super(`no browser is listening for CDP on port ${port}`);
    this.name = "CdpUnreachableError";
  }
}

type Target = { type: string; title: string; url: string; webSocketDebuggerUrl?: string };

async function listTargets(port: number): Promise<Target[]> {
  let res: Response;
  try {
    res = await fetch(`http://127.0.0.1:${port}/json/list`);
  } catch {
    throw new CdpUnreachableError(port);
  }
  if (!res.ok) throw new CdpUnreachableError(port);
  return (await res.json()) as Target[];
}

/**
 * Evaluate an expression inside one page.
 *
 * `awaitPromise` is load-bearing: every `window.__fusen` function is async, and
 * without it the result is an unresolved Promise handle rather than data.
 * `returnByValue` is what serializes the result instead of returning a remote
 * object reference.
 */
function evaluate(wsUrl: string, expression: string, timeoutMs = 10_000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl);
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error("timed out talking to the page"));
    }, timeoutMs);

    socket.onopen = () => {
      socket.send(
        JSON.stringify({
          id: 1,
          method: "Runtime.evaluate",
          params: { expression, awaitPromise: true, returnByValue: true },
        }),
      );
    };
    socket.onerror = () => {
      clearTimeout(timer);
      reject(new Error("could not open a CDP session for this page"));
    };
    socket.onmessage = (event) => {
      const message = JSON.parse(String(event.data)) as {
        id?: number;
        result?: { result?: { value?: unknown }; exceptionDetails?: { text: string } };
      };
      if (message.id !== 1) return;
      clearTimeout(timer);
      socket.close();
      if (message.result?.exceptionDetails) {
        reject(new Error(message.result.exceptionDetails.text));
        return;
      }
      resolve(message.result?.result?.value);
    };
  });
}

export type FindPagesOptions = {
  port?: number;
  /** Only pages whose URL contains this. */
  urlFilter?: string;
};

/** Every open page that has fusen on it. Empty array means the browser answered
 *  but no tab has the widget — NOT that the browser is missing. */
export async function findFusenPages(options: FindPagesOptions = {}): Promise<FusenPage[]> {
  const port = options.port ?? DEFAULT_CDP_PORT;
  const targets = await listTargets(port);

  const pages = targets.filter(
    (target) =>
      target.type === "page" &&
      target.webSocketDebuggerUrl &&
      !target.url.startsWith("devtools://") &&
      (options.urlFilter === undefined || target.url.includes(options.urlFilter)),
  );

  const found: FusenPage[] = [];
  for (const page of pages) {
    let probe: unknown;
    try {
      probe = await evaluate(
        page.webSocketDebuggerUrl!,
        `(async () => {
           if (!globalThis.__fusen) return null;
           return { version: globalThis.__fusen.version, comments: await globalThis.__fusen.dump() };
         })()`,
      );
    } catch {
      // A tab that cannot be evaluated (crashed, restricted origin) is skipped:
      // the next one may well be the one wanted.
      continue;
    }
    if (!probe) continue;
    const { version, comments } = probe as { version: number; comments: FeedbackItem[] };
    found.push({ url: page.url, title: page.title, version, comments });
  }
  return found;
}
