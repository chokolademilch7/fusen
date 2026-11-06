/**
 * What the tools actually do — now `@fusen/core`'s, re-exported.
 *
 * They were written here, against a `FeedbackStore`, and moved when a third
 * transport appeared that runs INSIDE the page (WebMCP, in `@fusen/lite`). A
 * browser cannot import this package — it depends on the MCP SDK — and a copy of
 * the functions would keep `bin.ts`'s promise of "the same three tools, same
 * names and arguments" only until someone edited one copy.
 *
 * The re-export is not ceremony: `list_feedback` and friends are wired from
 * here in `server.ts`, and this file is where a reader of this package looks for
 * their behaviour. It should say where the behaviour went.
 *
 * The one change on the way out was the parameter type. These functions only
 * ever called `.list()`, so they now take a structural `FeedbackReader`, which
 * every `FeedbackStore` already satisfies and which a page can build out of
 * `window.__fusen.dump()`.
 */

export { DEFAULT_LIMIT, MAX_LIMIT, getFeedback, listFeedback, summarizeRoutes } from "@fusen/core";
export type { FeedbackDetail, FeedbackReader, FeedbackSummary, ListArgs } from "@fusen/core";
