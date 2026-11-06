/**
 * `@fusen/core` — the dependency-free engine behind the fusen
 * widget. Plain TypeScript against the standard `Element` surface: no runtime
 * dependencies, no imports outside this directory, no framework coupling. The
 * host wires it to a UI framework, storage and HTTP; the core only reads the DOM.
 */

export type { Anchor, AnchorFingerprint, PageContext } from "./types.ts";

/** The protocol vocabulary, shared by the widget and any server that speaks to
 *  it. Here rather than in `@fusen/ui` so a backend can import it without
 *  pulling a UI framework — see `wire.ts`. */
export type {
  ConnectionStatus,
  FeedbackFrame,
  FeedbackHttp,
  FeedbackItem,
  FeedbackTransport,
} from "./wire.ts";

export {
  captureAnchor,
  createAnchorEngine,
  DEFAULT_VOLATILE_DATA_KEYS,
  describeAnchor,
  resolveAnchor,
  scoreCandidate,
} from "./anchor.ts";
export type { AnchorEngine, AnchorEngineOptions } from "./anchor.ts";

/** The one write rule both sides share — see `vote.ts`. */
export { isVoteDelta, MAX_VOTE_DELTA } from "./vote.ts";

/** Which routes may be stored and handed to the host's router — see `route.ts`. */
export { isSafeRoute } from "./route.ts";

export { capturePageContext } from "./snapshot.ts";
export type { PageContextContributors } from "./snapshot.ts";

/** The read-side questions a model asks about stored comments. Here rather than
 *  in `@fusen/mcp` because one of the three transports that answers them runs in
 *  the browser and cannot import the MCP SDK — see `tools.ts`. */
export { DEFAULT_LIMIT, MAX_LIMIT, getFeedback, listFeedback, summarizeRoutes } from "./tools.ts";
export type { FeedbackDetail, FeedbackReader, FeedbackSummary, ListArgs } from "./tools.ts";
