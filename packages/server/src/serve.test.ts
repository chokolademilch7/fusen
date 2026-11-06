/**
 * The standalone entry: fusen as its own process, for a host that will not (or
 * cannot) call `handle` from inside its own server.
 *
 * The process itself is not tested here — what is tested is everything that
 * decides how it behaves: the arguments, and the request handler they produce.
 */

import { afterEach, describe, expect, test } from "bun:test";
import { createServeHandler, parseServeArgs } from "./serve.ts";

const closers: Array<() => void> = [];

afterEach(() => {
  for (const close of closers.splice(0)) close();
});

function handlerFor(argv: string[] = ["--db", ":memory:"]) {
  const served = createServeHandler(parseServeArgs(argv));
  closers.push(served.close);
  return served;
}

describe("parseServeArgs", () => {
  test("defaults to a file next to the process and the documented port", () => {
    expect(parseServeArgs([])).toEqual({
      db: "fusen.sqlite",
      port: 8400,
      host: "127.0.0.1",
      basePath: "/api/feedback",
    });
  });

  test("reads every flag", () => {
    const options = parseServeArgs([
      "--db",
      "/tmp/x.sqlite",
      "--port",
      "3000",
      "--host",
      "0.0.0.0",
      "--base",
      "/notes",
    ]);
    expect(options).toEqual({
      db: "/tmp/x.sqlite",
      port: 3000,
      host: "0.0.0.0",
      basePath: "/notes",
    });
  });

  test("an unknown flag is refused, not ignored", () => {
    expect(() => parseServeArgs(["--databse", "x"])).toThrow("--databse");
  });

  test("a flag with no value is refused", () => {
    expect(() => parseServeArgs(["--db"])).toThrow("--db");
  });

  test("a port that is not a number is refused", () => {
    expect(() => parseServeArgs(["--port", "eight"])).toThrow("--port");
  });
});

describe("createServeHandler", () => {
  test("answers the protocol on the configured base path", async () => {
    const { fetch } = handlerFor();
    const res = await fetch(new Request("http://localhost/api/feedback"));
    expect(res.status).toBe(200);
    expect((await res.json()) as { feedback: unknown[] }).toEqual({ feedback: [] });
  });

  test("follows --base", async () => {
    const { fetch } = handlerFor(["--db", ":memory:", "--base", "/notes"]);
    expect((await fetch(new Request("http://localhost/notes"))).status).toBe(200);
    expect((await fetch(new Request("http://localhost/api/feedback"))).status).toBe(404);
  });

  test("has a health check, because a proxy in front of it will want one", async () => {
    const { fetch } = handlerFor();
    const res = await fetch(new Request("http://localhost/healthz"));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
  });

  test("anything else is 404 — this process serves the protocol and nothing else", async () => {
    const { fetch } = handlerFor();
    expect((await fetch(new Request("http://localhost/"))).status).toBe(404);
  });

  test("writes land in the store it opened", async () => {
    const { fetch } = handlerFor();
    const anchor = {
      version: 1,
      route: "/",
      selectorPath: "#a > p",
      fingerprint: { tag: "p", dataAttrs: {}, classList: [], textSnippet: "hi" },
      rectRatio: { x: 0.5, y: 0.5 },
    };
    await fetch(
      new Request("http://localhost/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ route: "/", body: "b", anchor, context: null, nonce: "n" }),
      }),
    );
    const listed = (await (await fetch(new Request("http://localhost/api/feedback"))).json()) as {
      feedback: unknown[];
    };
    expect(listed.feedback).toHaveLength(1);
  });
});
