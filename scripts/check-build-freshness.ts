#!/usr/bin/env bun
/**
 * BUILD ORDER IS LOad-BEARING, AND NOTHING ELSE ENFORCES IT.
 *
 * `@fusen/lite` imports `@fusen/ui`, whose `exports` resolve to `./dist/index.js`
 * — a BUILT artifact, not source. That artifact already has `@fusen/core` baked
 * into it. So:
 *
 *     edit packages/core, then build only lite  ->  the change is NOT in the
 *                                                   bundle, silently
 *
 * Measured, not theorised: patching `resolveAnchor` in core and running
 * `bun run --cwd packages/lite build` produced a bundle with zero trace of the
 * change; building ui first and then lite produced it. A stale core would ship
 * to a page while every unit test — which imports core's SOURCE — stayed green.
 *
 * `bun run build` happens to order this correctly. That is the whole problem:
 * correctness by coincidence, invisible to a reader, and one reordering away
 * from shipping a stale widget. This turns the coincidence into a check.
 *
 * The check is a timestamp comparison rather than a content hash because it has
 * to answer "is the artifact older than its inputs", which is exactly what
 * mtimes say and what a hash cannot say on its own.
 */

export {};

import { statSync } from "node:fs";
import { Glob } from "bun";

type Artifact = {
  /** The built file whose freshness is in question. */
  dist: string;
  /** Directories whose sources it is built FROM, transitively. */
  sources: string[];
};

const ARTIFACTS: Artifact[] = [
  // ui bakes in core.
  { dist: "packages/ui/dist/index.js", sources: ["packages/core/src", "packages/ui/src"] },
  { dist: "packages/ui/dist/fusen-widget.js", sources: ["packages/core/src", "packages/ui/src"] },
  // lite bakes in ui's dist, and therefore core through it.
  {
    dist: "packages/lite/dist/index.js",
    sources: ["packages/core/src", "packages/ui/src", "packages/lite/src"],
  },
  {
    dist: "packages/lite/dist/fusen-lite.js",
    sources: ["packages/core/src", "packages/ui/src", "packages/lite/src"],
  },
  {
    dist: "packages/lite/dist/fusen.js",
    sources: ["packages/core/src", "packages/ui/src", "packages/lite/src"],
  },
];

/** Newest mtime under a directory, ignoring test files — a test edit does not
 *  make a bundle stale. */
function newestSource(dir: string): { path: string; mtimeMs: number } | null {
  let newest: { path: string; mtimeMs: number } | null = null;
  for (const file of new Glob("**/*.{ts,tsx}").scanSync(dir)) {
    if (file.includes(".test.")) continue;
    const path = `${dir}/${file}`;
    const { mtimeMs } = statSync(path);
    if (!newest || mtimeMs > newest.mtimeMs) newest = { path, mtimeMs };
  }
  return newest;
}

let failed = false;

for (const artifact of ARTIFACTS) {
  let built: number;
  try {
    built = statSync(artifact.dist).mtimeMs;
  } catch {
    console.error(`✗ ${artifact.dist} — missing. Run \`bun run build\`.`);
    failed = true;
    continue;
  }

  for (const dir of artifact.sources) {
    const newest = newestSource(dir);
    if (!newest) continue;
    if (newest.mtimeMs > built) {
      console.error(
        `✗ ${artifact.dist} is older than ${newest.path}\n` +
          `  The bundle does not contain that change. Build in dependency order:\n` +
          `    bun run build      (ui, then lite — lite reads ui's dist)`,
      );
      failed = true;
    }
  }
}

if (!failed) console.log(`✓ ${ARTIFACTS.length} bundles are newer than every source they contain`);
process.exit(failed ? 1 : 0);
