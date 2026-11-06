/**
 * The MCP surface.
 *
 * Read-only by default. Writes exist (`allowWrite: true`) but are off unless
 * asked for, because the failure modes are asymmetric: a model that lists
 * comments it should not have seen is a privacy problem, and a model that
 * deletes comments nobody asked it to delete is a data-loss problem. Only one of
 * those is recoverable.
 *
 * The tools are thin: everything they do lives in `tools.ts`, against a
 * `FeedbackStore`. That is deliberate — the store might be the application's own
 * (this server running in-process) or a remote fusen server over HTTP
 * (`createHttpStore`). Neither the tools nor this file can tell the difference.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { isVoteDelta, MAX_VOTE_DELTA } from "@fusen/core";
import type { FeedbackStore } from "@fusen/server";
import { getFeedback, listFeedback, summarizeRoutes } from "./tools.ts";

export type FusenMcpOptions = {
  store: FeedbackStore;
  /** Enable the writing tools. Off by default — see the header. */
  allowWrite?: boolean;
  name?: string;
  version?: string;
  /**
   * What to tell the caller when the store cannot be reached at all.
   *
   * The store's failure is usually not a bug but a missing precondition — a
   * browser that was never started with a DevTools port, a server that is not
   * running. The model can act on that if it is told; it can do nothing with a
   * stack trace.
   */
  unavailableHint?: string;
};

function asContent(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

/**
 * Turn a thrown store error into an answer.
 *
 * An MCP tool that throws surfaces as a protocol error, which reads to a model
 * as "this tool is broken" and usually ends the attempt. Nearly every failure
 * here is instead a recoverable precondition, and saying which one it is turns
 * a dead end into a next step.
 */
async function answering<T>(work: () => Promise<T>, hint?: string) {
  try {
    return asContent(await work());
  } catch (error) {
    // A 4xx means the server was reached and refused; the hint is about not
    // reaching it at all. A 404 here is a whole request missing (a wrong
    // FUSEN_BASE_URL path), not a missing comment, which vote/remove return as null.
    const status = (error as { status?: unknown } | null)?.status;
    const refused = typeof status === "number" && status < 500 && status !== 404;
    return asContent({
      error: error instanceof Error ? error.message : String(error),
      ...(hint && !refused ? { hint } : {}),
    });
  }
}

/**
 * TOOL NAMING AND DESCRIPTION LENGTH ARE A CONTEXT BUDGET DECISION.
 *
 * Claude Code defers MCP tool schemas by default — at session start it loads
 * only tool NAMES and the server's `instructions`, and fetches a schema when a
 * search matches. Two consequences shape everything below:
 *
 *   1. Every tool is prefixed `fusen_`. The prefix is the whole reason one
 *      search finds the group rather than three separate lookups, and it makes
 *      the owning library obvious in a list of hundreds of tool names.
 *   2. No `instructions` is set on the server. It is one of the two things that
 *      IS always resident, so the guidance lives in the skill — which loads only
 *      when the topic comes up — and the descriptions here stay to one line.
 *
 * Do not move prose back into these descriptions. The skill is the place for it.
 */
export function createFusenMcpServer(options: FusenMcpOptions): McpServer {
  const store = options.store;
  const server = new McpServer({
    name: options.name ?? "fusen",
    version: options.version ?? "0.1.0",
    // No `instructions` on purpose — see above.
  });

  server.registerTool(
    "fusen_list_feedback",
    {
      title: "List fusen comments",
      description:
        "Comments pinned to elements on the site, newest first. Reports `total` next to `returned`.",
      inputSchema: {
        route: z
          .string()
          .optional()
          .describe("Only comments posted from this route, e.g. '/watch/1'."),
        query: z.string().optional().describe("Case-insensitive substring of the comment text."),
        limit: z.number().int().positive().max(500).optional().describe("Default 50."),
      },
    },
    async (args) => answering(() => listFeedback(store, args), options.unavailableHint),
  );

  server.registerTool(
    "fusen_get_feedback",
    {
      title: "Read one fusen comment",
      description: "One comment in full, with its raw anchor and the page snapshot, if any.",
      inputSchema: {
        id: z.number().int().describe("Comment id."),
        source: z
          .string()
          .optional()
          .describe(
            "Page URL, when reading several browser tabs at once. Ids are only unique within one " +
              "page, so an ambiguous id returns every match instead of guessing.",
          ),
      },
    },
    async ({ id, source }) =>
      answering(
        async () => (await getFeedback(store, id, source)) ?? { error: "not found", id },
        options.unavailableHint,
      ),
  );

  server.registerTool(
    "fusen_summarize_routes",
    {
      title: "Comment counts per route",
      description: "Comment and vote counts per page, busiest first. Cheapest way to orient.",
      inputSchema: {},
    },
    async () => answering(() => summarizeRoutes(store), options.unavailableHint),
  );

  if (options.allowWrite) {
    server.registerTool(
      "fusen_vote_feedback",
      {
        title: "Vote on a comment",
        description: `Add a vote delta (a non-zero integer, at most ±${MAX_VOTE_DELTA}) to one comment.`,
        // Checked here, not only by the HTTP route: an in-process store applies
        // the delta as given.
        inputSchema: {
          id: z.number().int(),
          delta: z
            .number()
            .int()
            .refine(isVoteDelta, `delta must be a non-zero integer within ±${MAX_VOTE_DELTA}`),
        },
      },
      async ({ id, delta }) =>
        answering(
          async () => (await store.vote(id, delta)) ?? { error: "not found", id },
          options.unavailableHint,
        ),
    );

    server.registerTool(
      "fusen_delete_feedback",
      {
        title: "Delete a comment",
        description: "Remove one comment. The server decides whether that is permitted.",
        inputSchema: { id: z.number().int() },
      },
      async ({ id }) =>
        answering(
          async () => (await store.remove(id)) ?? { error: "not found", id },
          options.unavailableHint,
        ),
    );
  }

  return server;
}
