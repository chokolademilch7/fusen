#!/usr/bin/env bun
/**
 * The stdio entry point. It picks where to read from, so the caller does not
 * have to know which build a project uses.
 *
 *   FUSEN_BASE_URL set   -> a fusen server over HTTP
 *   otherwise            -> a browser over the Chrome DevTools Protocol,
 *                           which is where the lite build keeps its comments
 *
 * CDP IS THE DEFAULT, WITH NO CONFIGURATION. The lite build has no server by
 * design, and requiring an env var to reach it would mean every lite user must
 * first learn that CDP is involved at all. They should not have to: the tools
 * are the same three either way, with the same names and arguments, and a model
 * calling `list_feedback` never needs to know which transport answered.
 *
 * When the browser is not reachable the tools do not throw — a thrown tool reads
 * as "broken" and ends the attempt. They answer with what is missing, which is
 * nearly always a browser that was started without `--remote-debugging-port`.
 *
 * Env:
 *   FUSEN_BASE_URL    collection root of a fusen server, e.g. http://…/api/feedback
 *   FUSEN_CDP_PORT    DevTools port (default 9222)
 *   FUSEN_URL_FILTER  only read browser tabs whose URL contains this
 *   FUSEN_ALLOW_WRITE "1" to expose the writing tools (server mode only —
 *                     a page publishes a read-only hatch)
 *   FUSEN_HEADERS     JSON object of headers for the server, e.g. a session
 *                     cookie. It belongs in this process, not in the model's
 *                     context.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createCdpStore } from "./cdp-store.ts";
import { DEFAULT_CDP_PORT } from "./cdp.ts";
import { createHttpStore, parseHeadersEnv } from "./http-store.ts";
import { createFusenMcpServer } from "./server.ts";

const baseUrl = process.env.FUSEN_BASE_URL;

function headers(): Record<string, string> | undefined {
  if (!process.env.FUSEN_HEADERS) return undefined;
  const parsed = parseHeadersEnv(process.env.FUSEN_HEADERS);
  if (!parsed.ok) {
    // stderr, not stdout: stdout is the protocol channel and anything else on
    // it corrupts the session.
    console.error(parsed.error);
    process.exit(1);
  }
  return parsed.headers;
}

const extraHeaders = baseUrl ? headers() : undefined;

const server = baseUrl
  ? createFusenMcpServer({
      store: createHttpStore({ baseUrl, ...(extraHeaders ? { headers: extraHeaders } : {}) }),
      allowWrite: process.env.FUSEN_ALLOW_WRITE === "1",
      unavailableHint:
        `Could not reach the fusen server at ${baseUrl}. Check it is running, or unset ` +
        `FUSEN_BASE_URL to read comments from a browser instead (the lite build keeps them there).`,
    })
  : createFusenMcpServer({
      store: createCdpStore({
        port: Number(process.env.FUSEN_CDP_PORT ?? DEFAULT_CDP_PORT),
        ...(process.env.FUSEN_URL_FILTER ? { urlFilter: process.env.FUSEN_URL_FILTER } : {}),
      }),
      // A page publishes no write API, so there is nothing to enable.
      allowWrite: false,
      unavailableHint:
        `This project looks like the lite build, which keeps comments in the browser rather than ` +
        `on a server. To read them the browser must expose the DevTools protocol and the page must ` +
        `be open: start it with --remote-debugging-port=${process.env.FUSEN_CDP_PORT ?? DEFAULT_CDP_PORT} ` +
        `and a separate --user-data-dir (without a separate profile the flag is silently ignored when ` +
        `a browser is already running). If this project actually runs a fusen server, set FUSEN_BASE_URL.`,
    });

await server.connect(new StdioServerTransport());
