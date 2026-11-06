/**
 * The side-effect entry point: importing this module registers `<fusen-widget>`
 * and nothing else.
 *
 * WHY A SEPARATE ENTRY: a plain HTML page has no module graph and no bundler. It
 * wants one `<script type="module" src="...">` that makes the tag exist. The
 * library entry (`index.ts`) deliberately does NOT register on import, because a
 * host that wants a different tag name — or wants registration deferred past
 * first paint — must be able to import the API without the side effect.
 *
 * Configuration still happens the normal way. A page that needs a non-default
 * `basePath`, its own `FeedbackHttp`, or a `captureContext` probe calls
 * `configureFusenWidget()` from the library entry BEFORE the first element
 * connects; this entry only claims the tag.
 */

import { defineFusenElement } from "./index.ts";

defineFusenElement();

export * from "./index.ts";
