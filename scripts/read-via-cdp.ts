#!/usr/bin/env bun
/**
 * Print the fusen comments in a running browser.
 *
 * This is the human-facing form of what the MCP server does automatically —
 * both call `findFusenPages` from `@fusen/mcp`, so there is one implementation
 * and it cannot drift. Reach for this when you want to see the comments in a
 * terminal, or to check the CDP path is working before blaming the model.
 *
 *     chromium --remote-debugging-port=9222 --user-data-dir=/tmp/fusen-profile
 *
 *     bun run scripts/read-via-cdp.ts
 *     bun run scripts/read-via-cdp.ts --url localhost:8501
 *     bun run scripts/read-via-cdp.ts --port 9222 --json
 *
 * Exit codes are distinct on purpose: 0 found something, 3 the browser is there
 * but no tab has fusen on it, 4 no browser on that port. "You did not open the
 * page" and "you did not start the browser" need different fixes, and one
 * generic non-zero would make the caller guess.
 */

import {
  CdpUnreachableError,
  findFusenPages,
  SUPPORTED_BRIDGE_VERSION,
} from "../packages/mcp/src/cdp.ts";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

const port = Number(arg("port") ?? 9222);
const urlFilter = arg("url");
const asJson = process.argv.includes("--json");

let pages;
try {
  pages = await findFusenPages({ port, ...(urlFilter ? { urlFilter } : {}) });
} catch (error) {
  if (error instanceof CdpUnreachableError) {
    console.error(
      `No browser is listening for CDP on port ${port}.\n` +
        `Start one with:  chromium --remote-debugging-port=${port} --user-data-dir=/tmp/fusen-profile\n` +
        `The separate --user-data-dir matters: without it the flag is silently ignored when a\n` +
        `browser is already running, and CDP never opens.`,
    );
    process.exit(4);
  }
  throw error;
}

if (pages.length === 0) {
  console.error(
    `Reached the browser on port ${port}, but no open tab has fusen on it.\n` +
      `Open the page that loads fusen-lite.js and try again` +
      (urlFilter ? ` (currently filtering for "${urlFilter}").` : "."),
  );
  process.exit(3);
}

if (asJson) {
  console.log(JSON.stringify(pages, null, 2));
  process.exit(0);
}

for (const page of pages) {
  console.log(`\n# ${page.title}`);
  console.log(`  ${page.url}`);
  if (page.version !== SUPPORTED_BRIDGE_VERSION) {
    console.log(
      `  ! this page's __fusen is version ${page.version}; this script expects ${SUPPORTED_BRIDGE_VERSION}, ` +
        `so the output may be incomplete`,
    );
  }
  if (page.comments.length === 0) {
    console.log("  (no comments)");
    continue;
  }
  for (const comment of page.comments) {
    console.log(
      `  [${comment.id}] ${comment.route}  +${comment.votes}  ${comment.author_name}  ${comment.created_at}`,
    );
    console.log(`      ${String(comment.body).replace(/\n/g, "\n      ")}`);
  }
}
