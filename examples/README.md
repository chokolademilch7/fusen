# examples

Samples that drop `@fusen/lite` into plain HTML / React / Vue.

## The one thing that matters

These use the **lite build**. Comments are stored in IndexedDB, which means **only inside that one browser profile on that one device**.
Nobody else sees them, and neither does another device, another browser, or a private window. That is enough for personal notes or for trying it out.
**If you want to collect feedback from other people, run `@fusen/server` instead of lite** (comments are collected on the server and shared with everyone).

## The three examples

| Directory | What it shows                                                                                            | Port |
| --------- | -------------------------------------------------------------------------------------------------------- | ---- |
| `plain`   | **No build step, no dependencies.** Drop in `fusen-lite.js`, one script tag + `<fusen-widget route="/">` | 8501 |
| `react`   | Placing the custom element from React. Attributes are written as-is                                      | 8502 |
| `vue`     | Placing it from Vue. Needs the `isCustomElement` setting (the only gotcha)                               | 8503 |

`react` and `vue` each have their own `package.json` and are **not part of the root workspace**.
To reproduce a consumer of the published package, they load the built
`packages/lite/dist/fusen-lite.js` by relative path.

## Running them

```sh
# Once, at the repo root (builds ui, then lite, producing dist/fusen-lite.js)
bun install
bun run build

# Plain HTML — the server is just the bundled static file server
bun run examples/serve.ts examples/plain 8501

# React / Vue use their own vite. Both are outside the workspace, so each needs bun install in its own directory
(cd examples/react && bun install && bunx vite --port 8502)
(cd examples/vue   && bun install && bunx vite --port 8503)
```

`fusen-lite.js` in `plain` is a copy of the build output. After rebuilding, replace it with
`cp packages/lite/dist/fusen-lite.js examples/plain/` (**it is a single self-contained file**).

## Acceptance tests

Each example has Playwright tests that are self-contained, server startup included.
After the build from "Running them" above and `bun install` in react / vue, from the repo root:

```sh
bunx playwright install chromium   # once, the first time
(cd examples/plain && bunx playwright test)
(cd examples/react && bunx playwright test)
(cd examples/vue   && bunx playwright test)
```

plain has 30 tests (`acceptance` 14, `modal` 15, `tokens` 1); react and vue have 13 each. One of them
checks that the same comment can be read from `window.__fusen` (the read hatch the page exposes).
**This is what outside tools read**, so unless it is green, neither CDP nor the skill can read anything.
