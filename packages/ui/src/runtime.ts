/**
 * The widget's non-reactive plane: how it talks to a server, how it decides an
 * element is "its own", and how it takes a snapshot of the page.
 *
 * These are process-wide because the things they configure are process-wide: one
 * shared realtime connection, one shared item list, one badge per page. The
 * reactive/per-render seams (current route, navigation intents, labels, slots)
 * are props on `FeedbackWidget` instead — see that file.
 *
 * Every field has a working default, so a host that just wants the original
 * behaviour on the original endpoints can mount the widget without calling
 * `configureFusenWidget` at all. Call it before mounting when you need to
 * override; it replaces the configuration wholesale, so anything you omit falls
 * back to the default rather than to whatever was set last.
 */

import { createAnchorEngine, type AnchorEngine, type PageContext } from "@fusen/core";
import { createFetchHttp } from "./http.ts";
import { createEventSourceTransport } from "./realtime.ts";
import type { FeedbackHttp, FeedbackTransport } from "./types.ts";

/** The attribute the widget stamps on its own nodes, and the selector used to
 *  skip them while hit-testing. Configurable because a host may need to exclude
 *  more than the widget's own layer (a chrome bar, a debug overlay). */
export const SELF_ATTR = "data-feedback-ui";
export const DEFAULT_SELF_SELECTOR = `[${SELF_ATTR}]`;

export type FeedbackWidgetRuntime = {
  /** Network calls. Defaults to `createFetchHttp()` on `/api/feedback`. */
  http?: FeedbackHttp;
  /** Realtime feed. Defaults to `createEventSourceTransport()`. */
  transport?: FeedbackTransport;
  /**
   * Snapshot of what the page was doing, attached to a new comment.
   *
   * The probes that make this interesting — which state machines are mounted,
   * what a media element is playing — are knowledge about one application, so
   * they are the HOST's to supply: wire this to
   * `capturePageContext({ machines, playback })` from `@fusen/core`.
   * The default returns null: a widget with no host probe posts a comment with
   * no snapshot, which is a degraded feature, not a broken one.
   */
  captureContext?: () => PageContext | null;
  /** `data-*` keys to ignore when fingerprinting an element, because they churn
   *  with app state and would break re-resolution. Defaults to the core's list. */
  volatileDataKeys?: readonly string[];
  /** Selector for nodes the widget must not hit-test through. */
  selfSelector?: string;
};

type ResolvedRuntime = {
  http: FeedbackHttp;
  transport: FeedbackTransport;
  captureContext: () => PageContext | null;
  anchoring: AnchorEngine;
  selfSelector: string;
};

function resolve(config: FeedbackWidgetRuntime): ResolvedRuntime {
  return {
    http: config.http ?? createFetchHttp(),
    transport: config.transport ?? createEventSourceTransport(),
    captureContext: config.captureContext ?? (() => null),
    // Passing undefined through is fine: the core falls back to its own
    // DEFAULT_VOLATILE_DATA_KEYS, keeping one source of truth for that list.
    anchoring: createAnchorEngine({ volatileDataKeys: config.volatileDataKeys }),
    selfSelector: config.selfSelector ?? DEFAULT_SELF_SELECTOR,
  };
}

let runtime = resolve({});

/** Install (or reset) the widget's runtime configuration. */
export function configureFusenWidget(config: FeedbackWidgetRuntime = {}): void {
  runtime = resolve(config);
}

/** Read the live configuration. Read per call rather than captured at module
 *  load, so `configureFusenWidget` takes effect for already-imported code. */
export function feedbackRuntime(): ResolvedRuntime {
  return runtime;
}

/** Convenience readers for the two things components reach for constantly. */
export function anchoring(): AnchorEngine {
  return runtime.anchoring;
}

export function selfSelector(): string {
  return runtime.selfSelector;
}
