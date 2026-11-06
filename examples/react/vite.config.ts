/**
 * Config whose only job is to show how `@fusen/lite` is used from React.
 *
 * The repo root is added to `fs.allow` because the widget is loaded by relative
 * path from `../../packages/lite/dist/fusen-lite.js`, which is outside the Vite root.
 * The dev server refuses to serve files outside the root by default, so without
 * this only `vite` (dev) returns 403
 * (`vite build` is unaffected because Rollup bundles the file).
 */

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  server: { fs: { allow: [resolve(import.meta.dirname, "../..")] } },
});
