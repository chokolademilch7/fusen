/**
 * The wire vocabulary: what one stored comment looks like, and what the realtime
 * feed emits.
 *
 * WHY THESE LIVE IN THE CORE. They used to live in `@fusen/ui`, which was fine
 * while the widget was the only thing that spoke the protocol. It stopped being
 * fine the moment a SERVER package needed them: importing them from `@fusen/ui`
 * would drag solid-js and xstate into every backend install, and a server that
 * pulls a UI framework to describe a row is not a server anyone wants. The core
 * is the only package both sides can share, because it has no dependencies at
 * all — so the shared vocabulary belongs here, next to `Anchor` and
 * `PageContext`, which are already part of it.
 *
 * `@fusen/ui` re-exports every one of these under its own name, so nothing about
 * the widget's public surface changed when they moved.
 *
 * As with the rest of this package there is no runtime validation here. These
 * are types. Both sides are checked by `tsc` against the same shape, so a
 * divergence surfaces where an adapter is built rather than silently at runtime.
 */

import type { Anchor, PageContext } from "./types.ts";

/** Realtime connection state. Deliberately NOT part of the widget's state
 *  machine — see the comment at the top of `@fusen/ui`'s `machine.ts`. */
export type ConnectionStatus = "connecting" | "live" | "reconnecting";

/**
 * One remembered comment.
 *
 * The index signature is deliberate and load-bearing. Real servers return MORE
 * than the widget models (workflow status, ticket numbers, pipeline flags…) and
 * that vocabulary belongs to one application, not to this package. Extra fields
 * must ride through untouched — which is also a rule the SERVER side has to
 * honour: normalizing an item by rebuilding it field-by-field silently deletes
 * the host's own vocabulary. Normalize the known fields, spread the rest.
 */
export type FeedbackItem = {
  id: number;
  /** Route the comment was POSTed from. `anchor.route` is the authority for
   *  *where the pin goes*; this is what the panel's route chip shows. */
  route: string;
  body: string;
  anchor: Anchor;
  author_name: string;
  author_picture: string | null;
  /** Opaque per-author key the server stamps. Compared with `===` against the
   *  identity the host supplies, to decide whether to draw a delete button.
   *  Same value whatever path the item arrived by (snapshot / POST response /
   *  realtime frame), so the rule stays a single comparison. */
  author_key: string;
  context: PageContext | null;
  votes: number;
  created_at: string;
  [appSpecificField: string]: unknown;
};

/**
 * A realtime frame, after narrowing.
 *
 * `status_changed` is the one frame whose payload is application vocabulary, so
 * it is carried as an opaque `patch` of whatever extra keys the server sent
 * alongside `id`. The widget shallow-merges the patch into the item and never
 * looks inside it; `renderItemMeta` is what gives those fields meaning.
 *
 * The three CRUD frames carry a `nonce`, and a server MUST echo back the one the
 * writer sent. It is how the writer's own page recognises the echo of its own
 * write and declines to insert it twice. A frame without one is DROPPED
 * SILENTLY by the reader, so forgetting it does not raise an error anywhere — it
 * makes realtime a no-op that still looks connected.
 */
export type FeedbackFrame =
  | { type: "created"; feedback: FeedbackItem; nonce: string }
  | { type: "voted"; id: number; votes: number; nonce: string }
  | { type: "deleted"; id: number; nonce: string }
  | { type: "status_changed"; id: number; patch: Record<string, unknown> }
  | { type: "ping" };

/**
 * Everything a client needs over the network, as four calls.
 *
 * HERE, NOT IN THE WIDGET, for the same reason as the types above: an
 * implementation of this seam is not necessarily a UI. `@fusen/lite` implements
 * it against IndexedDB so a page can run with no server at all, and a package
 * that pulled in a UI framework to describe four function signatures would be
 * unusable for that.
 *
 * Argument lists are positional and mirror the endpoints one-for-one on
 * purpose: an options bag would read nicer but this is the seam an adapter
 * implements, and a flat signature makes an accidental argument swap a type
 * error rather than a silently-dropped property.
 *
 * A rejected promise is the only failure channel. Whatever an implementation
 * wants to do about a 401 — redirect to a login shell, refresh a token, ask the
 * user — is ITS business: the widget must never navigate the host away.
 */
export type FeedbackHttp = {
  /** The current snapshot. Called on start and on every reconnect. */
  list(): Promise<{ feedback: FeedbackItem[] }>;
  /** Store a new comment. Resolves with the canonical row. */
  create(
    route: string,
    body: string,
    anchor: Anchor,
    context: PageContext | null,
    nonce: string,
  ): Promise<{ feedback: FeedbackItem }>;
  /** Apply a batched vote delta. Resolves with the new known total. */
  vote(id: number, delta: number, nonce: string): Promise<{ id: number; votes: number }>;
  /** Remove one comment. The implementation is the only authority on whether
   *  the caller may. */
  remove(id: number, nonce: string): Promise<{ id: number }>;
  /**
   * Who the caller is, as far as the other side is concerned.
   *
   * OPTIONAL, because not every transport has an identity to report: the
   * serverless build knows locally who it is, and a host that supplies its own
   * client may have the answer already. Used only to decide whether a delete
   * button is drawn — the authority on deleting stays where the data is.
   */
  me?(): Promise<{ key: string; name: string }>;
};

/** Realtime feed. The default implementation is EventSource; a polling one, or
 *  a same-device BroadcastChannel, replaces it without touching a call site. */
export type FeedbackTransport = {
  /** Returns an unsubscribe function. Must report status transitions so the
   *  reader can refetch its snapshot when a connection comes back. */
  subscribe(
    onFrame: (frame: FeedbackFrame) => void,
    onStatus: (status: ConnectionStatus) => void,
  ): () => void;
};
