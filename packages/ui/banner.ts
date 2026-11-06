import type { Plugin } from "vite";

/**
 * License header for every bundle that inlines solid-js and xstate (ui's and
 * lite's builds), plus the Material Symbols path data in Icon.tsx. MIT asks for the notice in "all copies", and the script-tag
 * bundles are copied around as single files, so the notice travels inside them.
 * `/*!` keeps it through minification. Full texts: THIRD_PARTY_NOTICES.md.
 */
export const BANNER = `/*! fusen | MIT License | Copyright (c) 2026 chokolademilch7
 * Bundles (MIT License): solid-js, Copyright (c) 2016-2025 Ryan Carniato;
 * xstate and @xstate/solid, Copyright (c) 2015 David Khourshid.
 * Icons (Apache License 2.0): Material Symbols, Copyright Google LLC.
 * https://github.com/chokolademilch7/fusen/blob/main/THIRD_PARTY_NOTICES.md */`;

/**
 * Prepends BANNER to every emitted chunk. Not `rollupOptions.output.banner`:
 * with vite 7.3 lib mode that option produced no header in dist (measured).
 */
export function bannerPlugin(): Plugin {
  return {
    name: "fusen-banner",
    enforce: "post",
    generateBundle(_options, bundle) {
      for (const file of Object.values(bundle)) {
        if (file.type === "chunk") file.code = `${BANNER}\n${file.code}`;
      }
    },
  };
}
