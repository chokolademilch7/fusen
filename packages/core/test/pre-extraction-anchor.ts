import type { Anchor as FeedbackAnchor } from "../src/types.ts";

/**
 * FROZEN REFERENCE — DO NOT DELETE, DO NOT "IMPROVE".
 *
 * This is the anchoring engine EXACTLY as it stood in the app it was written
 * for, immediately before it was extracted into @fusen/core. It is kept here
 * as a test fixture and nothing ships it.
 *
 * It exists for one reason: ./anchor-parity.test.ts feeds this file and
 * ../src/anchor.ts the same input and demands identical output, with zero
 * tolerance. That differential is the only evidence the extraction preserved
 * behaviour, and the gate fails to even load if this file goes away.
 *
 * So: changing anything here changes what "the original behaved like", which is
 * the opposite of what a parity gate is for. Fix bugs in ../src/anchor.ts, never
 * here. The single edit made during vendoring was the type import on line 1 —
 * it read the wire type from the host app's shared package, which does not
 * exist in this repo; the shape is identical.
 *
 * ── original header ──────────────────────────────────────────────────────────
 *
 * Element anchoring for the feedback widget.
 *
 * captureAnchor() records a multi-signal fingerprint of the tapped element
 * (selector path + tag/id/data-attrs/classes/text + relative tap position).
 * resolveAnchor() re-locates that element later (reload, layout change,
 * unrelated DOM mutation) via (1) a direct selectorPath walk verified by a
 * fingerprint score, falling back to (2) a same-tag scan scored the same
 * way, else null so the caller can fall back to the list-only panel.
 *
 * `selectorPath` resolution does NOT use the browser's native
 * `Element.querySelector` — it is parsed and walked by hand below so the
 * exact same code path is unit-testable against plain DOM-shaped fixtures
 * without pulling in a DOM testing dependency. The grammar produced by
 * buildSelectorPath() is still valid CSS (readable for debugging), just not
 * required to be interpreted by a CSS engine.
 */

export type AnchorFingerprint = FeedbackAnchor["fingerprint"];

/**
 * dataset keys that are volatile (change during normal interaction, not on
 * redesign) and must NEVER be captured — including them would make an
 * anchor's own fingerprint fail to match itself moments later. `data-state`
 * is the prime example (player cycles playing/paused/ended constantly).
 */
const VOLATILE_DATA_KEYS = new Set(["state"]);

/** Weighted match score in [0, 1]; a candidate must reach this to be accepted. */
const SCORE_THRESHOLD = 0.5;

// ---------------------------------------------------------------------------
// Small DOM helpers (work against real Elements and plain test fixtures that
// implement the same handful of standard properties).
// ---------------------------------------------------------------------------

function classListOf(el: Element): string[] {
  return (el.className || "").split(/\s+/).filter(Boolean);
}

function childrenOf(el: Element): Element[] {
  return Array.from(el.children) as Element[];
}

function attrValue(el: Element, name: string): string | undefined {
  for (const attr of Array.from(el.attributes)) {
    if (attr.name === name) return attr.value;
  }
  return undefined;
}

/** Static (non-volatile) data-* attributes, keyed without the "data-" prefix. */
function staticDataAttrs(el: Element): Record<string, string> {
  const out: Record<string, string> = {};
  for (const attr of Array.from(el.attributes)) {
    if (!attr.name.startsWith("data-")) continue;
    const key = attr.name.slice("data-".length);
    if (VOLATILE_DATA_KEYS.has(key)) continue;
    out[key] = attr.value;
  }
  return out;
}

function hasStaticDataAttr(el: Element): boolean {
  for (const attr of Array.from(el.attributes)) {
    if (attr.name.startsWith("data-") && !VOLATILE_DATA_KEYS.has(attr.name.slice(5))) return true;
  }
  return false;
}

function nthOfType(el: Element): number {
  const parent = el.parentElement;
  if (!parent) return 1;
  const siblings = childrenOf(parent).filter((c) => c.tagName === el.tagName);
  return siblings.indexOf(el) + 1;
}

function collectAll(root: Element): Element[] {
  const out: Element[] = [root];
  for (const child of childrenOf(root)) out.push(...collectAll(child));
  return out;
}

