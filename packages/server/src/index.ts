/**
 * `@fusen/server` — the protocol `@fusen/ui` speaks, as one function from
 * `Request` to `Response`.
 *
 * The widget has always assumed five routes exist. Until this package they were
 * every host's problem to write, and writing them is deceptively hard: four of
 * the ways to get it wrong produce a server that looks completely healthy and a
 * widget that quietly does not work. All four now belong to this package —
 * see `normalize.ts` and the `nonce` note in `hub.ts`.
 *
 * The only thing a host writes is a `FeedbackStore`: four methods over whatever
 * it stores into. `createMemoryStore()` ships here, so the zero-configuration
 * path is not a slogan — and `createSqliteStore()` ships behind
 * `@fusen/server/sqlite` (Bun only), so neither is the durable one.
 *
 *     import { createFusenServer, createMemoryStore } from "@fusen/server";
 *
 *     const fusen = createFusenServer({ store: createMemoryStore() });
 *
 *     Bun.serve({
 *       idleTimeout: 0, // SSE — see below
 *       fetch: async (req) => (await fusen.handle(req)) ?? myOwnRoutes(req),
 *     });
 *
 * HOST REQUIREMENT THIS PACKAGE CANNOT ENFORCE: the realtime stream is a
 * long-lived response, and a server with an idle timeout will cut it. On
 * `Bun.serve` that is `idleTimeout: 0`. No test here can catch its absence,
 * because the failure is on the host's side of the seam and looks like a
 * reconnect loop.
 */

export { createFusenServer, DEFAULT_BASE_PATH, type FusenServer } from "./server.ts";
export { createMemoryStore, type MemoryStore } from "./memory.ts";
export { createHub, type FeedbackHub } from "./hub.ts";
export { type AnonymousCookieOptions } from "./identity.ts";
export { normalizeItem, normalizeItems } from "./normalize.ts";
export { isVoteDelta, MAX_VOTE_DELTA } from "@fusen/core";

export type {
  Author,
  CreateInput,
  FeedbackStore,
  FusenServerOptions,
  VoteResult,
} from "./types.ts";

/** Re-exported so a host implementing a store does not have to depend on
 *  `@fusen/core` directly just to name the row it returns. */
export type { Anchor, FeedbackFrame, FeedbackItem, PageContext } from "@fusen/core";
