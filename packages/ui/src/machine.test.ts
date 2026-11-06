import { createActor } from "xstate";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { Anchor, FeedbackItem } from "./types.ts";
import { configureFusenWidget } from "./runtime.ts";

const sampleAnchor: Anchor = {
  version: 1,
  route: "/watch/1",
  selectorPath: "main > .player",
  fingerprint: { tag: "div", dataAttrs: {}, classList: ["player"], textSnippet: "" },
  rectRatio: { x: 0.5, y: 0.5 },
};

function item(overrides: Partial<FeedbackItem>): FeedbackItem {
  return {
    id: 1,
    route: "/watch/1",
    body: "The volume is too low",
    anchor: sampleAnchor,
    author_name: "Taro",
    author_picture: null,
    author_key: "k-taro",
    context: null,
    votes: 0,
    // Application-specific extras a real server also returns; the widget's own
    // type does not model them and does not need to.
    feedback_status: "open",
    pr_number: null,
    decompose_requested_at: null,
    decompose_state: null,
    has_todos: false,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

// The submitting state's actor calls store.submitFeedback, which goes through
// the configured FeedbackHttp. This suite deliberately exercises the DEFAULT
// fetch-based implementation — so the shipped zero-config path is covered too —
// by mocking the one true global rather than injecting a fake. The
// configureFusenWidget() in beforeEach resets the runtime to its defaults so
// this suite is unaffected by whatever store.test.ts configured, in either file
// execution order.
let addFeedbackImpl = mock(async (route: string, body: string, anchor: Anchor, _nonce: string) =>
  item({ id: 1, route, body, anchor }),
);

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const path = typeof input === "string" ? input : input.toString();
  if (path === "/api/feedback" && init?.method === "POST") {
    const parsed = JSON.parse(String(init.body)) as {
      route: string;
      body: string;
      anchor: Anchor;
      nonce: string;
    };
    try {
      const feedback = await addFeedbackImpl(
        parsed.route,
        parsed.body,
        parsed.anchor,
        parsed.nonce,
      );
      return new Response(JSON.stringify({ feedback }), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    } catch {
      return new Response("submit failed", { status: 500 });
    }
  }
  return new Response("not found", { status: 404 });
}) as typeof fetch;

const { feedbackMachine } = await import("./machine.ts");

beforeEach(() => {
  configureFusenWidget();
});

function stateStr(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 1) {
      const [k, v] = entries[0]!;
      const child = stateStr(v);
      return child ? `${k}.${child}` : k;
    }
  }
  return String(value);
}

