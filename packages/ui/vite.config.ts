/**
 * Library build for `@fusen/ui`.
 *
 * WHY VITE AND NOT `bun build`: Solid's JSX is not an automatic-runtime JSX. It
 * is a Babel transform (`babel-preset-solid`) that turns markup into cloned
 * templates plus fine-grained reactive updates. `bun build` was measured against
 * this source and compiled the JSX into 95 classic `createElement(...)` calls —
 * a bundle that builds cleanly and renders nothing. `vite-plugin-solid` runs the
 * real transform, so that is the build.
 *
 * WHY NOTHING IS EXTERNAL: the point of this package is that a host embeds a
 * custom element without adopting Solid. `solid-js`, `xstate` and `@fusen/core`
 * are therefore BUNDLED IN, not left as peer imports — a plain HTML page has no
 * import map to resolve them with.
 *
 * WHY TWO BUILDS: multi-entry lib mode code-splits whatever the entries share,
 * and here that is everything, so the widget entry came out starting with
 * `import { defineFusenElement } from "./index.js"`. Anyone who copies just the
 * one file the docs point at then 404s on `./index.js` and the element silently
 * never upgrades — no error beyond the 404. `inlineDynamicImports` fixes it and
 * requires a single entry, hence two invocations.
 *
 *   `--mode lib`     -> dist/index.js         for a bundler-using consumer
 *   `--mode widget`  -> dist/fusen-widget.js  ONE file, for a script tag
 *
 * The consequence of bundling, which is real: a host that is ITSELF a Solid app
 * and imports the exported `FeedbackWidget` component from `dist` ends up with
 * two Solid runtimes, and reactivity does not cross that boundary. Such a host
 * should consume `./source` (the raw TS entry) through its own bundler instead.
 * The custom element has no such problem: its runtime is entirely inside the
 * shadow root and it talks to the outside only through attributes and events.
 */

import { defineConfig, type UserConfig } from "vite";
import solid from "vite-plugin-solid";
import { resolve } from "node:path";
import { bannerPlugin } from "./banner.ts";

export default defineConfig(({ mode }): UserConfig => {
  const widget = mode === "widget";
  return {
    plugins: [solid(), bannerPlugin()],
    build: {
      target: "esnext",
      emptyOutDir: !widget,
      lib: {
        entry: widget
          ? { "fusen-widget": resolve(import.meta.dirname, "src/auto.ts") }
          : { index: resolve(import.meta.dirname, "src/index.ts") },
        formats: ["es"],
      },
      rollupOptions: {
        output: { entryFileNames: "[name].js", inlineDynamicImports: widget },
      },
    },
  };
});
