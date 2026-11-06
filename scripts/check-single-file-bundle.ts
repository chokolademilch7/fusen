#!/usr/bin/env bun
/**
 * Assert the script-tag bundles are actually one file.
 *
 * WHY THIS IS A GATE AND NOT A COMMENT. Vite's multi-entry lib mode code-splits
 * whatever the entries share, and here that is everything — so the widget entry
 * came out beginning with
 *
 *     import { createFusenLite } from "./index.js";
 *
 * Every doc, and the whole premise of the lite build, tells people to copy ONE
 * file. Doing that then 404s on `./index.js`, the module never evaluates, and
 * the custom element silently never upgrades. There is no error beyond the 404,
 * so it presents as a broken widget rather than a broken build. It cost a full
 * red acceptance suite before it was understood, and NOTHING else catches it:
 * the unit tests never load the bundle, and the build itself exits 0.
 *
 * A relative import is the exact failure. A bare import would be worse still
 * (a page has no import map), so both are rejected.
 */

// Makes this file a module, which top-level `await` requires. Without it every
// name here also lands in the global scope and collides with other scripts.
export {};

const ENTRIES = [
  "packages/lite/dist/fusen-lite.js",
  "packages/lite/dist/fusen.js",
  "packages/ui/dist/fusen-widget.js",
];

/**
 * Static `import`/`export … from "…"` and dynamic `import("…")`, anchored to the
 * start of a statement.
 *
 * Anchoring is not pedantry. A looser `from\s*["']…["']` also matched
 * `from '${t.id}'` — a template literal INSIDE Solid's runtime, in a string it
 * builds at runtime — and failed a bundle that was perfectly self-contained. A
 * check that cries wolf gets deleted, so it has to be exact.
 *
 * Only these forms can make a browser fetch a second file: a static import at
 * the top level of a module, or a dynamic `import()` call.
 */
const IMPORT_SOURCES =
  /(?:^|[;}\n])\s*(?:import|export)[\s\S]{0,200}?\bfrom\s*["']([^"']+)["']|(?:^|[^.\w$])import\s*\(\s*["']([^"']+)["']/g;

let failed = false;

for (const path of ENTRIES) {
  const file = Bun.file(path);
  if (!(await file.exists())) {
    console.error(`✗ ${path} — missing. Run the package's \`build\` first.`);
    failed = true;
    continue;
  }

  const source = await file.text();
  const sources = [...source.matchAll(IMPORT_SOURCES)]
    .map((match) => match[1] ?? match[2]!)
    .filter(Boolean);

  if (sources.length > 0) {
    console.error(
      `✗ ${path} — must be self-contained, but imports: ${[...new Set(sources)].join(", ")}\n` +
        `  A page that copies only this file will 404 on those and the element will never upgrade.\n` +
        `  Fix: build this entry ALONE with rollupOptions.output.inlineDynamicImports.`,
    );
    failed = true;
    continue;
  }

  console.log(`✓ ${path} — self-contained (${(source.length / 1024).toFixed(0)} KB)`);
}

process.exit(failed ? 1 : 0);
