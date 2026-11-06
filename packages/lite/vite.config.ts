/**
 * Library build for `@fusen/lite`.
 *
 * `vite-plugin-solid` because the widget's JSX is a Babel transform that
 * `bun build` mis-compiles into classic `createElement` calls — a bundle that
 * builds and renders nothing. Nothing is external, because a plain HTML page has
 * no import map to resolve anything with.
 *
 * TWO SEPARATE BUILDS, ON PURPOSE. Vite's multi-entry lib mode code-splits what
 * the entries share, and the shared part here is *everything*: the widget entry
 * came out beginning with
 *
 *     import { createFusenLite } from "./index.js";
 *
 * A page that copies only `fusen-lite.js` — which is exactly what the README
 * tells people to do — then 404s on `./index.js`, the module never evaluates,
 * and the custom element silently never upgrades. There is no console error
 * beyond the 404, so it presents as a broken widget. Measured; it cost a full
 * red test suite before it was understood.
 *
 * So the widget entry is built alone, with `inlineDynamicImports`, which
 * requires a single entry and is why this cannot be one invocation.
 *
 *   `--mode lib`     -> dist/index.js       for a bundler-using consumer
 *   `--mode widget`  -> dist/fusen-lite.js  ONE file, for a script tag
 */

import { defineConfig, type UserConfig } from "vite";
import solid from "vite-plugin-solid";
import { resolve } from "node:path";
import { bannerPlugin } from "../ui/banner.ts";

const ENTRIES: Record<string, Record<string, string>> = {
  lib: { index: "src/index.ts" },
  widget: { "fusen-lite": "src/auto.ts" },
  // Both storages in one file; the page picks with data-mode. Same
  // single-entry constraint as `widget`, for the same reason.
  any: { fusen: "src/any.ts" },
};

export default defineConfig(({ mode }): UserConfig => {
  // `--mode dev` (`bun run dev`): the `any` bundle, rebuilt on every save, for a
  // consuming page under local test. `@fusen/ui` resolves to its SOURCE here,
  // so a ui or core edit lands without the ui build in between — the ordering
  // that scripts/check-build-freshness.ts guards for the real build. It writes
  // to dist-dev/, never dist/, so a dev bundle cannot be shipped as a release.
  const dev = mode === "dev";
  const single = mode !== "lib";
  const entries = ENTRIES[dev ? "any" : mode] ?? ENTRIES.lib!;
  return {
    // The lib entry never imports @fusen/ui, so dist/index.js needs no third-party notice.
    plugins: [solid(), ...(single ? [bannerPlugin()] : [])],
    resolve: dev
      ? { alias: { "@fusen/ui": resolve(import.meta.dirname, "../ui/src/index.ts") } }
      : undefined,
    build: {
      watch: dev ? {} : undefined,
      outDir: dev ? "dist-dev" : "dist",
      target: "esnext",
      // The lib build runs first and clears; the others add to it.
      emptyOutDir: !single,
      lib: {
        entry: Object.fromEntries(
          Object.entries(entries).map(([name, path]) => [name, resolve(import.meta.dirname, path)]),
        ),
        formats: ["es"],
      },
      rollupOptions: {
        output: {
          entryFileNames: "[name].js",
          // Single entry only — this is the whole reason for the split build.
          inlineDynamicImports: single,
        },
      },
    },
  };
});
