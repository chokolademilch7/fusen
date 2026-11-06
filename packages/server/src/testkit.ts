/**
 * The conformance kit (spec S5c / S6).
 *
 * Two suites, because there are two contracts and only one of them is visible
 * from inside a store:
 *
 *   `runStoreContract`  — a store behaves. Anyone writing a Postgres, SQLite or
 *                         Redis store runs this against it.
 *   `runWireContract`   — the HTTP surface behaves. This is the one that carries
 *                         the failures nothing else catches, because each of
 *                         them is silent on the server and only shows up as a
 *                         widget that does not work.
 *
 * The wire suite is the reason this file exists. Every assertion in it
 * corresponds to a specific way a hand-written server was observed to break
 * while looking perfectly healthy from the outside.
 *
 * Both are plain functions rather than test files so a host can point them at
 * its own implementation:
 *
 *     import { runStoreContract } from "@fusen/server/testkit";
 *     runStoreContract("postgres", () => makePostgresStore(url));
 */

import { describe, expect, test } from "bun:test";
import { type Anchor, type FeedbackFrame, type FeedbackItem, MAX_VOTE_DELTA } from "@fusen/core";
import { publicKeyFor } from "./identity.ts";
import { createFusenServer, MAX_REQUEST_BYTES } from "./server.ts";
import type { Author, FeedbackStore } from "./types.ts";
import {
  MAX_ANCHOR_LENGTH,
  MAX_BODY_LENGTH,
  MAX_CONTEXT_LENGTH,
  MAX_NONCE_LENGTH,
  MAX_ROUTE_LENGTH,
} from "./validate.ts";

const anchor: Anchor = {
  version: 1,
  route: "/",
  selectorPath: "#a > p",
  fingerprint: { tag: "p", dataAttrs: {}, classList: [], textSnippet: "hello" },
  rectRatio: { x: 0.5, y: 0.5 },
};

const author: Author = { name: "Tester", key: "tester", picture: null };

function req(url: string, init?: RequestInit): Request {
  return new Request(`http://localhost${url}`, init);
}

function jsonInit(method: string, body: unknown): RequestInit {
  return { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}

/** Read the frames an SSE response emits, up to `count`, then stop reading. */
async function readFrames(response: Response, count: number): Promise<FeedbackFrame[]> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  const frames: FeedbackFrame[] = [];
  let buffered = "";
  while (frames.length < count) {
    const { value, done } = await reader.read();
    if (done) break;
    buffered += decoder.decode(value, { stream: true });
    for (const chunk of buffered.split("\n\n")) {
      const line = chunk.trim();
      if (!line.startsWith("data: ")) continue;
      frames.push(JSON.parse(line.slice(6)) as FeedbackFrame);
    }
    buffered = "";
  }
  await reader.cancel();
  return frames;
}

/** Any store must satisfy this, whatever it stores into. */
export function runStoreContract(name: string, makeStore: () => FeedbackStore): void {
  describe(`FeedbackStore contract: ${name}`, () => {
    test("create returns the row it stored, and list can see it", async () => {
      const store = makeStore();
      const created = await store.create({
        route: "/x",
        body: "hi",
        anchor,
        context: null,
        author,
      });
      expect(created.body).toBe("hi");
      expect(Number(created.id)).toBeGreaterThan(0);
      const listed = await store.list();
      expect(listed.some((item) => Number(item.id) === Number(created.id))).toBe(true);
    });

    test("create stamps the author it was handed, not one of its own", async () => {
      const store = makeStore();
      const created = await store.create({ route: "/", body: "b", anchor, context: null, author });
      expect(created.author_key).toBe(author.key);
      expect(created.author_name).toBe(author.name);
    });

    test("ids are unique across creates", async () => {
      const store = makeStore();
      const a = await store.create({ route: "/", body: "1", anchor, context: null, author });
      const b = await store.create({ route: "/", body: "2", anchor, context: null, author });
      expect(Number(a.id)).not.toBe(Number(b.id));
    });

    test("vote applies the delta and returns the new total", async () => {
      const store = makeStore();
      const created = await store.create({ route: "/", body: "v", anchor, context: null, author });
      expect((await store.vote(Number(created.id), 1))?.votes).toBe(1);
      expect((await store.vote(Number(created.id), 1))?.votes).toBe(2);
      expect((await store.vote(Number(created.id), -1))?.votes).toBe(1);
    });

    test("a missing id is null, not a throw — 404 and 500 are different answers", async () => {
      const store = makeStore();
      expect(await store.vote(999_999, 1)).toBeNull();
      expect(await store.remove(999_999)).toBeNull();
    });

    test("remove takes the row out of list, and is not idempotent about saying so", async () => {
      const store = makeStore();
      const created = await store.create({ route: "/", body: "d", anchor, context: null, author });
      expect(await store.remove(Number(created.id))).not.toBeNull();
      const listed = await store.list();
      expect(listed.some((item) => Number(item.id) === Number(created.id))).toBe(false);
      // Second remove of the same id reports "no such row" so the HTTP layer can
      // answer 404 rather than pretending it deleted something.
      expect(await store.remove(Number(created.id))).toBeNull();
    });
  });
}

