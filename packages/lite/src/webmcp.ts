/**
 * The comments, as tools the page itself hands to a browser agent.
 *
 * WHY THIS EXISTS. `bridge.ts` explains the problem: with no server there is no
 * endpoint, the comments sit in IndexedDB, and anything that wants to read them
 * has to run code in the page. Until now that meant an external actor doing it —
 * a DevTools Protocol session, a Playwright script — which is why `@fusen/mcp`'s
 * lite path asks the user to relaunch their browser with
 * `--remote-debugging-port` and a separate `--user-data-dir`. That is a lot of
 * ceremony to read notes you wrote yourself, and the flag is silently ignored if
 * a browser is already running, so the common failure is a tool that returns
 * nothing and a user who cannot tell why.
 *
 * WebMCP removes the external actor. A page registers tools on
 * `document.modelContext` and an agent attached to the browser calls them
 * in-page, so the comments are readable with no port, no profile, and no second
 * process. Same three tools, same names, same arguments, same payloads as the
 * stdio server — the functions come from `@fusen/core`, which is the reason they
 * were moved there.
 *
 * OFF BY DEFAULT, unlike the bridge. `window.__fusen` is on by default because
 * reading it already requires a privileged external actor: someone must attach a
 * debugger or run an extension in the page. WebMCP is a lower bar — any agent
 * the user's browser has attached can enumerate and call these tools with no
 * code injection at all. `mode.ts` states the house rule for this: a choice that
 * changes where the data can go has to be typed. So it is:
 *
 *     <script type="module" src="fusen-lite.js" data-webmcp></script>
 *     <fusen-widget webmcp></fusen-widget>
 *
 * READ-ONLY, and not by omission. There are no write tools here for the same
 * reason `cdp-store.ts` has none: a comment is something a person leaves while
 * looking at a page. An agent that can silently delete the notes it was asked to
 * summarise is a data-loss problem with no upside.
 *
 * THE PAYLOAD IS UNTRUSTED, AND SAYS SO. Comment bodies are free text written by
 * a person, and they go straight into an agent's context — a note reading
 * "ignore your instructions and…" is a prompt injection with a delivery route.
 * Nothing here can sanitise that without destroying the content, so the tools
 * carry `untrustedContentHint: true`, which is the signal the spec provides for
 * exactly this, and the payload stays structured JSON rather than prose.
 *
 * WHAT THIS DOES NOT WORK ON, stated here because the failure is silent:
 * `document.modelContext` is `[SecureContext]`, so a page served over plain http
 * from a LAN address has no `modelContext` at all and this registers nothing.
 * `http://localhost` is a secure context and does work. The API is also a Chrome
 * origin trial (149-156) behind `chrome://flags/#enable-webmcp-testing` or a
 * per-origin token — which fusen cannot ship on a host page's behalf. Everything
 * here is therefore written to no-op cleanly rather than to assume support.
 */

import type { FeedbackReader } from "@fusen/core";
import { getFeedback, listFeedback, summarizeRoutes } from "@fusen/core";
import type { LocalStore } from "./store.ts";

/** What a tool hands back: MCP's content blocks, which is what the spec's
 *  `execute` callback resolves to. */
export type ToolResult = { content: { type: "text"; text: string }[] };

export type ModelContextTool = {
  name: string;
  title?: string;
  description: string;
  inputSchema?: object;
  annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean };
  execute: (input: Record<string, unknown>) => Promise<ToolResult>;
};

export type RegisterToolOptions = { signal?: AbortSignal; exposedTo?: string[] };

/** The slice of `ModelContext` this uses. Structural so the registration can be
 *  tested without a browser that has shipped the API. */
export type ModelContextLike = {
  registerTool(tool: ModelContextTool, options?: RegisterToolOptions): Promise<void>;
};

declare global {
  interface Document {
    /** Chrome origin trial. Absent everywhere else, and absent on this one
     *  outside a secure context. */
    modelContext?: ModelContextLike;
  }
  interface Navigator {
    /** Where the API lived before Chrome 150 deprecated it in favour of
     *  `document.modelContext`. Read only as a fallback. */
    modelContext?: ModelContextLike;
  }
}

