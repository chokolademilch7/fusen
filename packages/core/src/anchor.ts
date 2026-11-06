import type { Anchor, AnchorFingerprint } from "./types.ts";

/**
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
 *
 * The volatile-attribute ignore list is per-ENGINE rather than per-call: see
 * createAnchorEngine() below. Capture and scoring MUST agree on that list —
 * a mismatch silently breaks resolution — so the seam binds both to one
 * immutable list at engine construction time instead of letting each call
 * site pass its own.
 */

export type { Anchor, AnchorFingerprint } from "./types.ts";

/**
 * dataset keys that are volatile (change during normal interaction, not on
 * redesign) and must NEVER be captured — including them would make an
 * anchor's own fingerprint fail to match itself moments later. `data-state`
 * is the prime example (player cycles playing/paused/ended constantly).
 */
export const DEFAULT_VOLATILE_DATA_KEYS: readonly string[] = ["state"];

/** Weighted match score in [0, 1]; a candidate must reach this to be accepted. */
const SCORE_THRESHOLD = 0.5;

// ---------------------------------------------------------------------------
// Small DOM helpers (work against real Elements and plain test fixtures that
// implement the same handful of standard properties).
// ---------------------------------------------------------------------------

function classListOf(el: Element): string[] {
  // getAttribute, not className: on SVG elements className is an
  // SVGAnimatedString, which has no split().
  return (el.getAttribute("class") || "").split(/\s+/).filter(Boolean);
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

/**
 * Longest data-* value treated as identity. A longer one is a payload (a
 * Stimulus `data-*-value`, a chart's JSON), not a name: copying it into the
 * fingerprint and the selector made anchors the server refuses as oversized.
 */
const MAX_DATA_ATTR_LENGTH = 200;

function isStaticDataAttr(attr: Attr, volatileKeys: ReadonlySet<string>): boolean {
  return (
    attr.name.startsWith("data-") &&
    !volatileKeys.has(attr.name.slice("data-".length)) &&
    attr.value.length <= MAX_DATA_ATTR_LENGTH
  );
}

/** Static (non-volatile, name-sized) data-* attributes, keyed without the "data-" prefix. */
function staticDataAttrs(el: Element, volatileKeys: ReadonlySet<string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const attr of Array.from(el.attributes)) {
    if (isStaticDataAttr(attr, volatileKeys)) out[attr.name.slice("data-".length)] = attr.value;
  }
  return out;
}

function hasStaticDataAttr(el: Element, volatileKeys: ReadonlySet<string>): boolean {
  for (const attr of Array.from(el.attributes)) {
    if (isStaticDataAttr(attr, volatileKeys)) return true;
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

/**
 * Escape one class token for a selector path.
 *
 * A class name is allowed to contain the selector grammar's own punctuation,
 * and every utility CSS framework in use actually does: Tailwind emits
 * `md:flex`, `w-1.5`, `hover:bg-red-500`, `[&>svg]:mt-1`. Written raw, `.` and
 * `:` make the segment unparseable on the way back in, and the failure is
 * silent — see parseClassSegment.
 *
 * Everything outside `[A-Za-z0-9_-]` and non-ASCII is backslash-escaped, which
 * is both what CSS.escape does for those characters and exactly what the
 * hand-written parser below undoes. A class starting with a digit is NOT given
 * CSS's hex-escape treatment: that would make the path unreadable for the sake
 * of a name no CSS engine accepts anyway, and this grammar is only ever
 * interpreted by parseClassSegment.
 */
function escapeClassName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\-\u00a0-\uffff]/g, (c) => `\\${c}`);
}

// ---------------------------------------------------------------------------
// captureAnchor
// ---------------------------------------------------------------------------

function buildFingerprint(el: Element, volatileKeys: ReadonlySet<string>): AnchorFingerprint {
  return {
    tag: el.tagName.toLowerCase(),
    id: el.id || undefined,
    dataAttrs: staticDataAttrs(el, volatileKeys),
    classList: classListOf(el),
    textSnippet: normalizeText(el.textContent),
  };
}

