English | [日本語](./CONTRIBUTING.ja.md)

# Contributing

## Requirements

- [Bun](https://bun.sh) 1.4.3 (the same version as CI; pinned in `.github/workflows/ci.yml`)
- Chromium, if you run the examples' acceptance tests: `bunx playwright install chromium`

## Getting started

```sh
git clone https://github.com/chokolademilch7/fusen
cd fusen
bun install
bun run hooks:install   # once, first: a pre-push hook that stops direct pushes to main
bun run verify          # lint + format + tests + types + build (incl. the npm package and its import check) + three gates (check:bundle, check:freshness, check:plugin)
```

`verify` passes offline. Get it green locally before you push.

**Do not push to main directly.** Create a branch, open a PR, and merge once CI is green. The
pre-push hook installed by `hooks:install` only stops an accidental local push to main; it is
not enforcement (`--no-verify` skips it).

## Pull requests

- One change per PR. If you change behaviour, include a test that checks it.
- If you change how things look or how the widget behaves, also run the examples' acceptance
  tests: run `bun run build` at the repository root, run `bun install` in the react and vue
  directories, then `(cd examples/plain && bunx playwright test)` (and the same for react /
  vue). The steps are under "Acceptance tests" in
  [examples/README.md](./examples/README.md).
- If you touch `packages/lite/src/webmcp.ts`, run `bun run scripts/check-webmcp.ts` by hand and
  put the Chrome version you used in the PR (it is not part of `verify`; see "WebMCP manual
  check" below).
- If you rebuild `packages/lite/dist/fusen-lite.js`, copy it to `examples/plain/fusen-lite.js`
  and commit both together.

## Verification

```
bun run verify        # lint + format + tests + types + build (incl. the npm package and its import check) + three gates (check:bundle, check:freshness, check:plugin)
```

CI runs on pull_request and on pushes to main. On top of `verify`, it runs the acceptance tests
of the three examples (plain / react / vue) in a real browser as a matrix.

### WebMCP manual check

There is one manual check that is not part of `verify`.

```
bun run scripts/check-webmcp.ts
```

WebMCP is an origin trial, so it needs **preconditions on the machine**: Chrome 149 to 156 and a
flag. Putting it in `verify`, which has to pass everywhere, would mean either honest runs fail,
or it gets skipped until it means nothing (the same reason `read-via-cdp.ts` is a script). If
you touch `webmcp.ts`, run it by hand and put the Chrome version in the PR.

It checks what `webmcp.test.ts`, which runs against a fake `ModelContext`, **cannot check in
principle**: whether the `{content:[…]}` that `execute` returns is the shape the browser wants,
whether the API really lives at `document.modelContext`, and whether a page without
`data-webmcp` exposes nothing. The last one matters most: if the default leaked, everything
would still look normal from every other angle.

### Manifest gate

The **manifest gate** (`bun run check:plugin`) stops the two manifests from drifting apart, and
either one from departing from its spec. Both break silently, and clients keep loading without a
word (unknown fields are "report and ignore"; a stale `version` means a stale cache). It does
not fetch the spec's schema: `verify` has to pass offline.

### Parity gate

The **parity gate** is the key one. `packages/core/test/anchor-parity.test.ts` feeds the same
input to the engine as it was before extraction (frozen as a fixture in
`packages/core/test/pre-extraction-anchor.ts`) and to the current engine, and requires them to
match with zero tolerance. It is the only evidence that the extraction preserved behaviour, so
this fixture must not be deleted.

To guard against a vacuous pass, the number of successful resolutions is bounded from both sides
(it fails if every result is null and if every one succeeds). That the gate itself has teeth was
confirmed by applying three kinds of perturbation to both engines and watching it actually turn
red.

## Security

Report vulnerabilities through the process in [SECURITY.md](./SECURITY.md), not in a PR or an
issue.