function normalizeText(text: string | null | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function escapeAttrValue(v: string): string {
  return v.replace(/[\\"]/g, (c) => `\\${c}`);
}

function unescapeAttrValue(v: string): string {
  return v.replace(/\\(.)/g, "$1");
}

// ---------------------------------------------------------------------------
// captureAnchor
// ---------------------------------------------------------------------------

function buildFingerprint(el: Element): AnchorFingerprint {
  return {
    tag: el.tagName.toLowerCase(),
    id: el.id || undefined,
    dataAttrs: staticDataAttrs(el),
    classList: classListOf(el),
    textSnippet: normalizeText(el.textContent),
  };
}

function segmentFor(el: Element): string {
  const tag = el.tagName.toLowerCase();
  if (el.id) return `#${el.id}`;

  const dataAttrs = staticDataAttrs(el);
  const keys = Object.keys(dataAttrs).sort();
  if (keys.length > 0) {
    const key = keys[0]!;
    return `${tag}[data-${key}="${escapeAttrValue(dataAttrs[key]!)}"]`;
  }

  const classes = classListOf(el);
  const classSel = classes.map((c) => `.${c}`).join("");
  let nth = "";
  const parent = el.parentElement;
  if (parent) {
    const siblings = childrenOf(parent).filter((c) => c.tagName === el.tagName);
    if (siblings.length > 1) nth = `:nth-of-type(${siblings.indexOf(el) + 1})`;
  }
  return `${tag}${classSel}${nth}`;
}

/**
 * Stability-priority selector path: id > static data-* attribute > tag +
 * classes + nth-of-type. Climbs ancestors only until a "stable" one (with an
 * id or static data-attr) is reached — that ancestor already discriminates,
 * so there is no need to walk all the way to the document root.
 */
function buildSelectorPath(el: Element): string {
  const segments: string[] = [];
  let node: Element | null = el;
  while (node) {
    segments.unshift(segmentFor(node));
    if (node.id || hasStaticDataAttr(node)) break;
    node = node.parentElement;
  }
  return segments.join(" > ");
}

export function captureAnchor(
  el: Element,
  point: { x: number; y: number },
  route: string,
): FeedbackAnchor {
  const rect = el.getBoundingClientRect();
  const rectRatio = {
    x: rect.width > 0 ? clamp01((point.x - rect.left) / rect.width) : 0.5,
    y: rect.height > 0 ? clamp01((point.y - rect.top) / rect.height) : 0.5,
  };
  return {
    version: 1,
    route,
    selectorPath: buildSelectorPath(el),
    fingerprint: buildFingerprint(el),
    rectRatio,
  };
}

// ---------------------------------------------------------------------------
// resolveAnchor
// ---------------------------------------------------------------------------

type PathSegment =
  | { kind: "id"; id: string }
  | { kind: "data"; tag: string; key: string; value: string }
  | { kind: "class"; tag: string; classes: string[]; nth?: number };

function parseSegment(raw: string): PathSegment {
  if (raw.startsWith("#")) return { kind: "id", id: raw.slice(1) };

  const dataMatch = /^([a-zA-Z][a-zA-Z0-9-]*)\[data-([a-zA-Z0-9-]+)="((?:[^"\\]|\\.)*)"\]$/.exec(
    raw,
  );
  if (dataMatch) {
    return {
      kind: "data",
      tag: dataMatch[1]!,
      key: dataMatch[2]!,
      value: unescapeAttrValue(dataMatch[3]!),
    };
  }

  const classMatch = /^([a-zA-Z][a-zA-Z0-9-]*)((?:\.[^.:]+)*)(?::nth-of-type\((\d+)\))?$/.exec(
    raw,
  );
  if (classMatch) {
    const classes = (classMatch[2] ?? "").split(".").filter(Boolean);
    return {
      kind: "class",
      tag: classMatch[1]!,
      classes,
      nth: classMatch[3] ? Number(classMatch[3]) : undefined,
    };
  }

  return { kind: "class", tag: raw, classes: [] };
}

function matchSegment(el: Element, seg: PathSegment): boolean {
  if (seg.kind === "id") return el.id === seg.id;
  const tag = el.tagName.toLowerCase();
  if (tag !== seg.tag) return false;
  if (seg.kind === "data") return attrValue(el, `data-${seg.key}`) === seg.value;
  const classes = classListOf(el);
  if (!seg.classes.every((c) => classes.includes(c))) return false;
  if (seg.nth !== undefined && nthOfType(el) !== seg.nth) return false;
  return true;
}