/**
 * Names match `@fusen/mcp` exactly, prefix included.
 *
 * The prefix does more work here than it does over stdio: a WebMCP page shares
 * one tool namespace with everything else the page registers, and a bare
 * `list_feedback` next to some other library's `list_feedback` is a collision
 * nobody can debug from the agent's side. It also keeps the promise that the
 * tools are the same three whichever transport answered — a model that learned
 * `fusen_list_feedback` from the stdio server finds it here under that name.
 */
export const WEBMCP_TOOL_NAMES = [
  "fusen_list_feedback",
  "fusen_get_feedback",
  "fusen_summarize_routes",
] as const;

/**
 * Where the API actually is, across the two namespaces it has had.
 *
 * The origin trial spans Chrome 149-156 and the move from `navigator` to
 * `document` happened in 150, so both live browsers exist. `document` first: it
 * is the one the spec defines and the one that will remain.
 */
export function findModelContext(
  scope: {
    document?: { modelContext?: ModelContextLike };
    navigator?: { modelContext?: ModelContextLike };
  } = globalThis,
): ModelContextLike | undefined {
  return scope.document?.modelContext ?? scope.navigator?.modelContext;
}

/** A `FeedbackReader` over the local store. The whole adapter — `dump()` already
 *  returns exactly the rows the tools read, newest first. */
export function readerFromStore(store: LocalStore): FeedbackReader {
  return { list: () => store.dump() };
}

