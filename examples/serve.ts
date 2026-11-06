// Dev server that serves examples/ as plain static files. For the examples only; not meant for production.
// Usage: bun run examples/serve.ts <dir> <port>

const [dir, port] = process.argv.slice(2);

if (!dir || !port) {
  console.error("Usage: bun run examples/serve.ts <dir> <port>");
  process.exit(1);
}

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
};

const contentType = (path: string) => {
  const dot = path.lastIndexOf(".");
  return (dot === -1 ? undefined : CONTENT_TYPES[path.slice(dot)]) ?? "application/octet-stream";
};

const server = Bun.serve({
  port: Number(port),
  async fetch(request) {
    const raw = new URL(request.url).pathname;
    // %2e%2e decodes back to "..", so reject both before and after decoding.
    let decoded: string;
    try {
      decoded = decodeURIComponent(raw);
    } catch {
      return new Response("Bad Request", { status: 400 });
    }
    if (raw.includes("..") || decoded.includes("..")) {
      return new Response("Forbidden", { status: 403 });
    }

    const path = decoded === "/" ? "/index.html" : decoded;
    const file = Bun.file(`${dir}${path}`);
    // Bun.file does not throw on a missing path, so without this check we would return an empty 200.
    if (!(await file.exists())) {
      return new Response("Not Found", { status: 404 });
    }

    return new Response(file, { headers: { "content-type": contentType(path) } });
  },
});

console.log(`serving ${dir} at http://localhost:${server.port}`);
