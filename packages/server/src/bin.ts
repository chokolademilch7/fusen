#!/usr/bin/env bun
/**
 * `fusen-serve` — the process form of `@fusen/server`.
 *
 *     fusen-serve --db ./fusen.sqlite --port 8400
 *
 * Everything it decides lives in `serve.ts`; this file exists to bind a port and
 * print where it is listening. `idleTimeout: 0` is not optional — the realtime
 * stream is a long-lived response and Bun's default timeout cuts it, which
 * presents as a reconnect loop rather than as an error.
 */

import { createServeHandler, parseServeArgs } from "./serve.ts";
import { MAX_REQUEST_BYTES } from "./server.ts";

const HELP = `fusen-serve — run the fusen protocol as its own process

USAGE:
  fusen-serve [--db <path>] [--port <n>] [--host <addr>] [--base <path>]

FLAGS:
  --db     SQLite file (default: fusen.sqlite, ":memory:" allowed)
  --port   listen port (default: 8400)
  --host   listen address (default: 127.0.0.1; 0.0.0.0 to listen on every
           interface, e.g. inside a container)
  --base   collection root (default: /api/feedback)

Put it behind a reverse proxy on the same origin as the page:
  location = /api/feedback { proxy_pass http://127.0.0.1:8400; proxy_set_header X-Forwarded-Proto $scheme; }
  location /api/feedback/ { proxy_pass http://127.0.0.1:8400; proxy_set_header X-Forwarded-Proto $scheme; }
(Two blocks: a bare "location /api/feedback" also captures /api/feedback-admin.)
`;

const argv = process.argv.slice(2);
if (argv.includes("--help") || argv.includes("-h")) {
  console.log(HELP);
  process.exit(0);
}

let options;
try {
  options = parseServeArgs(argv);
} catch (error) {
  console.error(`${error instanceof Error ? error.message : String(error)}\n\n${HELP}`);
  process.exit(1);
}

const served = createServeHandler(options);

Bun.serve({
  port: options.port,
  hostname: options.host,
  // SSE — see the note in `@fusen/server`'s index.
  idleTimeout: 0,
  // Bun answers 413 itself past this, before the handler reads a byte.
  maxRequestBodySize: MAX_REQUEST_BYTES,
  fetch: served.fetch,
});

console.log(
  `fusen listening on http://${options.host}:${options.port}${options.basePath} (db: ${options.db})`,
);
