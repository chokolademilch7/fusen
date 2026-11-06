import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "../..");

export default defineConfig({
  plugins: [
    vue({
      template: {
        compilerOptions: {
          // Vue's SFC compiler treats an unknown tag as "a component not registered yet"
          // and warns "Failed to resolve component: fusen-widget".
          // fusen-widget is a custom element, so declare it outside Vue's control here.
          // This is the only setting needed to use this widget with Vue.
          isCustomElement: (tag) => tag.startsWith("fusen-"),
        },
      },
    }),
  ],
  server: {
    // The widget itself lives in packages/lite/dist, outside this example's root.
    // The dev server refuses files outside the root by default, so allow up to the repo root.
    fs: { allow: [repoRoot] },
  },
});