function resolveBySelectorPath(root: Element, path: string): Element | null {
  const segments = path.split(" > ").filter(Boolean).map(parseSegment);
  if (segments.length === 0) return null;

  let candidates = collectAll(root).filter((el) => matchSegment(el, segments[0]!));
  for (let i = 1; i < segments.length && candidates.length > 0; i++) {
    const seg = segments[i]!;
    const next: Element[] = [];
    for (const c of candidates) {
      for (const child of childrenOf(c)) {
        if (matchSegment(child, seg)) next.push(child);
      }
    }
    candidates = next;
  }
  return candidates[0] ?? null;
}

/**
 * Weighted similarity between a live element and a captured fingerprint, in
 * [0, 1]. Exported for unit testing independent of DOM traversal.
 *
 * Weights (id=0.3, data=0.3, class=0.15, text=0.25) are normalized against
 * only the categories the fingerprint actually carries a signal for — id,
 * data-attrs and text are skipped when the fingerprint has nothing to
 * compare (rather than granting a flat "both absent" credit), so an element
 * with no id/data-attrs still resolves purely on tag + class + text. class
 * is always counted since even an empty class list is a real signal.
 */
export function scoreCandidate(el: Element, fp: AnchorFingerprint): number {
  if (el.tagName.toLowerCase() !== fp.tag) return 0;

  let weightUsed = 0;
  let weightedSum = 0;

  const add = (weight: number, match: number) => {
    weightUsed += weight;
    weightedSum += weight * match;
  };

  if (fp.id) add(0.3, el.id === fp.id ? 1 : 0);

  const fpDataKeys = Object.keys(fp.dataAttrs);
  if (fpDataKeys.length > 0) {
    const elAttrs = staticDataAttrs(el);
    const matched = fpDataKeys.filter((k) => elAttrs[k] === fp.dataAttrs[k]).length;
    add(0.3, matched / fpDataKeys.length);
  }

  const elClasses = new Set(classListOf(el));
  const fpClasses = new Set(fp.classList);
  const classUnion = new Set([...elClasses, ...fpClasses]);
  const classMatch =
    classUnion.size === 0
      ? 1
      : [...fpClasses].filter((c) => elClasses.has(c)).length / classUnion.size;
  add(0.15, classMatch);

  if (fp.textSnippet) {
    const elText = normalizeText(el.textContent);
    const textMatch =
      elText === fp.textSnippet
        ? 1
        : elText.includes(fp.textSnippet) || fp.textSnippet.includes(elText)
          ? 0.5
          : 0;
    add(0.25, textMatch);
  }

  return weightUsed > 0 ? weightedSum / weightUsed : 0;
}

/**
 * Re-locate a captured anchor in the live DOM.
 * `root` defaults to the real document and only needs overriding in tests.
 */
export function resolveAnchor(
  anchor: FeedbackAnchor,
  root: Element = document.documentElement,
): Element | null {
  const direct = resolveBySelectorPath(root, anchor.selectorPath);
  if (direct && scoreCandidate(direct, anchor.fingerprint) >= SCORE_THRESHOLD) return direct;

  let best: Element | null = null;
  let bestScore = 0;
  for (const el of collectAll(root)) {
    if (el.tagName.toLowerCase() !== anchor.fingerprint.tag) continue;
    const s = scoreCandidate(el, anchor.fingerprint);
    if (s > bestScore) {
      bestScore = s;
      best = el;
    }
  }
  return bestScore >= SCORE_THRESHOLD ? best : null;
}

// ---------------------------------------------------------------------------
// describeAnchor
// ---------------------------------------------------------------------------

/** Human-readable label for the feedback list panel. */
export function describeAnchor(anchor: FeedbackAnchor): string {
  const fp = anchor.fingerprint;
  if (fp.textSnippet) return fp.textSnippet;
  const key = Object.keys(fp.dataAttrs).sort()[0];
  if (key) return `${fp.tag}[data-${key}="${fp.dataAttrs[key]}"]`;
  return fp.tag;
}
