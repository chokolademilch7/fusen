/**
 * `@fusen/mcp` — the comments, as tools a model can use.
 *
 * It is built on `@fusen/server`'s `FeedbackStore`, not on a database and not on
 * a particular deployment, which buys both supply routes for free:
 *
 *   in-process   the application already has a store — hand it over directly
 *   over HTTP    `createHttpStore({ baseUrl })` against any fusen server
 *
 * The second is the interesting one: because the protocol is the contract, the
 * same MCP server can be pointed at the demo or at a production deployment
 * without knowing either one's schema.
 *
 * Read-only unless `allowWrite: true`.
 */

export { createFusenMcpServer, type FusenMcpOptions } from "./server.ts";
export { createHttpStore, type HttpStoreOptions } from "./http-store.ts";
export { createCdpStore, type CdpStoreOptions } from "./cdp-store.ts";
export {
  CdpUnreachableError,
  DEFAULT_CDP_PORT,
  findFusenPages,
  SUPPORTED_BRIDGE_VERSION,
  type FindPagesOptions,
  type FusenPage,
} from "./cdp.ts";
export {
  DEFAULT_LIMIT,
  getFeedback,
  listFeedback,
  summarizeRoutes,
  type FeedbackSummary,
  type ListArgs,
} from "./tools.ts";
