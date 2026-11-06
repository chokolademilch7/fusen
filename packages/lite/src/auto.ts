/**
 * The one-script-tag entry: import it and the page has a working `<fusen-widget>`
 * backed by IndexedDB.
 *
 *     <script type="module" src="fusen-lite.js"></script>
 *     <fusen-widget route="/"></fusen-widget>
 *
 * That is the entire installation. No server, no build step, no configuration.
 *
 * Registration is a side effect here and deliberately NOT one in `index.ts`: a
 * page that wants a different tag name, or wants to configure identity before
 * anything mounts, imports the pieces and wires them itself.
 *
 * The one thing this entry reads from the page is `data-webmcp`, which publishes
 * the comments as tools for a browser agent. Off unless typed — see `webmcp.ts`.
 */

import { configureFusenWidget, defineFusenElement } from "@fusen/ui";
import { createFusenLite } from "./lite.ts";
import { readWebmcpInputs, resolveWebmcp } from "./webmcp.ts";

const lite = createFusenLite({ webmcp: resolveWebmcp(readWebmcpInputs(document)) });
configureFusenWidget({ http: lite.http, transport: lite.transport });
defineFusenElement();

export * from "./index.ts";
