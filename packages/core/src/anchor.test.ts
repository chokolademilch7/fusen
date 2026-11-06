import { describe, expect, test } from "bun:test";
import {
  captureAnchor,
  createAnchorEngine,
  DEFAULT_VOLATILE_DATA_KEYS,
  describeAnchor,
  resolveAnchor,
  scoreCandidate,
} from "./anchor.ts";

// ---------------------------------------------------------------------------
// Minimal DOM-shaped fixtures.
//
// anchor.ts never calls the browser's native querySelector/querySelectorAll —
// resolution is hand-walked against tagName/id/className/attributes/children/
// parentElement/textContent/getBoundingClientRect, the same handful of
// standard Element properties a real browser provides. FakeElement implements
// exactly that surface so these tests exercise the real production code path
// without pulling in a DOM library (repo constraint: no new dependencies).
// ---------------------------------------------------------------------------

interface Attr {
  name: string;
  value: string;
}

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

class FakeElement {
  tagName: string;
  id = "";
  className = "";
  attributes: Attr[] = [];
  children: FakeElement[] = [];
  parentElement: FakeElement | null = null;
  ownText = "";
  rect: Rect = { left: 0, top: 0, width: 100, height: 20 };

  constructor(tag: string) {
    this.tagName = tag.toUpperCase();
  }

  get textContent(): string {
    return [this.ownText, ...this.children.map((c) => c.textContent)].filter(Boolean).join(" ");
  }

  getAttribute(name: string): string | null {
    // Mirrors the real DOM: class is read from className, which the tests
    // mutate directly.
    if (name === "class") return this.className || null;
    return this.attributes.find((a) => a.name === name)?.value ?? null;
  }

  getBoundingClientRect(): DOMRect {
    return {
      ...this.rect,
      right: this.rect.left + this.rect.width,
      bottom: this.rect.top + this.rect.height,
      x: this.rect.left,
      y: this.rect.top,
      toJSON: () => ({}),
    } as DOMRect;
  }

  append(...kids: FakeElement[]): this {
    for (const k of kids) {
      k.parentElement = this;
      this.children.push(k);
    }
    return this;
  }
}

function el(
  tag: string,
  opts: {
    id?: string;
    class?: string;
    data?: Record<string, string>;
    text?: string;
    rect?: Partial<Rect>;
  } = {},
): FakeElement {
  const e = new FakeElement(tag);
  if (opts.id) {
    e.id = opts.id;
    e.attributes.push({ name: "id", value: opts.id });
  }
  if (opts.class) {
    e.className = opts.class;
    e.attributes.push({ name: "class", value: opts.class });
  }
  if (opts.data) {
    for (const [k, v] of Object.entries(opts.data)) {
      e.attributes.push({ name: `data-${k}`, value: v });
    }
  }
  if (opts.text) e.ownText = opts.text;
  if (opts.rect) e.rect = { ...e.rect, ...opts.rect };
  return e;
}

// Cast helper — FakeElement is structurally compatible with the subset of
// Element that anchor.ts touches, but not with the full DOM lib type.
const asEl = (e: FakeElement) => e as unknown as Element;

// ---------------------------------------------------------------------------
// Fixture: Watch page — player (data-machine="player", data-state volatile)
// nested inside a page layout.
// ---------------------------------------------------------------------------

