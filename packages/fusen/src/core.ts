// Thin re-export entries: one per public subpath of the published `fusen`
// package. scripts/build-npm.ts bundles each of them so the workspace-internal
// `@fusen/*` names are inlined and never reach a consumer.
//
// Relative paths, not `@fusen/*`: packages/fusen is kept OUT of the workspace
// (see the root package.json), so nothing links `@fusen/*` here. The packages
// these files reach still import each other by `@fusen/*` and resolve it from
// their own node_modules.
export * from "../../core/src/index.ts";