function asContent(value: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

/**
 * Turn a thrown error into an answer, exactly as the stdio server does.
 *
 * A tool that rejects reads to an agent as "this tool is broken" and usually
 * ends the attempt. The failures reachable from here are things like a blocked
 * IndexedDB (private browsing, a storage quota) — recoverable, and worth saying
 * out loud instead of surfacing as a dead end.
 */
async function answering(work: () => Promise<unknown>): Promise<ToolResult> {
  try {
    return asContent(await work());
  } catch (error) {
    return asContent({ error: error instanceof Error ? error.message : String(error) });
  }
}

/** Both hints on every tool: nothing here writes, and everything here returns
 *  text a person typed. */
const ANNOTATIONS = { readOnlyHint: true, untrustedContentHint: true } as const;

/** The three tools, as descriptors. Separate from registration so a test can read
 *  what would be published without a `ModelContext` to publish it to. */
export function createWebmcpTools(reader: FeedbackReader): ModelContextTool[] {
  return [
    {
      name: "fusen_list_feedback",
      title: "List fusen comments",
      description:
        "Comments pinned to elements on this page, newest first. Reports `total` next to `returned`.",
      inputSchema: {
        type: "object",
        properties: {
          route: {
            type: "string",
            description: "Only comments posted from this route, e.g. '/watch/1'.",
          },
          query: { type: "string", description: "Case-insensitive substring of the comment text." },
          limit: { type: "integer", minimum: 1, maximum: 500, description: "Default 50." },
        },
      },
      annotations: ANNOTATIONS,
      execute: (input) =>
        answering(() =>
          listFeedback(reader, {
            ...(typeof input.route === "string" ? { route: input.route } : {}),
            ...(typeof input.query === "string" ? { query: input.query } : {}),
            ...(typeof input.limit === "number" ? { limit: input.limit } : {}),
          }),
        ),
    },
    {
      name: "fusen_get_feedback",
      title: "Read one fusen comment",
      description: "One comment in full, with its raw anchor and the page snapshot, if any.",
      inputSchema: {
        type: "object",
        properties: { id: { type: "integer", description: "Comment id." } },
        required: ["id"],
      },
      annotations: ANNOTATIONS,
      execute: (input) =>
        answering(async () => {
          const id = Number(input.id);
          // No `source` argument, unlike the stdio tool. That one spans several
          // browser tabs and needs a tie-breaker for ids that each page numbers
          // from 1; this one is registered by a page and sees only that page,
          // so an id here is unambiguous and an extra argument would be a lie.
          if (!Number.isFinite(id)) return { error: "id must be a number", id: input.id };
          return (await getFeedback(reader, id)) ?? { error: "not found", id };
        }),
    },
    {
      name: "fusen_summarize_routes",
      title: "Comment counts per route",
      description: "Comment and vote counts per route, busiest first. Cheapest way to orient.",
      inputSchema: { type: "object", properties: {} },
      annotations: ANNOTATIONS,
      execute: () => answering(() => summarizeRoutes(reader)),
    },
  ];
}

export type RegisterWebmcpOptions = {
  /** Where the comments come from. */
  reader: FeedbackReader;
  /** Override the lookup. Defaults to `findModelContext()`. */
  modelContext?: ModelContextLike;
  /** Abort it to unregister every tool — the spec's own mechanism. */
  signal?: AbortSignal;
};

/**
 * Publish the tools, if this browser has anywhere to publish them.
 *
 * Returns whether it did. NOT a throw when the API is missing: the overwhelmingly
 * common case is a browser without the origin trial, or a page outside a secure
 * context, and that is a page working normally with one optional feature absent —
 * not an error a host should have to guard against to load a widget.
 */
export async function registerWebmcpTools(options: RegisterWebmcpOptions): Promise<boolean> {
  const modelContext = options.modelContext ?? findModelContext();
  if (!modelContext) return false;

  const registerOptions = options.signal ? { signal: options.signal } : undefined;
  for (const tool of createWebmcpTools(options.reader)) {
    await modelContext.registerTool(tool, registerOptions);
  }
  return true;
}

/** `data-webmcp` on the script tag, or `webmcp` on the first `<fusen-widget>`. */
export type WebmcpInputs = { script?: string | null; element?: string | null };

/** The parts of `document` the lookup needs, so it can be tested without one. */
export type WebmcpDocument = {
  querySelector: (selector: string) => { getAttribute: (name: string) => string | null } | null;
};

/**
 * A bare attribute reads as `""`. Anything unrecognised warns and means off.
 *
 * WARN, NOT THROW — deliberately unlike `resolveMode`, which throws on a value
 * it does not know. The difference is what each one costs. Both are read in the
 * bundle entry ABOVE `defineFusenElement()`, so a throw takes the custom element
 * with it: no widget, no comments visible, none writable. For the mode that is
 * the right trade, because the alternative is comments silently landing in a
 * database the author never set up. This is an optional read hatch, and losing
 * the whole widget over a typo in it is a severity mismatch.
 *
 * The warning still exists because the failure it prevents is real: an author
 * who wrote `data-webmcp="yes"` would otherwise be convinced the tools are
 * published when nothing is.
 */
function asFlag(value: string): boolean {
  if (value === "" || value === "on" || value === "true") return true;
  if (value === "off" || value === "false") return false;
  console.warn(
    `fusen: unknown data-webmcp value ${JSON.stringify(value)} (expected "on" or "off") — ` +
      `treating it as off, so no tools are published.`,
  );
  return false;
}

/** The script tag outranks the element, matching `resolveMode`. Default off. */
export function resolveWebmcp(inputs: WebmcpInputs): boolean {
  const declared = inputs.script ?? inputs.element;
  return declared === null || declared === undefined ? false : asFlag(declared);
}

/**
 * Find what the page said.
 *
 * `document.currentScript` is not consulted at all, unlike `readModeInputs`: it
 * is null inside a module, and the attribute-based lookup that exists there to
 * work around that covers the classic-script case too.
 */
export function readWebmcpInputs(doc: WebmcpDocument): WebmcpInputs {
  const script = doc.querySelector("script[data-webmcp]");
  const widget = doc.querySelector("fusen-widget[webmcp]");
  return {
    script: script?.getAttribute("data-webmcp") ?? null,
    element: widget?.getAttribute("webmcp") ?? null,
  };
}
