#!/usr/bin/env bun
/**
 * `fusen` — the one bin of the published package.
 *
 *     fusen serve [--db … --port … --host … --base …]
 *     fusen mcp
 *
 * Both bins read `process.argv.slice(2)` at module top level, so the subcommand
 * is spliced out BEFORE the bin is imported; otherwise `fusen serve --port 1`
 * reaches the server's flag parser as `serve --port 1` and is rejected. The
 * imports are dynamic so `fusen mcp` never evaluates the server bin (which would
 * bind a port) and vice versa.
 */

export {};

const USAGE = `fusen — comment on a page, hand the comments to an AI

USAGE:
  fusen serve [flags]   run the fusen server (fusen serve --help for flags)
  fusen mcp             run the MCP server on stdio (env: FUSEN_BASE_URL, …)
`;

const command = process.argv[2];
process.argv.splice(2, 1);

if (command === "serve") {
  await import("../../server/src/bin.ts");
} else if (command === "mcp") {
  await import("../../mcp/src/bin.ts");
} else if (command === undefined || command === "--help" || command === "-h") {
  console.log(USAGE);
} else {
  console.error(`unknown command: ${command}\n\n${USAGE}`);
  process.exit(1);
}
