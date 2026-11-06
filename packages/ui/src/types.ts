/**
 * This package's wire vocabulary, which is entirely `@fusen/core`'s.
 *
 * Nothing is declared here any more. The protocol types and the two client
 * seams (`FeedbackHttp`, `FeedbackTransport`) all live in the core, because the
 * things that implement them are not all user interfaces: `@fusen/server`
 * describes rows with them, and `@fusen/lite` implements the client seams
 * against IndexedDB so a page can run with no server at all. A backend or a
 * storage adapter that had to depend on this package would be dragging solid-js
 * and xstate along to name four function signatures.
 *
 * They are aliased through so this package's public surface is unchanged by
 * where they sit — a consumer importing `FeedbackItem` from `@fusen/ui` still
 * gets exactly what it always did.
 *
 * As ever there is no runtime validation anywhere near these. They are types.
 * Both sides are checked by `tsc` against the same shape, so a divergence
 * surfaces where an adapter is built rather than silently at runtime.
 */

import type {
  Anchor,
  ConnectionStatus,
  FeedbackFrame,
  FeedbackHttp,
  FeedbackItem,
  FeedbackTransport,
  PageContext,
} from "@fusen/core";

export type {
  Anchor,
  ConnectionStatus,
  FeedbackFrame,
  FeedbackHttp,
  FeedbackItem,
  FeedbackTransport,
  PageContext,
};