/**
 * The HTTP surface. Run this against a server built on YOUR store to prove the
 * widget will actually work against it.
 */
export function runWireContract(name: string, makeStore: () => FeedbackStore): void {
  describe(`wire contract: ${name}`, () => {
    function serve() {
      // Identity is not what this suite is about. The default anonymous author
      // is per-cookie, so a create and a delete sent as two cookie-less
      // requests are two different people and the delete is correctly refused.
      // Pin one author here so these assertions stay about the wire; the
      // default's own behaviour has its suite in `identity.test.ts`.
      return createFusenServer({ store: makeStore(), anonymousCookie: false });
    }

    test("a path outside basePath is null, which is not the same as 404", async () => {
      const fusen = serve();
      expect(await fusen.handle(req("/somewhere/else"))).toBeNull();
      // Inside the collection, an unknown id IS a 404 — the host must be able to
      // fall through on the first and must not on the second.
      const missing = await fusen.handle(req("/api/feedback/424242", jsonInit("DELETE", {})));
      expect(missing?.status).toBe(404);
      fusen.hub.closeAll();
    });

    test("list returns { feedback: [] } and never a bare array", async () => {
      const fusen = serve();
      const res = await fusen.handle(req("/api/feedback"));
      expect(res?.status).toBe(200);
      expect(await res!.json()).toEqual({ feedback: [] });
      fusen.hub.closeAll();
    });

    test("anchor comes back as an OBJECT, not a JSON string", async () => {
      // A store that stringifies on the way in returns a string on the way out.
      // The reader's item check requires an object and rejects the WHOLE list
      // when one row fails — rows in the database, empty panel, no error.
      const fusen = serve();
      await fusen.handle(
        req(
          "/api/feedback",
          jsonInit("POST", { route: "/", body: "b", anchor, context: null, nonce: "n" }),
        ),
      );
      const res = await fusen.handle(req("/api/feedback"));
      const { feedback } = (await res!.json()) as { feedback: FeedbackItem[] };
      expect(typeof feedback[0]!.anchor).toBe("object");
      expect(feedback[0]!.anchor.selectorPath).toBe(anchor.selectorPath);
      fusen.hub.closeAll();
    });

    test("a POST whose anchor is not an anchor is refused with 400", async () => {
      // The write path is the ONLY place this can be caught cheaply. Once a row
      // with a non-anchor `anchor` is in the collection, GET returns it inside
      // the list, the reader's item check rejects the WHOLE list over that one
      // row, and every client's panel is empty forever with no server-side
      // error anywhere. @fusen/mcp fails harder still, on `anchor.fingerprint`
      // of undefined.
      const fusen = serve();
      const bodies: unknown[] = [
        { route: "/", body: "b", context: null, nonce: "n" }, // no anchor at all
        { route: "/", body: "b", anchor: null, context: null, nonce: "n" },
        { route: "/", body: "b", anchor: "not-an-object", context: null, nonce: "n" },
        { route: "/", body: "b", anchor: JSON.stringify(anchor), context: null, nonce: "n" },
        { route: "/", body: "b", anchor: [anchor], context: null, nonce: "n" },
        // Shaped like an anchor but missing the field every consumer reads.
        {
          route: "/",
          body: "b",
          anchor: { version: 1, route: "/", selectorPath: "#a", rectRatio: { x: 0, y: 0 } },
          context: null,
          nonce: "n",
        },
        // fingerprint present, but its own required fields are not.
        {
          route: "/",
          body: "b",
          anchor: { ...anchor, fingerprint: { tag: "p" } },
          context: null,
          nonce: "n",
        },
        // rectRatio must be two real numbers — NaN survives JSON as null.
        {
          route: "/",
          body: "b",
          anchor: { ...anchor, rectRatio: { x: null, y: 0.5 } },
          context: null,
          nonce: "n",
        },
      ];

      for (const body of bodies) {
        const res = await fusen.handle(req("/api/feedback", jsonInit("POST", body)));
        expect(res?.status).toBe(400);
      }

      // Nothing was stored, so the collection is still readable.
      const list = (await (await fusen.handle(req("/api/feedback")))!.json()) as {
        feedback: FeedbackItem[];
      };
      expect(list.feedback).toEqual([]);
      fusen.hub.closeAll();
    });

    test("a well-formed anchor is accepted exactly as before", async () => {
      const fusen = serve();
      const res = await fusen.handle(
        req(
          "/api/feedback",
          jsonInit("POST", { route: "/", body: "b", anchor, context: null, nonce: "n" }),
        ),
      );
      expect(res?.status).toBe(200);
      const { feedback } = (await res!.json()) as { feedback: FeedbackItem };
      expect(feedback.anchor).toEqual(anchor);
      fusen.hub.closeAll();
    });

    test("a POST whose body is empty, missing or not a string is refused with 400", async () => {
      // The widget never sends one (its composer trims and requires text), so
      // such a write is a broken client — storing it leaves a blank pin.
      const fusen = serve();
      const bodies = [
        { route: "/", anchor, context: null, nonce: "n" },
        { route: "/", body: "", anchor, context: null, nonce: "n" },
        { route: "/", body: "   \n", anchor, context: null, nonce: "n" },
        { route: "/", body: null, anchor, context: null, nonce: "n" },
        { route: "/", body: 42, anchor, context: null, nonce: "n" },
        { route: "/", body: ["b"], anchor, context: null, nonce: "n" },
      ];
      for (const body of bodies) {
        const res = await fusen.handle(req("/api/feedback", jsonInit("POST", body)));
        expect(res?.status).toBe(400);
      }
      const list = (await (await fusen.handle(req("/api/feedback")))!.json()) as {
        feedback: FeedbackItem[];
      };
      expect(list.feedback).toEqual([]);
      fusen.hub.closeAll();
    });

    test("validation is on the WRITE path only — rows already stored still come back", async () => {
      // Whatever is already in someone's database predates the check and must
      // keep being served: refusing to read it would turn a widget that
      // half-works into one that shows nothing.
      const store = makeStore();
      await store.create({
        route: "/",
        body: "legacy",
        anchor: { version: 1, route: "/" } as unknown as Anchor,
        context: null,
        author,
      });
      const fusen = createFusenServer({ store });
      const res = await fusen.handle(req("/api/feedback"));
      expect(res?.status).toBe(200);
      const { feedback } = (await res!.json()) as { feedback: FeedbackItem[] };
      expect(feedback).toHaveLength(1);
      expect(feedback[0]!.body).toBe("legacy");
      fusen.hub.closeAll();
    });

    test("the field types the reader checks are exactly right", async () => {
      const fusen = serve();
      const created = (await (await fusen.handle(
        req(
          "/api/feedback",
          jsonInit("POST", { route: "/", body: "b", anchor, context: null, nonce: "n" }),
        ),
      ))!.json()) as { feedback: FeedbackItem };
      const item = created.feedback;
      expect(typeof item.id).toBe("number");
      expect(typeof item.votes).toBe("number");
      expect(typeof item.created_at).toBe("string");
      expect(typeof item.route).toBe("string");
      expect(typeof item.body).toBe("string");
      expect(typeof item.author_name).toBe("string");
      expect(typeof item.author_key).toBe("string");
      // Present, and null rather than absent, when there is no picture.
      expect("author_picture" in item).toBe(true);
      fusen.hub.closeAll();
    });

    test("created / voted / deleted all echo the nonce they were sent", async () => {
      // Without it the reader drops the frame SILENTLY, so realtime becomes a
      // no-op that still reports itself as connected.
      const fusen = serve();
      const stream = (await fusen.handle(req("/api/feedback/events")))!;
      const frames = readFrames(stream, 4); // ping + created + voted + deleted

      const created = (await (await fusen.handle(
        req(
          "/api/feedback",
          jsonInit("POST", { route: "/", body: "b", anchor, context: null, nonce: "n-create" }),
        ),
      ))!.json()) as { feedback: FeedbackItem };
      const id = created.feedback.id;
      await fusen.handle(
        req(`/api/feedback/${id}/votes`, jsonInit("POST", { delta: 1, nonce: "n-vote" })),
      );
      await fusen.handle(req(`/api/feedback/${id}`, jsonInit("DELETE", { nonce: "n-delete" })));

      const seen = await frames;
      const byType = (type: string) => seen.find((frame) => frame.type === type);
      expect(byType("created")).toMatchObject({ nonce: "n-create" });
      expect(byType("voted")).toMatchObject({ nonce: "n-vote", votes: 1 });
      expect(byType("deleted")).toMatchObject({ nonce: "n-delete", id: Number(id) });
      fusen.hub.closeAll();
    });

    test("a vote delta must be a small non-zero integer", async () => {
      // Stores add the delta as given, so one request could otherwise set any
      // count, fractional or negative.
      const fusen = serve();
      const created = (await (await fusen.handle(
        req(
          "/api/feedback",
          jsonInit("POST", { route: "/", body: "b", anchor, context: null, nonce: "n" }),
        ),
      ))!.json()) as { feedback: FeedbackItem };
      const path = `/api/feedback/${created.feedback.id}/votes`;

      for (const delta of [1_000_000, -1_000_000, 0.5, 0, "1", null, MAX_VOTE_DELTA + 1]) {
        const res = await fusen.handle(req(path, jsonInit("POST", { delta, nonce: "n" })));
        expect(res?.status).toBe(400);
      }
      const ok = await fusen.handle(req(path, jsonInit("POST", { delta: 3, nonce: "n" })));
      expect(await ok!.json()).toEqual({ id: created.feedback.id, votes: 3 });
      fusen.hub.closeAll();
    });

    test("an oversized request is 413, and an oversized field is 400", async () => {
      const fusen = serve();
      const write = (fields: Record<string, unknown>) =>
        fusen.handle(
          req(
            "/api/feedback",
            jsonInit("POST", {
              route: "/",
              body: "b",
              anchor,
              context: null,
              nonce: "n",
              ...fields,
            }),
          ),
        );

      expect((await write({ body: "a".repeat(MAX_REQUEST_BYTES) }))?.status).toBe(413);
      expect((await write({ body: "a".repeat(MAX_BODY_LENGTH + 1) }))?.status).toBe(400);
      expect((await write({ route: `/${"a".repeat(MAX_ROUTE_LENGTH)}` }))?.status).toBe(400);
      expect(
        (await write({ context: { version: 1, machines: { m: "a".repeat(MAX_CONTEXT_LENGTH) } } }))
          ?.status,
      ).toBe(400);
      expect(
        (await write({ anchor: { ...anchor, selectorPath: "a".repeat(MAX_ANCHOR_LENGTH) } }))
          ?.status,
      ).toBe(400);
      for (const context of ["[1,2]", 5, false, [1]]) {
        expect((await write({ context }))?.status).toBe(400);
      }
      // At the limits is still a write. U+3042 is 3 bytes in UTF-8, so a limit
      // counted in bytes instead of characters would fail here.
      expect((await write({ body: "\u3042".repeat(MAX_BODY_LENGTH) }))?.status).toBe(200);

      const list = (await (await fusen.handle(req("/api/feedback")))!.json()) as {
        feedback: FeedbackItem[];
      };
      expect(list.feedback).toHaveLength(1);
      fusen.hub.closeAll();
    });

    test("unknown anchor keys are dropped, and nesting JSON cannot write back is a 400", async () => {
      // 60,000 levels parse fine and fit the request cap, but overflow the
      // stack in JSON.stringify — so the body is built by hand.
      const deep = `${"[".repeat(60_000)}${"]".repeat(60_000)}`;
      const fusen = serve();
      const post = (raw: string) =>
        fusen.handle(
          req("/api/feedback", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: raw,
          }),
        );

      const withExtra = `{"route":"/","body":"b","context":null,"nonce":"n","anchor":${JSON.stringify(anchor).slice(0, -1)},"z":${deep}}}`;
      expect((await post(withExtra))?.status).toBe(200);
      const deepContext = `{"route":"/","body":"b","nonce":"n","anchor":${JSON.stringify(anchor)},"context":${deep}}`;
      expect((await post(deepContext))?.status).toBe(400);

      const list = await fusen.handle(req("/api/feedback"));
      expect(list?.status).toBe(200);
      const { feedback } = (await list!.json()) as { feedback: FeedbackItem[] };
      expect(feedback).toHaveLength(1);
      expect(feedback[0]!.anchor).toEqual(anchor);
      fusen.hub.closeAll();
    });

    test("DELETE reads its nonce from the JSON body, not the URL", async () => {
      const fusen = serve();
      const created = (await (await fusen.handle(
        req(
          "/api/feedback",
          jsonInit("POST", { route: "/", body: "b", anchor, context: null, nonce: "x" }),
        ),
      ))!.json()) as { feedback: FeedbackItem };
      const stream = (await fusen.handle(req("/api/feedback/events")))!;
      const frames = readFrames(stream, 2);
      await fusen.handle(
        req(`/api/feedback/${created.feedback.id}`, jsonInit("DELETE", { nonce: "from-body" })),
      );
      const seen = await frames;
      expect(seen.find((frame) => frame.type === "deleted")).toMatchObject({ nonce: "from-body" });
      fusen.hub.closeAll();
    });

    test("a body not labelled application/json is a 415 (no CSRF by simple POST)", async () => {
      // text/plain and form posts skip the preflight and carry the cookie.
      const fusen = serve();
      const raw = JSON.stringify({ route: "/", body: "b", anchor, context: null, nonce: "x" });
      for (const type of [
        "text/plain",
        "application/x-www-form-urlencoded",
        "multipart/form-data; boundary=x",
        null,
      ]) {
        const headers: Record<string, string> = type ? { "content-type": type } : {};
        const res = await fusen.handle(
          req("/api/feedback", { method: "POST", headers, body: raw }),
        );
        expect(res?.status).toBe(415);
      }
      const ok = await fusen.handle(
        req("/api/feedback", {
          method: "POST",
          headers: { "content-type": "Application/JSON; charset=utf-8" },
          body: raw,
        }),
      );
      expect(ok?.status).toBe(200);
      const list = (await (await fusen.handle(req("/api/feedback")))!.json()) as {
        feedback: FeedbackItem[];
      };
      expect(list.feedback).toHaveLength(1);
      fusen.hub.closeAll();
    });

    test("a DELETE with no body at all is still accepted", async () => {
      // Some clients and proxies strip it. Losing the nonce costs the echo
      // suppression, not the delete.
      const fusen = serve();
      const created = (await (await fusen.handle(
        req(
          "/api/feedback",
          jsonInit("POST", { route: "/", body: "b", anchor, context: null, nonce: "x" }),
        ),
      ))!.json()) as { feedback: FeedbackItem };
      const res = await fusen.handle(
        req(`/api/feedback/${created.feedback.id}`, { method: "DELETE" }),
      );
      expect(res?.status).toBe(200);
      fusen.hub.closeAll();
    });

    test("a DELETE whose body the host already read is still accepted", async () => {
      const fusen = serve();
      const created = (await (await fusen.handle(
        req(
          "/api/feedback",
          jsonInit("POST", { route: "/", body: "b", anchor, context: null, nonce: "x" }),
        ),
      ))!.json()) as { feedback: FeedbackItem };
      const used = req(`/api/feedback/${created.feedback.id}`, jsonInit("DELETE", { nonce: "d" }));
      await used.text(); // what a framework body parser does before mounting fusen
      expect((await fusen.handle(used))?.status).toBe(200);
      fusen.hub.closeAll();
    });

    test("a body stream that fails part-way refuses a vote or DELETE instead of acting", async () => {
      // An absent body is `{}`; a broken one is not, or the write would go
      // ahead on contents nobody saw.
      const fusen = serve();
      const created = (await (await fusen.handle(
        req(
          "/api/feedback",
          jsonInit("POST", { route: "/", body: "b", anchor, context: null, nonce: "x" }),
        ),
      ))!.json()) as { feedback: FeedbackItem };
      const broken = (method: string): RequestInit =>
        ({
          method,
          headers: { "content-type": "application/json" },
          body: new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode('{"delta":1,'));
              controller.error(new Error("connection reset"));
            },
          }),
          duplex: "half",
        }) as RequestInit;
      const id = created.feedback.id;

      expect((await fusen.handle(req(`/api/feedback/${id}/votes`, broken("POST"))))?.status).toBe(
        400,
      );
      expect((await fusen.handle(req(`/api/feedback/${id}`, broken("DELETE"))))?.status).toBe(400);

      const { feedback } = (await (await fusen.handle(req("/api/feedback")))!.json()) as {
        feedback: FeedbackItem[];
      };
      expect(feedback).toMatchObject([{ id, votes: 0 }]);
      fusen.hub.closeAll();
    });

    test("a nonce longer than MAX_NONCE_LENGTH is refused on every write", async () => {
      // It is echoed to every SSE subscriber, so an uncapped one fans out.
      const fusen = serve();
      const long = "n".repeat(MAX_NONCE_LENGTH + 1);
      const create = (nonce: string) =>
        fusen.handle(
          req(
            "/api/feedback",
            jsonInit("POST", { route: "/", body: "b", anchor, context: null, nonce }),
          ),
        );

      expect((await create(long))?.status).toBe(400);
      const ok = await create("n".repeat(MAX_NONCE_LENGTH));
      expect(ok?.status).toBe(200);
      const { id } = ((await ok!.json()) as { feedback: FeedbackItem }).feedback;
      const votes = await fusen.handle(
        req(`/api/feedback/${id}/votes`, jsonInit("POST", { delta: 1, nonce: long })),
      );
      expect(votes?.status).toBe(400);
      const removed = await fusen.handle(
        req(`/api/feedback/${id}`, jsonInit("DELETE", { nonce: long })),
      );
      expect(removed?.status).toBe(400);

      const { feedback } = (await (await fusen.handle(req("/api/feedback")))!.json()) as {
        feedback: FeedbackItem[];
      };
      expect(feedback).toMatchObject([{ id, votes: 0 }]);
      fusen.hub.closeAll();
    });

    test("a write at every field cap is not refused for its byte size, however it is spelled", async () => {
      // The field caps count characters; the request cap counts bytes. Every
      // character sent as a six-byte `\uXXXX` escape is the worst spelling.
      const escaped = (text: string) =>
        `"${Array.from({ length: text.length }, (_, i) => `\\u${text.charCodeAt(i).toString(16).padStart(4, "0")}`).join("")}"`;
      const fill = (overhead: number, cap: number) => "a".repeat(cap - overhead);
      const anchorAt = { ...anchor, selectorPath: "" };
      const selectorPath = fill(JSON.stringify(anchorAt).length, MAX_ANCHOR_LENGTH);
      const anchorJson = JSON.stringify(anchorAt).replace(
        '"selectorPath":""',
        `"selectorPath":${escaped(selectorPath)}`,
      );
      const contextJson = `{"m":${escaped(fill('{"m":""}'.length, MAX_CONTEXT_LENGTH))}}`;
      const raw = `{"route":${escaped(`/${"a".repeat(MAX_ROUTE_LENGTH - 1)}`)},"body":${escaped(
        "a".repeat(MAX_BODY_LENGTH),
      )},"nonce":${escaped("n".repeat(MAX_NONCE_LENGTH))},"context":${contextJson},"anchor":${anchorJson}}`;

      const fusen = serve();
      const res = await fusen.handle(
        req("/api/feedback", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: raw,
        }),
      );
      expect(res?.status).toBe(200);
      fusen.hub.closeAll();
    });

    test("application-specific fields survive the round trip", async () => {
      // The host's own vocabulary (review status, ticket number…) must ride
      // through untouched — normalizing by rebuilding the row deletes it.
      const store = makeStore();
      const base = await store.create({ route: "/", body: "b", anchor, context: null, author });
      (base as Record<string, unknown>).review_status = "triaged";
      const fusen = createFusenServer({ store });
      const res = await fusen.handle(req("/api/feedback"));
      const { feedback } = (await res!.json()) as { feedback: FeedbackItem[] };
      expect(feedback[0]!.review_status).toBe("triaged");
      fusen.hub.closeAll();
    });

    test("status_changed can be pushed by the application, with no write behind it", async () => {
      const fusen = serve();
      const stream = (await fusen.handle(req("/api/feedback/events")))!;
      const frames = readFrames(stream, 2);
      fusen.hub.publish({ type: "status_changed", id: 1, patch: { review_status: "merged" } });
      const seen = await frames;
      expect(seen.find((frame) => frame.type === "status_changed")).toMatchObject({
        id: 1,
        patch: { review_status: "merged" },
      });
      fusen.hub.closeAll();
    });
  });
}

