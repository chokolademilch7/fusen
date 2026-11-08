#!/usr/bin/env bun
/**
 * Build `packages/fusen` — the ONE package this monorepo publishes to npm.
 *
 * WHY A SEPARATE PACKAGE. The five workspace packages are named `@fusen/*`, and
 * the npm scope `@fusen` belongs to someone else. Those names can never be
 * published, and they must never appear in what is: a consumer resolving
 * `@fusen/core` from the registry would get a stranger's code. So the published
 * files carry no `@fusen/*` specifier at all, and the end of this script fails
 * the build if one slips through.
 *
 *   ui, lite      -> copied from their vite `dist/` (already self-contained:
 *                    Solid's JSX needs vite, see packages/ui/vite.config.ts).
 *                    Run `bun run build` first; `build:npm` does.
 *   core, server, -> `bun build` of the thin entries in packages/fusen/src, with
 *   mcp, the bins    `@fusen/*` inlined and shared code split into chunks so
 *                    core is not duplicated per subpath. Only real npm
 *                    dependencies of `fusen` stay external.
 *   types         -> `tsc --emitDeclarationOnly`, then `@fusen/*` and `.ts`
 *                    specifiers rewritten to relative `.js` paths in dist/types.
 *
 * It must stay offline and fast: `verify` runs it.
 */

export {};

import { cpSync, rmSync } from "node:fs";
import { dirname, relative } from "node:path";
import { $, Glob } from "bun";

const PKG = "packages/fusen";
const DIST = `${PKG}/dist`;
const TYPES = `${DIST}/types`;

type Ranges = Record<string, string>;
const manifest = (await Bun.file(`${PKG}/package.json`).json()) as {
  dependencies: Ranges;
  peerDependencies: Ranges;
};
const DEPENDENCIES = Object.keys(manifest.dependencies);

// --- fusen's ranges are hand copies: fail on drift -----------------------------
//
// `dependencies` mirrors what core/server/mcp import from npm (they are bundled
// with those left external), `peerDependencies` what ui/lite expect the host to
// provide. Bumping a range in a workspace package and forgetting the copy here
// would publish a `fusen` whose declared range no longer matches the code.
{
  const SOURCES = [
    { field: "dependencies", from: ["core", "server", "mcp"] },
    { field: "peerDependencies", from: ["ui", "lite"] },
  ] as const;
  const drift: string[] = [];
  for (const { field, from } of SOURCES) {
    const expected: Ranges = {};
    for (const name of from) {
      const pkg = (await Bun.file(`packages/${name}/package.json`).json()) as {
        dependencies?: Ranges;
      };
      for (const [dep, range] of Object.entries(pkg.dependencies ?? {})) {
        if (dep.startsWith("@fusen/")) continue;
        if (expected[dep] !== undefined && expected[dep] !== range) {
          drift.push(
            `packages/${name} wants ${dep}@${range} but another source wants ${expected[dep]}`,
          );
        }
        expected[dep] = range;
      }
    }
    const actual = manifest[field] ?? {};
    for (const dep of new Set([...Object.keys(expected), ...Object.keys(actual)])) {
      if (expected[dep] !== actual[dep]) {
        drift.push(
          `${PKG} ${field}.${dep} is ${JSON.stringify(actual[dep])}, ` +
            `packages/{${from.join(",")}} declare ${JSON.stringify(expected[dep])}`,
        );
      }
    }
  }
  if (drift.length > 0) {
    console.error(`✗ ${PKG}/package.json has drifted from the workspace packages:`);
    for (const line of drift) console.error(`  - ${line}`);
    process.exit(1);
  }
}

rmSync(DIST, { recursive: true, force: true });

// --- core / server / mcp / bins ------------------------------------------------

const built = await Bun.build({
  entrypoints: ["core", "server", "server-sqlite", "server-testkit", "mcp", "cli"].map(
    (name) => `${PKG}/src/${name}.ts`,
  ),
  // cli.ts only `import()`s a bin for its side effects. That is why server's and
  // mcp's package.json list `./src/bin.ts` in `sideEffects`: with `false` there,
  // a side-effect-only import of a bin was dropped and shipped an empty bin that
  // exited 0 without serving anything (measured).
  root: `${PKG}/src`,
  outdir: DIST,
  // `bun:sqlite` and the server's `Bun.serve` — these subpaths are Bun-only.
  target: "bun",
  format: "esm",
  splitting: true,
  // An explicit list, NOT `packages: "external"`: that would leave `@fusen/*`
  // as bare imports, which is the one thing this build exists to prevent.
  external: DEPENDENCIES.flatMap((dep) => [dep, `${dep}/*`]),
  naming: { entry: "[name].[ext]", chunk: "chunks/[name]-[hash].[ext]" },
});
if (!built.success) {
  for (const log of built.logs) console.error(log);
  process.exit(1);
}

// --- ui / lite: the vite builds, as they are ---------------------------------