function buildWatchDom() {
  const playIcon = el("span", { class: "ms msf", text: "pause" });
  const timeLabel = el("span", { class: "time", text: "0:12 / 1:23" });
  const playBtn = el("button", { class: "ctl" }).append(playIcon);
  const buttons = el("div", { class: "buttons" }).append(playBtn, timeLabel);
  const controls = el("div", { class: "controls" }).append(buttons);
  const video = el("video");
  const player = el("div", {
    class: "player",
    data: { machine: "player", state: "playing.unmuted" },
  }).append(video, controls);
  const playerWrap = el("div", { class: "player-wrap" }).append(player);

  const likePill = el("button", {
    class: "pill liked",
    data: { machine: "like", state: "idle" },
    text: "128",
  });
  const downloadPill = el("a", { class: "pill" });
  const pills = el("div", { class: "action-pills" }).append(likePill, downloadPill);
  const row = el("div", { class: "watch-row" }).append(pills);

  const commentInput = el("input", { class: "comment-input" });
  const inputRow = el("div", { class: "comment-input-row" }).append(commentInput);
  const formFields = el("div", { class: "comment-form-fields" }).append(inputRow);
  const form = el("form", { class: "comment-form" }).append(formFields);
  const comments = el("section", {
    class: "comments",
    data: { machine: "comments", state: "ready" },
  }).append(form);

  // A sidebar list item: upnext-meta wraps both upnext-title AND
  // upnext-sub, so the title's own text never collides with its wrapper's
  // aggregated textContent.
  const upnextTitle = el("span", { class: "upnext-title", text: "June 2024" });
  const upnextSub = el("span", { class: "upnext-sub", text: "4:32" });
  const upnextMeta = el("span", { class: "upnext-meta" }).append(upnextTitle, upnextSub);
  const sideItem1 = el("button", { class: "upnext-item" }).append(upnextMeta);
  const sideItem2 = el("button", { class: "upnext-item" }).append(
    el("span", { class: "upnext-meta" }).append(
      el("span", { class: "upnext-title", text: "May 2024" }),
      el("span", { class: "upnext-sub", text: "1:05" }),
    ),
  );
  const upnext = el("aside", { class: "upnext" }).append(sideItem1, sideItem2);

  const primary = el("div", { class: "watch-primary" }).append(playerWrap, row, comments);
  const grid = el("div", { class: "watch-grid" }).append(primary, upnext);
  const watch = el("div", { class: "watch" }).append(grid);
  const root = el("div", { class: "app-root" }).append(watch);

  return { root, player, likePill, commentInput, upnextTitle, upnext, video, comments };
}

describe("captureAnchor", () => {
  test("SVG element: className is an SVGAnimatedString, classes come from the class attribute", () => {
    const { likePill } = buildWatchDom();
    const icon = el("svg", { class: "icon like-icon" });
    likePill.append(icon);
    // Real SVG elements expose className as { baseVal, animVal }, not a string.
    (icon as unknown as { className: unknown }).className = {
      baseVal: "icon like-icon",
      animVal: "icon like-icon",
    };
    icon.getAttribute = (name: string) => (name === "class" ? "icon like-icon" : null);

    const anchor = captureAnchor(asEl(icon), { x: 0, y: 0 }, "/watch/v1");
    expect(anchor.fingerprint.classList).toEqual(["icon", "like-icon"]);
  });

  test("element with data-machine: selectorPath is a single stable segment", () => {
    const { likePill } = buildWatchDom();
    likePill.rect = { left: 100, top: 200, width: 80, height: 40 };
    const anchor = captureAnchor(asEl(likePill), { x: 140, y: 220 }, "/watch/v1");

    expect(anchor.version).toBe(1);
    expect(anchor.route).toBe("/watch/v1");
    expect(anchor.selectorPath).toBe('button[data-machine="like"]');
    expect(anchor.fingerprint.tag).toBe("button");
    expect(anchor.fingerprint.dataAttrs).toEqual({ machine: "like" });
    // data-state must never leak into the fingerprint (volatile)
    expect(anchor.fingerprint.dataAttrs.state).toBeUndefined();
    expect(anchor.fingerprint.classList).toEqual(["pill", "liked"]);
    expect(anchor.fingerprint.textSnippet).toBe("128");
    expect(anchor.rectRatio.x).toBeCloseTo(0.5, 5);
    expect(anchor.rectRatio.y).toBeCloseTo(0.5, 5);
  });

  test("a payload-sized data-* value is neither identity nor part of the selector", () => {
    const { likePill } = buildWatchDom();
    likePill.attributes.push({
      name: "data-series-value",
      value: JSON.stringify(Array.from({ length: 1500 }, (_, i) => [i, 2 * i])),
    });
    const anchor = captureAnchor(asEl(likePill), { x: 0, y: 0 }, "/watch/v1");

    expect(anchor.fingerprint.dataAttrs).toEqual({ machine: "like" });
    expect(anchor.selectorPath).toBe('button[data-machine="like"]');
    expect(JSON.stringify(anchor).length).toBeLessThan(1_000);
  });

  test("plain styled div with no id/data-attr: climbs to nearest stable ancestor", () => {
    const { commentInput } = buildWatchDom();
    const anchor = captureAnchor(asEl(commentInput), { x: 0, y: 0 }, "/watch/v1");

    expect(anchor.fingerprint.tag).toBe("input");
    expect(anchor.fingerprint.dataAttrs).toEqual({});
    expect(anchor.fingerprint.classList).toEqual(["comment-input"]);
    // Path climbs form > form-fields > input-row > input until it hits the
    // data-machine="comments" ancestor, which stops the climb.
    expect(anchor.selectorPath).toBe(
      'section[data-machine="comments"] > form.comment-form > div.comment-form-fields > div.comment-input-row > input.comment-input',
    );
  });

  test("rectRatio clamps to [0,1] for taps outside the element bounds", () => {
    const { likePill } = buildWatchDom();
    likePill.rect = { left: 100, top: 200, width: 80, height: 40 };
    const anchor = captureAnchor(asEl(likePill), { x: -50, y: 9999 }, "/watch/v1");
    expect(anchor.rectRatio.x).toBe(0);
    expect(anchor.rectRatio.y).toBe(1);
  });
});