/**
 * The identity/permission seam (S6): the two implementations that must both
 * satisfy the same contract are "anonymous by default" and "a real signed-in
 * author", and the check that matters is that permission is decided on the
 * SERVER against the STORED row.
 */
export function runAuthContract(name: string, makeStore: () => FeedbackStore): void {
  describe(`auth contract: ${name}`, () => {
    test("with no configuration at all, writes are accepted anonymously", async () => {
      const fusen = createFusenServer({ store: makeStore() });
      const res = await fusen.handle(
        req(
          "/api/feedback",
          jsonInit("POST", { route: "/", body: "b", anchor, context: null, nonce: "n" }),
        ),
      );
      expect(res?.status).toBe(200);
      fusen.hub.closeAll();
    });

    test("resolveAuthor returning null rejects the write with 401", async () => {
      const fusen = createFusenServer({ store: makeStore(), resolveAuthor: () => null });
      const res = await fusen.handle(
        req(
          "/api/feedback",
          jsonInit("POST", { route: "/", body: "b", anchor, context: null, nonce: "n" }),
        ),
      );
      expect(res?.status).toBe(401);
      fusen.hub.closeAll();
    });

    test("by default an author may delete only their own comment", async () => {
      const store = makeStore();
      const mine = createFusenServer({ store, resolveAuthor: () => author });
      const created = (await (await mine.handle(
        req(
          "/api/feedback",
          jsonInit("POST", { route: "/", body: "b", anchor, context: null, nonce: "n" }),
        ),
      ))!.json()) as { feedback: FeedbackItem };

      const someoneElse = createFusenServer({
        store,
        resolveAuthor: () => ({ name: "Someone else", key: "other", picture: null }),
      });
      const refused = await someoneElse.handle(
        req(`/api/feedback/${created.feedback.id}`, jsonInit("DELETE", { nonce: "n" })),
      );
      expect(refused?.status).toBe(403);

      const allowed = await mine.handle(
        req(`/api/feedback/${created.feedback.id}`, jsonInit("DELETE", { nonce: "n" })),
      );
      expect(allowed?.status).toBe(200);
      mine.hub.closeAll();
      someoneElse.hub.closeAll();
    });

    test("a listed author_key, sent back as the cookie, cannot delete the row", async () => {
      // The list is public. If the key it shows were the cookie value, one GET
      // and one forged cookie would delete anyone's comment.
      const fusen = createFusenServer({ store: makeStore() });
      const created = await fusen.handle(
        req(
          "/api/feedback",
          jsonInit("POST", { route: "/", body: "b", anchor, context: null, nonce: "n" }),
        ),
      );
      const cookie = created!.headers.get("set-cookie")!.split(";")[0]!;
      const cookieName = cookie.slice(0, cookie.indexOf("="));
      const { feedback } = (await (await fusen.handle(req("/api/feedback")))!.json()) as {
        feedback: FeedbackItem[];
      };
      const listed = feedback[0]!;

      const forged = await fusen.handle(
        req(`/api/feedback/${listed.id}`, {
          method: "DELETE",
          headers: {
            "content-type": "application/json",
            cookie: `${cookieName}=${listed.author_key}`,
          },
          body: JSON.stringify({ nonce: "n" }),
        }),
      );
      expect(forged?.status).toBe(403);

      // The real cookie still can, so the 403 above is about the key, not a
      // delete that never works.
      const own = await fusen.handle(
        req(`/api/feedback/${listed.id}`, {
          method: "DELETE",
          headers: { "content-type": "application/json", cookie },
          body: JSON.stringify({ nonce: "n" }),
        }),
      );
      expect(own?.status).toBe(200);
      fusen.hub.closeAll();
    });

    test("a cookie whose value an old row published is replaced, not honoured", async () => {
      // Before keys were hashed, a row's author_key WAS its author's cookie.
      // That browser may still send it, and anyone can read it from the list.
      const store = makeStore();
      const leaked = "0123456789abcdef0123456789abcdef";
      await store.create({
        route: "/",
        body: "old",
        anchor,
        context: null,
        author: { name: "Guest-0123", key: leaked, picture: null },
      });
      const fusen = createFusenServer({ store });
      const res = await fusen.handle(
        req("/api/feedback", {
          ...jsonInit("POST", { route: "/", body: "b", anchor, context: null, nonce: "n" }),
          headers: { "content-type": "application/json", cookie: `fusen_author=${leaked}` },
        }),
      );
      const { feedback } = (await res!.json()) as { feedback: FeedbackItem };
      expect(res!.headers.get("set-cookie")).not.toBeNull();
      expect(feedback.author_key).not.toBe(leaked);
      expect(feedback.author_key).not.toBe(await publicKeyFor(leaked));
      fusen.hub.closeAll();
    });

    test("canDelete overrides the default, and is asked about the stored row", async () => {
      const store = makeStore();
      const seen: FeedbackItem[] = [];
      const fusen = createFusenServer({
        store,
        resolveAuthor: () => ({ name: "moderator", key: "mod", picture: null }),
        canDelete: (item) => {
          seen.push(item);
          return true; // a moderator may remove anyone's
        },
      });
      const created = (await (await fusen.handle(
        req(
          "/api/feedback",
          jsonInit("POST", { route: "/", body: "b", anchor, context: null, nonce: "n" }),
        ),
      ))!.json()) as { feedback: FeedbackItem };
      const res = await fusen.handle(
        req(`/api/feedback/${created.feedback.id}`, jsonInit("DELETE", { nonce: "n" })),
      );
      expect(res?.status).toBe(200);
      expect(seen[0]?.id).toBe(created.feedback.id);
      fusen.hub.closeAll();
    });
  });
}