const COPIES: Record<string, string> = {
  "packages/ui/dist/index.js": "ui.js",
  "packages/ui/dist/fusen-widget.js": "fusen-widget.js",
  "packages/lite/dist/index.js": "lite.js",
  // Script-tag bundles at stable paths, e.g.
  // https://cdn.jsdelivr.net/npm/@chokolademilch7/fusen/dist/fusen-lite.js
  "packages/lite/dist/fusen-lite.js": "fusen-lite.js",
  "packages/lite/dist/fusen.js": "fusen.js",
};
for (const [from, to] of Object.entries(COPIES)) {
  if (!(await Bun.file(from).exists())) {
    console.error(`✗ ${from} — missing. Run \`bun run build\` first.`);
    process.exit(1);
  }
  cpSync(from, `${DIST}/${to}`);
}

// --- types ---------------------------------------------------------------------

await $`bunx tsc -p ${PKG}/tsconfig.types.json`;

const INTERNAL: Record<string, string> = {
  "@fusen/core": "core/src/index.js",
  "@fusen/ui": "ui/src/index.js",
  "@fusen/lite": "lite/src/index.js",
  "@fusen/server": "server/src/index.js",
  "@fusen/server/sqlite": "server/src/sqlite.js",
  "@fusen/server/testkit": "server/src/testkit.js",
  "@fusen/mcp": "mcp/src/index.js",
};

/** `from "x"` and `import("x")` — the specifier positions of a module. */
const SPECIFIER = /(\bfrom\s*|\bimport\s*\(\s*)(["'])([^"']+)\2/g;

for (const file of new Glob("**/*.d.ts").scanSync(TYPES)) {
  const path = `${TYPES}/${file}`;
  const text = await Bun.file(path).text();
  const rewritten = text.replace(SPECIFIER, (whole, lead: string, quote: string, spec: string) => {
    let target = spec;
    const internal = INTERNAL[spec];
    if (internal) {
      target = relative(dirname(file), internal);
      if (!target.startsWith(".")) target = `./${target}`;
    } else if (spec.startsWith(".")) {
      // tsc keeps `./x.ts` in declarations even with rewriteRelativeImportExtensions.
      target = spec.replace(/\.tsx?$/, ".js");
    }
    return target === spec ? whole : `${lead}${quote}${target}${quote}`;
  });
  if (rewritten !== text) await Bun.write(path, rewritten);
}

// --- files npm wants next to package.json ---------------------------------------

// Copied, not committed: one source of truth for each, at the repository root.
for (const file of ["LICENSE", "THIRD_PARTY_NOTICES.md"]) cpSync(file, `${PKG}/${file}`);

// The README's relative links (./docs/..., the screenshot) point into the
// repository, which the tarball does not carry, so on npmjs.com they would
// 404. Pin them to the repository on GitHub; images go through raw so they render.
const REPO = "https://github.com/chokolademilch7/fusen";
const readme = (await Bun.file("README.md").text())
  .replace(/!\[([^\]]*)\]\(\.\/([^)]+)\)/g, `![$1](${REPO}/raw/main/$2)`)
  .replace(/\]\(\.\/([^)]+)\)/g, `](${REPO}/blob/main/$1)`);
await Bun.write(`${PKG}/README.md`, readme);

// --- gate ----------------------------------------------------------------------

/**
 * Types reference these, the JS does not: ui's `feedbackMachine` and
 * `FeedbackWidget` are typed with them, but their runtime is bundled into ui.js.
 * A consumer without them installed sees those few exports as `any`.
 */
const TYPE_ONLY = new Set(["solid-js", "xstate", "@xstate/solid"]);

/**
 * Every place a module name can sit in the output, for the gate below: SPECIFIER
 * plus a bare side-effect `import "x"` and `require("x")`, which SPECIFIER (only
 * a rewrite target) does not need to see but a leaked dependency can hide in.
 */
const IMPORTED = /(\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)(["'])([^"']+)\2/g;

function allowed(spec: string, declaration: boolean): boolean {
  if (spec.startsWith(".")) return !declaration || !/\.tsx?$/.test(spec);
  if (spec.startsWith("node:") || spec.startsWith("bun:")) return true;
  const name = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0]!;
  return DEPENDENCIES.includes(name) || (declaration && TYPE_ONLY.has(name));
}

let failed = false;
if ((await Bun.file(`${PKG}/package.json`).text()).includes("@fusen/")) {
  console.error(`✗ ${PKG}/package.json names an @fusen/* package — that scope is not ours.`);
  failed = true;
}
for (const file of new Glob("**/*.{js,d.ts}").scanSync(DIST)) {
  const text = await Bun.file(`${DIST}/${file}`).text();
  for (const [, , , spec] of text.matchAll(IMPORTED)) {
    // Prose inside comments matches too ("from \"no comments yet\""); only a
    // specifier that looks like a module name is judged.
    if (!/^(\.|@|[a-z])[\w@./:-]*$/.test(spec!)) continue;
    if (!allowed(spec!, file.endsWith(".d.ts"))) {
      console.error(`✗ ${DIST}/${file} imports "${spec}", which is not a dependency of fusen`);
      failed = true;
    }
  }
}
if (failed) process.exit(1);
console.log(`✓ ${PKG} built: no @fusen/* specifier, every bare import is a dependency`);