describe("resolveAnchor", () => {
  test("resolves after unrelated DOM mutations elsewhere in the tree", () => {
    const dom = buildWatchDom();
    const anchor = captureAnchor(asEl(dom.likePill), { x: 0, y: 0 }, "/watch/v1");

    // Unrelated mutation: remove an up-next item, tweak an unrelated attr.
    dom.upnext.children.pop();
    dom.video.attributes.push({ name: "muted", value: "" });

    const resolved = resolveAnchor(anchor, asEl(dom.root));
    expect(resolved).toBe(asEl(dom.likePill));
  });

  test("volatile data-state changed between capture and resolve still resolves", () => {
    const dom = buildWatchDom();
    const anchor = captureAnchor(asEl(dom.player), { x: 0, y: 0 }, "/watch/v1");

    // Simulate the player machine cycling states + controls hiding (class swap).
    const stateAttr = dom.player.attributes.find((a) => a.name === "data-state")!;
    stateAttr.value = "ended";
    dom.player.className = "player hide-controls";

    const resolved = resolveAnchor(anchor, asEl(dom.root));
    expect(resolved).toBe(asEl(dom.player));
  });

  test("resolves via fuzzy tag-scan when classes changed but text/tag/data survive", () => {
    const dom = buildWatchDom();
    const anchor = captureAnchor(asEl(dom.upnextTitle), { x: 0, y: 0 }, "/watch/v1");

    // Redesign renames the class — selectorPath's class segment no longer
    // matches, forcing the same-tag scoring fallback to find it by text.
    dom.upnextTitle.className = "upnext-title-v2";

    const resolved = resolveAnchor(anchor, asEl(dom.root));
    expect(resolved).toBe(asEl(dom.upnextTitle));
  });

  test("element removed from the DOM resolves to null", () => {
    const dom = buildWatchDom();
    const anchor = captureAnchor(asEl(dom.likePill), { x: 0, y: 0 }, "/watch/v1");

    const parent = dom.likePill.parentElement!;
    parent.children = parent.children.filter((c) => c !== dom.likePill);

    const resolved = resolveAnchor(anchor, asEl(dom.root));
    expect(resolved).toBeNull();
  });

  test("no plausible candidate (different tag entirely) resolves to null", () => {
    const dom = buildWatchDom();
    const anchor = captureAnchor(asEl(dom.likePill), { x: 0, y: 0 }, "/watch/v1");

    const barren = el("div", { class: "empty" });
    const resolved = resolveAnchor(anchor, asEl(barren));
    expect(resolved).toBeNull();
  });

  test("a textless element gets no text credit and is not mistaken for the target", () => {
    // "" is a substring of every snippet; counting that as a partial text match
    // lifted this half-matching icon to exactly the threshold.
    const target = el("span", { class: "x y", text: "Delete" });
    const icon = el("span", { class: "x" });
    const root = el("div", { id: "root" }).append(target, icon);
    const anchor = captureAnchor(asEl(target), { x: 0, y: 0 }, "/watch/v1");
    root.children.splice(root.children.indexOf(target), 1);

    expect(scoreCandidate(asEl(icon), anchor.fingerprint)).toBeCloseTo(0.075 / 0.4, 5);
    expect(resolveAnchor(anchor, asEl(root))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Utility-framework class names in the selector path.
//
// Tailwind (and every other utility framework) emits class tokens containing
// `:` and `.` — `md:flex`, `w-1.5`, `hover:bg-red-500`. Those characters are
// the selector grammar's OWN punctuation, so a path that writes them raw is
// unparseable on the way back in. The failure is silent: the segment falls
// back to a tag-only guess that matches nothing, tier 1 is disabled, and
// resolution quietly degrades to the fingerprint scan — which cannot tell two
// identical siblings apart and always answers with the first one.
// ---------------------------------------------------------------------------

/** Two indistinguishable siblings under an id'd parent: only the path's
 *  `:nth-of-type` discriminator can tell the second from the first. */
function buildTwinSiblings(className: string) {
  const first = el("span", { class: className, text: "Save" });
  const second = el("span", { class: className, text: "Save" });
  const root = el("div", { id: "root" }).append(first, second);
  return { root, first, second };
}

describe("selectorPath with utility-framework class names", () => {
  test("plain classes: the second of two twins resolves to the second", () => {
    // The control case for the test below — same shape, no `:` in the class.
    const { root, second } = buildTwinSiblings("flex btn");
    const anchor = captureAnchor(asEl(second), { x: 0, y: 0 }, "/");

    expect(anchor.selectorPath).toBe("#root > span.flex.btn:nth-of-type(2)");
    expect(resolveAnchor(anchor, asEl(root))).toBe(asEl(second));
  });

  test("`md:flex`: the second of two twins resolves to the second, not the first", () => {
    const { root, first, second } = buildTwinSiblings("md:flex btn");
    const anchor = captureAnchor(asEl(second), { x: 0, y: 0 }, "/");

    // `:` is escaped on the way out so the token stays one token, and the
    // trailing `:nth-of-type(2)` stays distinguishable from it.
    expect(anchor.selectorPath).toBe("#root > span.md\\:flex.btn:nth-of-type(2)");

    const resolved = resolveAnchor(anchor, asEl(root));
    expect(resolved).toBe(asEl(second));
    expect(resolved).not.toBe(asEl(first));
  });

  test("`w-1.5`: a dot inside a class token does not split it in two", () => {
    const { root, second } = buildTwinSiblings("w-1.5 btn");
    const anchor = captureAnchor(asEl(second), { x: 0, y: 0 }, "/");

    expect(anchor.selectorPath).toBe("#root > span.w-1\\.5.btn:nth-of-type(2)");
    expect(resolveAnchor(anchor, asEl(root))).toBe(asEl(second));
  });

  test("an already-stored UNESCAPED path still resolves (no migration needed)", () => {
    // Anchors written before the escape existed are on disk in this shape.
    // The reader has to keep accepting them, or every stored anchor for a
    // utility-class element loses its path tier at once.
    const { root, second } = buildTwinSiblings("md:flex btn");
    const anchor = captureAnchor(asEl(second), { x: 0, y: 0 }, "/");
    const legacy = { ...anchor, selectorPath: "#root > span.md:flex.btn:nth-of-type(2)" };

    expect(resolveAnchor(legacy, asEl(root))).toBe(asEl(second));
  });
});

describe("scoreCandidate", () => {
  test("identical fingerprint scores 1.0", () => {
    const dom = buildWatchDom();
    const anchor = captureAnchor(asEl(dom.likePill), { x: 0, y: 0 }, "/watch/v1");
    expect(scoreCandidate(asEl(dom.likePill), anchor.fingerprint)).toBeCloseTo(1, 5);
  });

  test("a fingerprint stored with a payload-sized data-* value still scores 1.0", () => {
    // Captured before such values were left out of the fingerprint.
    const dom = buildWatchDom();
    const series = JSON.stringify(Array.from({ length: 100 }, (_, i) => [i, 2 * i]));
    dom.likePill.attributes.push({ name: "data-series-value", value: series });
    const anchor = captureAnchor(asEl(dom.likePill), { x: 0, y: 0 }, "/watch/v1");
    const legacy = {
      ...anchor.fingerprint,
      dataAttrs: { ...anchor.fingerprint.dataAttrs, "series-value": series },
    };
    expect(scoreCandidate(asEl(dom.likePill), legacy)).toBeCloseTo(1, 5);
  });

  test("mismatched tag scores 0", () => {
    const dom = buildWatchDom();
    const anchor = captureAnchor(asEl(dom.likePill), { x: 0, y: 0 }, "/watch/v1");
    const div = el("div", { class: "pill liked" });
    expect(scoreCandidate(asEl(div), anchor.fingerprint)).toBe(0);
  });
});

describe("describeAnchor", () => {
  test("prefers the text snippet when present", () => {
    const dom = buildWatchDom();
    const anchor = captureAnchor(asEl(dom.likePill), { x: 0, y: 0 }, "/watch/v1");
    expect(describeAnchor(anchor)).toBe("128");
  });

  test("falls back to tag + data attr when there is no text", () => {
    const dom = buildWatchDom();
    const anchor = captureAnchor(asEl(dom.video), { x: 0, y: 0 }, "/watch/v1");
    expect(describeAnchor(anchor)).toBe("video");
  });

  test("falls back to tag + data attr for the player (has data-machine, no own text)", () => {
    // player's textContent aggregates descendant text (time label etc.), so
    // pick a fixture element whose own+descendant text really is empty.
    const empty = el("div", { data: { machine: "widget" } });
    const anchor = captureAnchor(asEl(empty), { x: 0, y: 0 }, "/watch/v1");
    expect(describeAnchor(anchor)).toBe('div[data-machine="widget"]');
  });
});

// ---------------------------------------------------------------------------
// Configurable volatile-attribute list (createAnchorEngine).
//
// The list is bound once per engine, so the capture side and the score side
// physically cannot disagree — the tests below assert both halves shift
// together, and that the no-argument path is byte-identical to today.
// ---------------------------------------------------------------------------

describe("createAnchorEngine — volatileDataKeys", () => {
  test("default list is ['state'] and the default engine matches the module-level API", () => {
    expect([...DEFAULT_VOLATILE_DATA_KEYS]).toEqual(["state"]);

    const a = buildWatchDom();
    const b = buildWatchDom();
    const c = buildWatchDom();

    const viaModule = captureAnchor(asEl(a.likePill), { x: 10, y: 5 }, "/watch/v1");
    const viaDefaultEngine = createAnchorEngine().captureAnchor(
      asEl(b.likePill),
      { x: 10, y: 5 },
      "/watch/v1",
    );
    const viaExplicitDefault = createAnchorEngine({
      volatileDataKeys: ["state"],
    }).captureAnchor(asEl(c.likePill), { x: 10, y: 5 }, "/watch/v1");

    expect(viaDefaultEngine).toEqual(viaModule);
    expect(viaExplicitDefault).toEqual(viaModule);
  });

  test("a non-default list changes which attribute is treated as volatile", () => {
    const { likePill } = buildWatchDom();
    // Invert today's choice: ignore data-machine, keep data-state.
    const engine = createAnchorEngine({ volatileDataKeys: ["machine"] });
    const anchor = engine.captureAnchor(asEl(likePill), { x: 0, y: 0 }, "/watch/v1");

    expect(anchor.fingerprint.dataAttrs).toEqual({ state: "idle" });
    expect(anchor.fingerprint.dataAttrs.machine).toBeUndefined();
    // The selector path is built from the same list, so it now keys on state.
    expect(anchor.selectorPath).toBe('button[data-state="idle"]');
  });

  test("the score side honours the same list as the capture side", () => {
    const dom = buildWatchDom();
    const engine = createAnchorEngine({ volatileDataKeys: ["machine"] });
    const anchor = engine.captureAnchor(asEl(dom.likePill), { x: 0, y: 0 }, "/watch/v1");

    // Same engine: data-state is a real signal on both sides -> perfect match.
    expect(engine.scoreCandidate(asEl(dom.likePill), anchor.fingerprint)).toBeCloseTo(1, 5);

    // Default engine scoring the same fingerprint strips data-state from the
    // live element, so the data category cannot match at all. This is exactly
    // the silent-mismatch failure the per-engine binding prevents.
    expect(scoreCandidate(asEl(dom.likePill), anchor.fingerprint)).toBeLessThan(1);

    // ...and the engine that captured it still resolves the element.
    expect(engine.resolveAnchor(anchor, asEl(dom.root))).toBe(asEl(dom.likePill));
  });

  test("an empty list keeps every data-* attribute, including volatile ones", () => {
    const { likePill } = buildWatchDom();
    const engine = createAnchorEngine({ volatileDataKeys: [] });
    const anchor = engine.captureAnchor(asEl(likePill), { x: 0, y: 0 }, "/watch/v1");

    expect(anchor.fingerprint.dataAttrs).toEqual({ machine: "like", state: "idle" });
  });

  test("two engines with different lists do not interfere with each other", () => {
    const strict = createAnchorEngine({ volatileDataKeys: ["machine", "state"] });
    const dflt = createAnchorEngine();

    const a = buildWatchDom();
    const b = buildWatchDom();
    const strictAnchor = strict.captureAnchor(asEl(a.likePill), { x: 0, y: 0 }, "/watch/v1");
    const dfltAnchor = dflt.captureAnchor(asEl(b.likePill), { x: 0, y: 0 }, "/watch/v1");

    expect(strictAnchor.fingerprint.dataAttrs).toEqual({});
    expect(dfltAnchor.fingerprint.dataAttrs).toEqual({ machine: "like" });

    // Both still resolve their own element in their own tree.
    expect(strict.resolveAnchor(strictAnchor, asEl(a.root))).toBe(asEl(a.likePill));
    expect(dflt.resolveAnchor(dfltAnchor, asEl(b.root))).toBe(asEl(b.likePill));
  });

  test("passing no argument at all is unchanged for the full resolve path", () => {
    const dom = buildWatchDom();
    const anchor = captureAnchor(asEl(dom.player), { x: 0, y: 0 }, "/watch/v1");
    expect(anchor.selectorPath).toBe('div[data-machine="player"]');
    expect(anchor.fingerprint.dataAttrs).toEqual({ machine: "player" });
    expect(resolveAnchor(anchor, asEl(dom.root))).toBe(asEl(dom.player));
  });
});
