/**
 * fusen as its own process.
 *
 * The one-line mount (`(await fusen.handle(req)) ?? myApp(req)`) is the cheapest
 * way in, and it is unavailable to two kinds of host: one that cannot be edited
 * at all, and one that does not run on Bun. Both can put a reverse proxy in
 * front of `/api/feedback/*` instead — but only if there is something to proxy
 * TO, which is this file.
 *
 *     fusen-serve --db ./fusen.sqlite --port 8400
 *     # nginx — two blocks, because a bare `location /api/feedback` prefix also
 *     # captures neighbours such as /api/feedback-admin:
 *     location = /api/feedback { proxy_pass http://127.0.0.1:8400; proxy_set_header X-Forwarded-Proto $scheme; }
 *     location /api/feedback/ { proxy_pass http://127.0.0.1:8400; proxy_set_header X-Forwarded-Proto $scheme; }
 *
 * Same origin as far as the browser is concerned, so the cookie and CORS story
 * is exactly the mounted one. This process serves the protocol and a health
 * check, and answers 404 to everything else: the application's own routes are
 * the proxy's business, not this file's.
 */

import { createFusenServer, DEFAULT_BASE_PATH, type FusenServer } from "./server.ts";
import { createSqliteStore, type SqliteStore } from "./sqlite.ts";

export type ServeOptions = {
  db: string;
  port: number;
  host: string;
  basePath: string;
};

export type Served = {
  fetch: (request: Request) => Promise<Response>;
  fusen: FusenServer;
  store: SqliteStore;
  close: () => void;
};

const DEFAULTS: ServeOptions = {
  db: "fusen.sqlite",
  port: 8400,
  // Loopback: the documented setup is a reverse proxy on the same host, and
  // listening everywhere would let a client skip whatever the proxy enforces.
  host: "127.0.0.1",
  basePath: DEFAULT_BASE_PATH,
};

/**
 * Parse the CLI. Unknown flags and missing values throw rather than falling
 * back to a default: a typo'd `--databse` that silently opens `fusen.sqlite`
 * looks like data loss to whoever typed it.
 */
export function parseServeArgs(argv: readonly string[]): ServeOptions {
  const options: ServeOptions = { ...DEFAULTS };

  const value = (flag: string, next: string | undefined): string => {
    if (next === undefined || next.startsWith("--")) {
      throw new Error(`${flag} needs a value`);
    }
    return next;
  };

  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]!;
    switch (flag) {
      case "--db":
        options.db = value(flag, argv[++i]);
        break;
      case "--port": {
        const raw = value(flag, argv[++i]);
        const port = Number(raw);
        if (!Number.isInteger(port) || port < 0) throw new Error(`--port must be a number: ${raw}`);
        options.port = port;
        break;
      }
      case "--host":
        options.host = value(flag, argv[++i]);
        break;
      case "--base":
        options.basePath = value(flag, argv[++i]);
        break;
      default:
        throw new Error(`unknown flag: ${flag}`);
    }
  }

  return options;
}

/** Build the handler this process serves. Separated from the process so it can
 *  be exercised without binding a port. */
export function createServeHandler(options: ServeOptions): Served {
  const store = createSqliteStore({ path: options.db });
  const fusen = createFusenServer({ store, basePath: options.basePath });

  return {
    fusen,
    store,
    close: () => {
      fusen.hub.closeAll();
      store.close();
    },
    async fetch(request: Request): Promise<Response> {
      // A proxy in front of this wants somewhere to point a health check, and
      // the protocol's own routes are the wrong place to point one.
      if (new URL(request.url).pathname === "/healthz") return new Response("ok");
      return (await fusen.handle(request)) ?? new Response("not found", { status: 404 });
    },
  };
}