function segmentFor(el: Element, volatileKeys: ReadonlySet<string>): string {
  const tag = el.tagName.toLowerCase();
  if (el.id) return `#${el.id}`;

  const dataAttrs = staticDataAttrs(el, volatileKeys);
  const keys = Object.keys(dataAttrs).sort();
  if (keys.length > 0) {
    const key = keys[0]!;
    return `${tag}[data-${key}="${escapeAttrValue(dataAttrs[key]!)}"]`;
  }

  const classes = classListOf(el);
  const classSel = classes.map((c) => `.${escapeClassName(c)}`).join("");
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
function buildSelectorPath(el: Element, volatileKeys: ReadonlySet<string>): string {
  const segments: string[] = [];
  let node: Element | null = el;
  while (node) {
    segments.unshift(segmentFor(node, volatileKeys));
    if (node.id || hasStaticDataAttr(node, volatileKeys)) break;
    node = node.parentElement;
  }
  return segments.join(" > ");
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

  const classSegment = parseClassSegment(raw);
  if (classSegment) return classSegment;

  // Unparseable. Deliberately a segment that matches NOTHING (no element's tag
  // is the whole fragment) rather than a throw: a malformed path must cost the
  // path tier and let the fingerprint scan answer, not take down resolution.
  return { kind: "class", tag: raw, classes: [] };
}

const NTH_OF_TYPE = /^:nth-of-type\((\d+)\)$/;

/**
 * Parse `tag.class.class:nth-of-type(n)` — the form segmentFor() writes.
 *
 * Hand-written rather than a regex because the tokens themselves may contain
 * the punctuation the grammar is made of. `.` and `:` inside a class name are
 * backslash-escaped on the way out (escapeClassName), so the scan only has to
 * treat `\x` as a literal `x` to keep `md\:flex` one token. Classes come back
 * UNESCAPED, because matchSegment compares them against the raw className.
 *
 * BACKWARD COMPATIBILITY. Paths written before the escape existed are already
 * stored, and they spell the same class `md:flex` — so a `:` that does not
 * begin a trailing `:nth-of-type(n)` is read as a literal character in the
 * current token. That recovers every legacy path whose classes contain `:`,
 * which is the overwhelming majority (`hover:`, `md:`, `focus:`). A legacy
 * path with an unescaped `.` inside a class (`w-1.5`) is genuinely ambiguous
 * and still splits into two tokens — it resolves through the fingerprint scan
 * exactly as it does today, so nothing gets worse; only newly captured anchors
 * gain the path tier back.
 */
function parseClassSegment(raw: string): PathSegment | null {
  const tagMatch = /^[a-zA-Z][a-zA-Z0-9-]*/.exec(raw);
  if (!tagMatch) return null;
  const tag = tagMatch[0];

  const classes: string[] = [];
  let nth: number | undefined;
  // `null` = between tokens (nothing but `.` may start one); "" = a token was
  // opened by `.` and is still empty, which is a malformed `..`.
  let current: string | null = null;
  let i = tag.length;

  const flush = (): boolean => {
    if (current === null) return true;
    if (current === "") return false;
    classes.push(current);
    current = null;
    return true;
  };

  while (i < raw.length) {
    const ch = raw[i]!;
    if (ch === "\\" && i + 1 < raw.length) {
      if (current === null) return null;
      current += raw[i + 1]!;
      i += 2;
      continue;
    }
    if (ch === ".") {
      if (!flush()) return null;
      current = "";
      i += 1;
      continue;
    }
    if (ch === ":") {
      const trailing = NTH_OF_TYPE.exec(raw.slice(i));
      if (trailing) {
        nth = Number(trailing[1]);
        break;
      }
      if (current === null) return null;
      current += ch;
      i += 1;
      continue;
    }
    if (current === null) return null;
    current += ch;
    i += 1;
  }

  if (!flush()) return null;
  return { kind: "class", tag, classes, nth };
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
function scoreCandidateWith(
  el: Element,
  fp: AnchorFingerprint,
  volatileKeys: ReadonlySet<string>,
): number {
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
    // Raw attributes, not staticDataAttrs: the length cap applies on capture,
    // and a fingerprint stored before it may still hold a payload-sized value.
    // Built in one pass per candidate rather than one scan per fingerprint key.
    const elData = new Map<string, string>();
    for (const attr of Array.from(el.attributes)) {
      if (!attr.name.startsWith("data-")) continue;
      const key = attr.name.slice("data-".length);
      // First occurrence wins, matching attrValue's scan.
      if (!volatileKeys.has(key) && !elData.has(key)) elData.set(key, attr.value);
    }
    const matched = fpDataKeys.filter((k) => elData.get(k) === fp.dataAttrs[k]).length;
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
    // An empty elText is a substring of every snippet, so without the guard a
    // textless element would earn partial text credit it never matched.
    const textMatch =
      elText === fp.textSnippet
        ? 1
        : elText !== "" && (elText.includes(fp.textSnippet) || fp.textSnippet.includes(elText))
          ? 0.5
          : 0;
    add(0.25, textMatch);
  }

  return weightUsed > 0 ? weightedSum / weightUsed : 0;
}

// ---------------------------------------------------------------------------
// describeAnchor
// ---------------------------------------------------------------------------

/**
 * Human-readable label for the feedback list panel.
 *
 * Independent of the volatile list: it only reads an already-captured
 * fingerprint, which by construction contains no volatile keys. Kept as a
 * free function (not an engine method) for exactly that reason.
 */
export function describeAnchor(anchor: Anchor): string {
  const fp = anchor.fingerprint;
  if (fp.textSnippet) return fp.textSnippet;
  const key = Object.keys(fp.dataAttrs).sort()[0];
  if (key) return `${fp.tag}[data-${key}="${fp.dataAttrs[key]}"]`;
  return fp.tag;
}

// ---------------------------------------------------------------------------
// Engine seam
// ---------------------------------------------------------------------------

export type AnchorEngineOptions = {
  /**
   * data-* keys (WITHOUT the `data-` prefix) treated as volatile and excluded
   * from fingerprints, selector paths and scoring. Defaults to
   * DEFAULT_VOLATILE_DATA_KEYS.
   */
  volatileDataKeys?: readonly string[];
};

export type AnchorEngine = {
  captureAnchor(el: Element, point: { x: number; y: number }, route: string): Anchor;
  scoreCandidate(el: Element, fp: AnchorFingerprint): number;
  resolveAnchor(anchor: Anchor, root?: Element): Element | null;
  describeAnchor(anchor: Anchor): string;
};

/**
 * Build an anchoring engine bound to one immutable volatile-key list.
 *
 * The list is captured in this closure, so every function the engine hands
 * back — capture side AND score side — necessarily agrees on it, and there is
 * no module-level mutable state for a second widget instance on the same page
 * to stomp on. Two consumers that need different lists simply hold two
 * engines.
 */
export function createAnchorEngine(options: AnchorEngineOptions = {}): AnchorEngine {
  const volatileKeys: ReadonlySet<string> = new Set(
    options.volatileDataKeys ?? DEFAULT_VOLATILE_DATA_KEYS,
  );

  function captureAnchor(el: Element, point: { x: number; y: number }, route: string): Anchor {
    const rect = el.getBoundingClientRect();
    const rectRatio = {
      x: rect.width > 0 ? clamp01((point.x - rect.left) / rect.width) : 0.5,
      y: rect.height > 0 ? clamp01((point.y - rect.top) / rect.height) : 0.5,
    };
    return {
      version: 1,
      route,
      selectorPath: buildSelectorPath(el, volatileKeys),
      fingerprint: buildFingerprint(el, volatileKeys),
      rectRatio,
    };
  }

  function scoreCandidate(el: Element, fp: AnchorFingerprint): number {
    return scoreCandidateWith(el, fp, volatileKeys);
  }

  /**
   * Re-locate a captured anchor in the live DOM.
   * `root` defaults to the real document and only needs overriding in tests.
   */
  function resolveAnchor(anchor: Anchor, root: Element = document.documentElement): Element | null {
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

  return { captureAnchor, scoreCandidate, resolveAnchor, describeAnchor };
}

/**
 * Default engine — today's behaviour verbatim (volatile list = ["state"]).
 * The three functions below are its bound methods, so calling them with no
 * extra argument is identical to the pre-extraction module-level API.
 */
const defaultEngine = createAnchorEngine();

export const captureAnchor: AnchorEngine["captureAnchor"] = defaultEngine.captureAnchor;
export const scoreCandidate: AnchorEngine["scoreCandidate"] = defaultEngine.scoreCandidate;
export const resolveAnchor: AnchorEngine["resolveAnchor"] = defaultEngine.resolveAnchor;
