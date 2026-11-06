/**
 * Minimal DOM-shaped fixtures, shared by the parity gate.
 *
 * Deliberately a verbatim port of the FakeElement pattern already established
 * in the original app's anchor tests. Neither anchor engine ever
 * calls the browser's native querySelector/querySelectorAll — resolution is
 * hand-walked against tagName/id/className/attributes/children/parentElement/
 * textContent/getBoundingClientRect, the same handful of standard Element
 * properties a real browser provides. This implements exactly that surface, so
 * the tests exercise the real production code path without a DOM library
 * (repo constraint: no new dependencies, and there is no jsdom/happy-dom here).
 *
 * NOTE on textContent: children are rejoined with a SPACE, whereas a real DOM
 * concatenates with no separator. That quirk is parity-neutral for this gate —
 * both engines read the same fixture object, so any text score it produces is
 * produced identically on both sides. It would only matter for a corpus
 * captured out of a real browser; see the report.
 */

export interface Attr {
  name: string;
  value: string;
}

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export class FakeElement {
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

export function el(
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

/** FakeElement is structurally compatible with the Element subset both engines touch. */
export const asEl = (e: FakeElement) => e as unknown as Element;

/** Preorder (document-order) walk — the same order both engines' collectAll produces. */
export function documentOrder(root: FakeElement): FakeElement[] {
  const out: FakeElement[] = [root];
  for (const child of root.children) out.push(...documentOrder(child));
  return out;
}

/** Detach a node from its parent, as a real removal would. */
export function detach(node: FakeElement): void {
  const parent = node.parentElement;
  if (!parent) return;
  parent.children = parent.children.filter((c) => c !== node);
  node.parentElement = null;
}

/** Overwrite (or add) a raw attribute, mimicking a live attribute change. */
export function setAttr(node: FakeElement, name: string, value: string): void {
  const existing = node.attributes.find((a) => a.name === name);
  if (existing) existing.value = value;
  else node.attributes.push({ name, value });
}

/**
 * Fixture: Watch page — player (data-machine="player", data-state volatile)
 * nested inside a page layout. Mirrors the fixture in the original app's
 * anchor tests so the parity gate runs over the same shapes the original
 * engine's own tests use.
 */
export function buildWatchDom() {
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

  const upnextTitle = el("span", { class: "upnext-title", text: "2024\u5e746\u6708" });
  const upnextSub = el("span", { class: "upnext-sub", text: "4:32" });
  const upnextMeta = el("span", { class: "upnext-meta" }).append(upnextTitle, upnextSub);
  const sideItem1 = el("button", { class: "upnext-item" }).append(upnextMeta);
  const sideItem2 = el("button", { class: "upnext-item" }).append(
    el("span", { class: "upnext-meta" }).append(
      el("span", { class: "upnext-title", text: "2024\u5e745\u6708" }),
      el("span", { class: "upnext-sub", text: "1:05" }),
    ),
  );
  const upnext = el("aside", { class: "upnext" }).append(sideItem1, sideItem2);

  const primary = el("div", { class: "watch-primary" }).append(playerWrap, row, comments);
  const grid = el("div", { class: "watch-grid" }).append(primary, upnext);
  const watch = el("div", { class: "watch" }).append(grid);
  const root = el("div", { class: "app-root" }).append(watch);

  return {
    root,
    player,
    playIcon,
    timeLabel,
    likePill,
    downloadPill,
    pills,
    commentInput,
    upnextTitle,
    sideItem1,
    sideItem2,
    upnext,
    video,
    comments,
    watch,
  };
}