describe("feedbackMachine transitions", () => {
  test("starts in idle", () => {
    const actor = createActor(feedbackMachine);
    actor.start();
    expect(stateStr(actor.getSnapshot().value)).toBe("idle");
    actor.stop();
  });

  test("idle --TOGGLE--> mode.picking", () => {
    const actor = createActor(feedbackMachine);
    actor.start();
    actor.send({ type: "TOGGLE" });
    expect(stateStr(actor.getSnapshot().value)).toBe("mode.picking");
    actor.stop();
  });

  test("mode.picking --TOGGLE--> idle (badge closes widget)", () => {
    const actor = createActor(feedbackMachine);
    actor.start();
    actor.send({ type: "TOGGLE" });
    actor.send({ type: "TOGGLE" });
    expect(stateStr(actor.getSnapshot().value)).toBe("idle");
    actor.stop();
  });

  test("mode.picking --PICK--> mode.composing, assigns anchor/point", () => {
    const actor = createActor(feedbackMachine);
    actor.start();
    actor.send({ type: "TOGGLE" });
    actor.send({ type: "PICK", anchor: sampleAnchor, point: { x: 10, y: 20 } });
    const snap = actor.getSnapshot();
    expect(stateStr(snap.value)).toBe("mode.composing");
    expect(snap.context.anchor).toEqual(sampleAnchor);
    expect(snap.context.point).toEqual({ x: 10, y: 20 });
    actor.stop();
  });

  test("mode.composing --CANCEL--> mode.picking, clears pending", () => {
    const actor = createActor(feedbackMachine);
    actor.start();
    actor.send({ type: "TOGGLE" });
    actor.send({ type: "PICK", anchor: sampleAnchor, point: { x: 0, y: 0 } });
    actor.send({ type: "CANCEL" });
    const snap = actor.getSnapshot();
    expect(stateStr(snap.value)).toBe("mode.picking");
    expect(snap.context.anchor).toBeNull();
    actor.stop();
  });

  test("mode.composing --SUBMIT--> mode.submitting --success--> idle (closes the mode)", async () => {
    addFeedbackImpl = mock(async (route: string, body: string, anchor: Anchor) =>
      item({ id: 2, route, body, anchor }),
    );
    const actor = createActor(feedbackMachine);
    actor.start();
    actor.send({ type: "TOGGLE" });
    actor.send({ type: "PICK", anchor: sampleAnchor, point: { x: 0, y: 0 } });
    actor.send({ type: "SUBMIT", body: "The volume is too low" });
    expect(stateStr(actor.getSnapshot().value)).toBe("mode.submitting");
    await Bun.sleep(10);
    const snap = actor.getSnapshot();
    expect(stateStr(snap.value)).toBe("idle");
    expect(snap.context.pendingBody).toBe("");
    expect(snap.context.anchor).toBeNull();
    actor.stop();
  });

  test("mode.submitting --failure--> mode.error --RETRY--> mode.submitting --success--> idle", async () => {
    let calls = 0;
    addFeedbackImpl = mock(async (route: string, body: string, anchor: Anchor) => {
      calls++;
      if (calls === 1) throw new Error("network");
      return item({ id: 3, route, body, anchor });
    });
    const actor = createActor(feedbackMachine);
    actor.start();
    actor.send({ type: "TOGGLE" });
    actor.send({ type: "PICK", anchor: sampleAnchor, point: { x: 0, y: 0 } });
    actor.send({ type: "SUBMIT", body: "The volume is too low" });
    await Bun.sleep(10);
    expect(stateStr(actor.getSnapshot().value)).toBe("mode.error");

    actor.send({ type: "RETRY" });
    expect(stateStr(actor.getSnapshot().value)).toBe("mode.submitting");
    await Bun.sleep(10);
    expect(stateStr(actor.getSnapshot().value)).toBe("idle");
    actor.stop();
  });

  test("mode.error --CANCEL--> mode.picking", async () => {
    addFeedbackImpl = mock(async () => {
      throw new Error("network");
    });
    const actor = createActor(feedbackMachine);
    actor.start();
    actor.send({ type: "TOGGLE" });
    actor.send({ type: "PICK", anchor: sampleAnchor, point: { x: 0, y: 0 } });
    actor.send({ type: "SUBMIT", body: "x" });
    await Bun.sleep(10);
    expect(stateStr(actor.getSnapshot().value)).toBe("mode.error");
    actor.send({ type: "CANCEL" });
    expect(stateStr(actor.getSnapshot().value)).toBe("mode.picking");
    actor.stop();
  });

  test("mode.error --TOGGLE--> idle (badge can always close)", async () => {
    addFeedbackImpl = mock(async () => {
      throw new Error("network");
    });
    const actor = createActor(feedbackMachine);
    actor.start();
    actor.send({ type: "TOGGLE" });
    actor.send({ type: "PICK", anchor: sampleAnchor, point: { x: 0, y: 0 } });
    actor.send({ type: "SUBMIT", body: "x" });
    await Bun.sleep(10);
    expect(stateStr(actor.getSnapshot().value)).toBe("mode.error");
    actor.send({ type: "TOGGLE" });
    expect(stateStr(actor.getSnapshot().value)).toBe("idle");
    actor.stop();
  });
});

describe("the sent event", () => {
  /** A started actor already in mode.submitting, and the number of `sent` it emitted. */
  function submitted() {
    const actor = createActor(feedbackMachine);
    const seen = { n: 0 };
    actor.on("sent", () => void seen.n++);
    actor.start();
    actor.send({ type: "TOGGLE" });
    actor.send({ type: "PICK", anchor: sampleAnchor, point: { x: 0, y: 0 } });
    actor.send({ type: "SUBMIT", body: "x" });
    return { actor, seen };
  }

  test("is emitted once when the server accepts the comment", async () => {
    addFeedbackImpl = mock(async (route: string, body: string, anchor: Anchor) =>
      item({ id: 3, route, body, anchor }),
    );
    const { actor, seen } = submitted();
    await Bun.sleep(10);
    expect(stateStr(actor.getSnapshot().value)).toBe("idle");
    expect(seen.n).toBe(1);
    actor.stop();
  });

  test("is not emitted when a badge tap abandons the submit, even if the server answers later", async () => {
    let accept!: () => void;
    addFeedbackImpl = mock(
      (route: string, body: string, anchor: Anchor) =>
        new Promise<FeedbackItem>((resolve) => {
          accept = () => resolve(item({ id: 4, route, body, anchor }));
        }),
    );
    const { actor, seen } = submitted();
    actor.send({ type: "TOGGLE" });
    expect(stateStr(actor.getSnapshot().value)).toBe("idle");
    accept();
    await Bun.sleep(10);
    expect(seen.n).toBe(0);
    actor.stop();
  });

  test("is not emitted when the submit fails", async () => {
    addFeedbackImpl = mock(async () => {
      throw new Error("network");
    });
    const { actor, seen } = submitted();
    await Bun.sleep(10);
    expect(stateStr(actor.getSnapshot().value)).toBe("mode.error");
    expect(seen.n).toBe(0);
    actor.stop();
  });
});
