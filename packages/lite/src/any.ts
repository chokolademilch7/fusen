/**
 * The one bundle that can be either build.
 *
 *     <script type="module" src="fusen.js"></script>                  <!-- server -->
 *     <script type="module" src="fusen.js" data-mode="client"></script> <!-- browser -->
 *
 * Why one file rather than two: the widget is identical in both, and the heavy
 * part (SolidJS) is already in both. Shipping the lite implementations
 * alongside the fetch/EventSource default costs a few kilobytes and removes the
 * step where switching storage means swapping a script tag.
 *
 * `fusen-lite.js` and `fusen-widget.js` remain exactly what they were. This is
 * an addition, not a replacement — a page that has already committed to one
 * storage has no reason to carry the other.
 *
 * The mode is read ONCE here, at load. See `mode.ts` for why that is not a
 * limitation but the point.
 */

import { configureFusenWidget, defineFusenElement } from "@fusen/ui";
import { createFusenLite } from "./lite.ts";
import { readModeInputs, resolveMode } from "./mode.ts";
import { readWebmcpInputs, resolveWebmcp } from "./webmcp.ts";

// The element is consulted only if the script tag said nothing, and only the
// first one: the runtime it configures is shared by every widget on the page.
// `readModeInputs` and not `document.currentScript` — see its comment.
const mode = resolveMode(readModeInputs(document));

if (mode === "client") {
  // `data-webmcp` is read only on this branch. In server mode the comments are
  // already behind an endpoint that `@fusen/mcp` reaches without a browser at
  // all, so publishing a second, page-scoped route to them would add an exposure
  // and answer no question the stdio server does not already answer.
  const lite = createFusenLite({ webmcp: resolveWebmcp(readWebmcpInputs(document)) });
  configureFusenWidget({ http: lite.http, transport: lite.transport });
} else {
  // The defaults: `fetch` on /api/feedback and an EventSource on its /events.
  configureFusenWidget();
}

defineFusenElement();

export * from "./index.ts";
export { resolveMode, type FusenMode, type ModeInputs } from "./mode.ts";
export { resolveWebmcp, type WebmcpInputs } from "./webmcp.ts";
