# Lint and format

```bash
bun run lint        # oxlint. Warnings fail too (--deny-warnings)
bun run fmt         # format with oxfmt
bun run fmt:check   # fails if there is a diff. This is what CI runs
```

Both are part of `bun run verify`, so normally `verify` is all you need.

## Why oxlint / oxfmt

They are written in Rust and fast. The config is a single JSON file, with no stack of plugins as in eslint.
This repository originally had no linter, only type checking, so **not adding operational cost**
came first.

`oxfmt` is **on 0.63, still pre-1.0**. Its output may change between versions.
`fmt:check` is in CI, so an upgrade shows up as a diff. When it does,
run `bun run fmt` once and commit.

## Disabled rules, and why

Rules are disabled only because they are **false positives**, never because they are "noisy". JSON cannot
hold comments, so the reasons are kept here.

### `packages/ui` and `packages/lite` only

| Rule                    | Reason                                                                                                                                                                                               |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `no-unused-expressions` | This is exactly **how you subscribe to a signal** in Solid. In `createEffect(() => { props.route; reflow() })`, `props.route;` matters because it is read; remove it and the effect stops re-running |
| `no-unassigned-vars`    | `let ref: HTMLDivElement \| undefined` is assigned by Solid's `ref={ref}`. It happens through JSX, so static analysis cannot see the assignment                                                      |

**Both stay enabled for the rest of the repository.** Where Solid is not used, they are real findings.

### Everywhere

| Rule                                         | Reason                                                                                                                                                       |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `unicorn/require-post-message-target-origin` | `BroadcastChannel.postMessage` takes only one argument. A false positive from confusing it with `window.postMessage`                                         |
| `unicorn/prefer-add-event-listener`          | IndexedDB's `onsuccess` / `onerror` are part of the `IDBRequest` spec. `addEventListener` works too, but one handler per request makes this the natural form |
| `unicorn/no-array-sort`                      | `toSorted` is fairly new. On hold until the build target is raised                                                                                           |
| `unicorn/consistent-function-scoping`        | It wants test helpers moved out, but they read better kept inside the test                                                                                   |
| `no-await-in-loop`                           | Fires where **being sequential is the point**, such as checking CDP tabs one at a time                                                                       |
| `unicorn/require-module-specifiers`          | `export {}` is the idiom for "make this file a module". Remove it and top-level await stops working                                                          |
| `oxc/no-map-spread`                          | Counts are small; readability wins                                                                                                                           |

## Excluded from checks

- `**/dist/**` — build output
- `examples/plain/fusen-lite.js` — build output copied from `dist`. **The contents are generated**
- `packages/core/test/pre-extraction-anchor.ts` — **a frozen reference of the pre-port engine**.
  The parity gate compares "same result as before the port" against it, so it must not be formatted or fixed
