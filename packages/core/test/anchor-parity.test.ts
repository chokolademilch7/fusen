/**
 * PARITY GATE — ./pre-extraction-anchor.ts  vs  @fusen/core src/anchor.ts
 *
 * The extraction copied the original engine into this package and made one
 * behavioural change (the volatile-attribute ignore list is now configurable via
 * createAnchorEngine({volatileDataKeys}), defaulting to the original's hardcoded
 * ["state"]). This file proves that for IDENTICAL input the two engines produce
 * IDENTICAL output, with zero tolerance, on every surface: captureAnchor,
 * scoreCandidate, resolveAnchor and describeAnchor.
 *
 * SECOND, DELIBERATE DIVERGENCE — SELECTOR-PATH ESCAPING. The core escapes `.`
 * and `:` inside a class token when writing a selectorPath (and un-escapes on
 * the way back), because the original could not parse `md:flex` or `w-1.5` at
 * all — see escapeClassName / parseClassSegment in ../src/anchor.ts. Every
 * fixture below uses plain class names, for which escaping is a no-op, so the
 * gate is genuinely comparing the two engines rather than tolerating a gap. A
 * fixture with a utility-framework class name added HERE would report a
 * captureAnchor divergence, and that divergence would be the FIX, not a
 * regression: cover those in ../src/anchor.test.ts instead.
 *
 * THIRD, DELIBERATE DIVERGENCE — PAYLOAD-SIZED data-* VALUES. On capture the
 * core ignores a data-* value over 200 characters (MAX_DATA_ATTR_LENGTH): it is
 * a payload, not a name, and copying it made anchors too large to store.
 * Scoring still reads the raw attribute, so anchors stored before keep
 * resolving. Every fixture below uses short values; long ones are covered in
 * ../src/anchor.test.ts.
 *
 * FOURTH, DELIBERATE DIVERGENCE — TEXTLESS CANDIDATES. The original gave an
 * element with no text half text credit against any non-empty snippet, because
 * "" is a substring of every string; that let a textless element win a match it
 * never made. The core scores it 0 on text. The fixtures do contain textless
 * same-tag nodes, so for exactly those nodes (empty text, non-empty snippet) the
 * comparator demands the core score STRICTLY LOWER instead of equal. Every other
 * node, and resolveAnchor on every case, is still compared with zero tolerance.
 *
 * WHY A DIFFERENTIAL AND NOT A STORED-ANCHOR CORPUS
 * -------------------------------------------------
 * A corpus of stored anchors alone is VACUOUS. A stored anchor is only
 * {version, route, selectorPath, fingerprint, rectRatio} — it carries no DOM, so
 * resolveAnchor() would have nothing to resolve against and BOTH engines would
 * return null for every fixture, passing at 100% while testing nothing. This gate
 * is immune because it (a) builds live fixture trees and resolves against them,
 * (b) asserts per case WHICH tier of the algorithm was exercised, (c) enforces an
 * anti-vacuity floor on the number of non-null resolutions, and (d) carries
 * MUTATION CHECKS proving the comparator actually reports divergence.
 *
 * There is no jsdom/happy-dom in this repo and no new dependency may be added:
 * fixtures use the FakeElement pattern the original app's own tests used.
 * See ./fake-dom.ts.
 *
 * Run: bun test --conditions=browser packages/core/test/anchor-parity.test.ts
 */

import { describe, expect, test } from "bun:test";

import {
  captureAnchor as legacyCapture,
  describeAnchor as legacyDescribe,
  resolveAnchor as legacyResolve,
  scoreCandidate as legacyScore,
} from "./pre-extraction-anchor.ts";
import { createAnchorEngine } from "../src/anchor.ts";
import type { Anchor, AnchorFingerprint } from "../src/types.ts";
import {
  asEl,
  buildWatchDom,
  detach,
  documentOrder,
  el,
  type FakeElement,
  setAttr,
} from "./fake-dom.ts";

// ---------------------------------------------------------------------------
// The two engines under comparison, behind one uniform shape.
// ---------------------------------------------------------------------------

type EngineLike = {
  readonly name: string;
  captureAnchor(el: Element, point: { x: number; y: number }, route: string): Anchor;
  scoreCandidate(el: Element, fp: AnchorFingerprint): number;
  resolveAnchor(anchor: Anchor, root: Element): Element | null;
  describeAnchor(anchor: Anchor): string;
};

/** The original app's engine, frozen in ./pre-extraction-anchor.ts. Module-level API. */
const ORIGINAL: EngineLike = {
  name: "original",
  captureAnchor: legacyCapture as EngineLike["captureAnchor"],
  scoreCandidate: legacyScore as EngineLike["scoreCandidate"],
  resolveAnchor: legacyResolve as EngineLike["resolveAnchor"],
  describeAnchor: legacyDescribe as EngineLike["describeAnchor"],
};

/** The extracted engine at its documented default (volatile list = ["state"]). */
const EXTRACTED: EngineLike = { name: "extracted(core,default)", ...createAnchorEngine() };

/** Threshold both engines hardcode; asserted against, never imported (it is private). */
const SCORE_THRESHOLD = 0.5;

/**
 * A selector path that cannot match anything: it parses as
 * {kind:"class", tag:"nomatch-xyz", classes:[]}, no fixture uses that tag, so the
 * candidate set empties and tier 1 (the selectorPath walk) is cleanly disabled.
 * Used to probe whether the path walk was load-bearing for a given case.
 */
const NO_MATCH_PATH = "nomatch-xyz";

const withoutPath = (anchor: Anchor): Anchor => ({ ...anchor, selectorPath: NO_MATCH_PATH });

/** Highest score any same-tag element in the tree reaches, per the given engine. */
function bestSameTagScore(engine: EngineLike, root: FakeElement, fp: AnchorFingerprint): number {
  let best = 0;
  for (const node of documentOrder(root)) {
    if (node.tagName.toLowerCase() !== fp.tag) continue;
    best = Math.max(best, engine.scoreCandidate(asEl(node), fp));
  }
  return best;
}

// ---------------------------------------------------------------------------
// The comparator. Returns diffs instead of throwing, so the MUTATION CHECKS
// below can assert that it DETECTS divergence — the only evidence that a green
// suite means the comparison is wired up at all.
// ---------------------------------------------------------------------------

type ParitySpec = {
  /** Element to capture. */
  target: FakeElement;
  /** Tree the anchor is later resolved against. Always passed explicitly: the
   *  engines' default root is document.documentElement, which does not exist
   *  under `bun test`. */
  root: FakeElement;
  point?: { x: number; y: number };
  route?: string;
  /** Applied ONCE between capture and resolve — the DOM change under test. */
  mutate?: () => void;
};

type ParityResult = {
  diffs: string[];
  anchorA: Anchor;
  anchorB: Anchor;
  resolvedA: Element | null;
  resolvedB: Element | null;
  /** Per-node scores, keyed by document-order index of every same-tag node. */
  scoresA: number[];
  scoresB: number[];
};

function runParity(a: EngineLike, b: EngineLike, spec: ParitySpec): ParityResult {
  const point = spec.point ?? { x: 7, y: 3 };
  const route = spec.route ?? "/watch/v1";
  const diffs: string[] = [];

  // --- surface 1: captureAnchor (each engine captures the SAME live element) ---
  const anchorA = a.captureAnchor(asEl(spec.target), point, route);
  const anchorB = b.captureAnchor(asEl(spec.target), point, route);
  // strict deep equality: {id: undefined} must NOT compare equal to {}, so a
  // future engine that drops an absent optional key is caught.
  if (!Bun.deepEquals(anchorA, anchorB, true)) {
    diffs.push(`captureAnchor: ${JSON.stringify(anchorA)} !== ${JSON.stringify(anchorB)}`);
  }

  // --- surface 2: describeAnchor (each from its OWN captured anchor) ---
  const describedA = a.describeAnchor(anchorA);
  const describedB = b.describeAnchor(anchorB);
  if (describedA !== describedB) {
    diffs.push(`describeAnchor: ${JSON.stringify(describedA)} !== ${JSON.stringify(describedB)}`);
  }

  // --- the DOM change under test ---
  spec.mutate?.();

  // --- surface 3: scoreCandidate over every same-tag node, exact equality ---
  const scoresA: number[] = [];
  const scoresB: number[] = [];
  for (const node of documentOrder(spec.root)) {
    if (node.tagName.toLowerCase() !== anchorA.fingerprint.tag) continue;
    const sa = a.scoreCandidate(asEl(node), anchorA.fingerprint);
    const sb = b.scoreCandidate(asEl(node), anchorB.fingerprint);
    scoresA.push(sa);
    scoresB.push(sb);
    // Fourth deliberate divergence (see header): the core drops the original's
    // spurious partial text credit for a textless node.
    const textless =
      anchorA.fingerprint.textSnippet !== "" && (node.textContent ?? "").trim() === "";
    if (textless) {
      if (!(sb < sa)) {
        diffs.push(
          `scoreCandidate(<${node.tagName.toLowerCase()}.${node.className}>): textless ${sb} !< ${sa}`,
        );
      }
      continue;
    }
    // Object.is, not toBeCloseTo: zero tolerance means bit-identical.
    if (!Object.is(sa, sb)) {
      diffs.push(
        `scoreCandidate(<${node.tagName.toLowerCase()}.${node.className}>): ${sa} !== ${sb}`,
      );
    }
  }

  // --- surface 4: resolveAnchor, compared by NODE IDENTITY on a shared tree ---
  const resolvedA = a.resolveAnchor(anchorA, asEl(spec.root));
  const resolvedB = b.resolveAnchor(anchorB, asEl(spec.root));
  if (resolvedA !== resolvedB) {
    const show = (e: Element | null) =>
      e ? `<${e.tagName.toLowerCase()} class="${e.className}">` : "null";
    diffs.push(`resolveAnchor: ${show(resolvedA)} !== ${show(resolvedB)} (reference inequality)`);
  }

  return { diffs, anchorA, anchorB, resolvedA, resolvedB, scoresA, scoresB };
}

/** Assert full parity and hand back the (identical) result for tier assertions. */
function expectParity(spec: ParitySpec): ParityResult {
  const r = runParity(ORIGINAL, EXTRACTED, spec);
  expect(r.diffs).toEqual([]);
  // Belt-and-braces: the strict deep-equality claim, re-stated through the
  // matcher so a failure prints a readable structural diff.
  expect(r.anchorB).toStrictEqual(r.anchorA);
  return r;
}

// ---------------------------------------------------------------------------
// Anti-vacuity ledger. Every parity case records whether it resolved to a real
// element; the floor is derived from the case table, not hardcoded, so adding a
// case cannot silently lower the bar.
// ---------------------------------------------------------------------------

type Tier =
  | "path-hit"
  | "path-hit-first-candidate"
  | "path-below-threshold-then-scan"
  | "path-miss-then-scan"
  | "scan-below-threshold-null"
  | "scan-tie-document-order"
  | "root-is-target"
  | "volatile-changed"
  | "escaped-quote";

/** Cases whose whole point is a null result. Everything else MUST be non-null. */
const NULL_BY_DESIGN: ReadonlySet<Tier> = new Set<Tier>(["scan-below-threshold-null"]);

const ALL_TIERS: readonly Tier[] = [
  "path-hit",
  "path-hit-first-candidate",
  "path-below-threshold-then-scan",
  "path-miss-then-scan",
  "scan-below-threshold-null",
  "scan-tie-document-order",
  "root-is-target",
  "volatile-changed",
  "escaped-quote",
];

const ledger: { tier: Tier; nonNull: boolean }[] = [];

function record(tier: Tier, resolved: Element | null): void {
  ledger.push({ tier, nonNull: resolved !== null });
}

// ---------------------------------------------------------------------------
// Branch coverage: one case per tier of the algorithm, each asserting BOTH
// parity and which tier it exercised, so a future refactor that collapses tiers
// is caught rather than silently absorbed.
// ---------------------------------------------------------------------------

/** Two byte-identical sibling buttons — the only discriminator is nth-of-type. */
function buildTwinList() {
  const first = el("button", { class: "item", text: "Same" });
  const second = el("button", { class: "item", text: "Same" });
  const list = el("div", { class: "list" }).append(first, second);
  const root = el("div", { class: "app-root" }).append(list);
  return { root, list, first, second };
}

describe("anchor parity: selectorPath walk (tier 1)", () => {
  test("path hit — nth-of-type disambiguates twins the scan cannot tell apart", () => {
    const { root, first, second } = buildTwinList();

    const r = expectParity({ target: second, root });
    record("path-hit", r.resolvedA);

    // The path is what makes this resolvable at all.
    expect(r.anchorA.selectorPath).toBe("div.app-root > div.list > button.item:nth-of-type(2)");
    expect(r.resolvedA).toBe(asEl(second));

    // Tier proof: disable tier 1 and the scan cannot reach the target — the twins
    // score identically, and the strict `>` comparison keeps the FIRST one.
    expect(ORIGINAL.scoreCandidate(asEl(first), r.anchorA.fingerprint)).toBe(1);
    expect(ORIGINAL.scoreCandidate(asEl(second), r.anchorA.fingerprint)).toBe(1);
    expect(ORIGINAL.resolveAnchor(withoutPath(r.anchorA), asEl(root))).toBe(asEl(first));
    expect(EXTRACTED.resolveAnchor(withoutPath(r.anchorB), asEl(root))).toBe(asEl(first));
  });

  test("path hit — only the FIRST surviving candidate is scored, siblings discarded", () => {
    // Capture while the target is the sole span.label under the panel (so its
    // segment carries no nth-of-type), then INSERT a decoy before it. The path
    // now matches both, resolveBySelectorPath keeps candidates[0] = the decoy,
    // and because the decoy still clears the threshold the decoy WINS — even
    // though the target would score strictly higher in the scan.
    const target = el("span", { class: "label", text: "Hello world" });
    const panel = el("section", { class: "panel", data: { machine: "panel" } }).append(target);
    const root = el("div", { class: "app-root" }).append(panel);
    const decoy = el("span", { class: "label", text: "Hello world extra tail" });

    const r = expectParity({
      target,
      root,
      mutate: () => {
        decoy.parentElement = panel;
        panel.children.unshift(decoy);
      },
    });
    record("path-hit-first-candidate", r.resolvedA);

    expect(r.anchorA.selectorPath).toBe('section[data-machine="panel"] > span.label');

    const decoyScore = ORIGINAL.scoreCandidate(asEl(decoy), r.anchorA.fingerprint);
    const targetScore = ORIGINAL.scoreCandidate(asEl(target), r.anchorA.fingerprint);
    expect(decoyScore).toBeGreaterThanOrEqual(SCORE_THRESHOLD);
    expect(targetScore).toBeGreaterThan(decoyScore);

    // Tier proof: tier 1 accepted the decoy, so the higher-scoring target lost.
    expect(r.resolvedA).toBe(asEl(decoy));
    // And with tier 1 disabled the scan picks the strictly better target.
    expect(ORIGINAL.resolveAnchor(withoutPath(r.anchorA), asEl(root))).toBe(asEl(target));
    expect(EXTRACTED.resolveAnchor(withoutPath(r.anchorB), asEl(root))).toBe(asEl(target));
  });

  test("path candidate below threshold — falls through to the scan", () => {
    // Same shape as above, but the inserted decoy's text shares nothing with the
    // fingerprint, so its score misses the threshold and tier 1 is rejected.
    const target = el("span", { class: "label", text: "Hello world" });
    const panel = el("section", { class: "panel", data: { machine: "panel" } }).append(target);
    const root = el("div", { class: "app-root" }).append(panel);
    const decoy = el("span", { class: "label", text: "Zzz Qqq" });

    const r = expectParity({
      target,
      root,
      mutate: () => {
        decoy.parentElement = panel;
        panel.children.unshift(decoy);
      },
    });
    record("path-below-threshold-then-scan", r.resolvedA);

    const decoyScore = ORIGINAL.scoreCandidate(asEl(decoy), r.anchorA.fingerprint);
    expect(decoyScore).toBeLessThan(SCORE_THRESHOLD);
    expect(EXTRACTED.scoreCandidate(asEl(decoy), r.anchorB.fingerprint)).toBe(decoyScore);

    // Tier proof: the path's first (and only scored) candidate was the decoy and
    // it was rejected, so the same-tag scan supplied the answer.
    expect(r.resolvedA).not.toBe(asEl(decoy));
    expect(r.resolvedA).toBe(asEl(target));
  });
});

describe("anchor parity: same-tag scan (tier 2)", () => {
  test("path misses entirely — scan recovers the element by text", () => {
    const dom = buildWatchDom();
    const r = expectParity({
      target: dom.upnextTitle,
      root: dom.root,
      // A redesign renames the class: every class segment on the path now fails.
      mutate: () => {
        dom.upnextTitle.className = "upnext-title-v2";
      },
    });
    record("path-miss-then-scan", r.resolvedA);

    expect(r.resolvedA).toBe(asEl(dom.upnextTitle));
    // Tier proof: the path contributed nothing — disabling it changes nothing.
    expect(ORIGINAL.resolveAnchor(withoutPath(r.anchorA), asEl(dom.root))).toBe(
      asEl(dom.upnextTitle),
    );
    expect(EXTRACTED.resolveAnchor(withoutPath(r.anchorB), asEl(dom.root))).toBe(
      asEl(dom.upnextTitle),
    );
  });

  test("scan's best score below threshold — yields null on both engines", () => {
    const dom = buildWatchDom();
    const r = expectParity({
      target: dom.likePill,
      root: dom.root,
      mutate: () => detach(dom.likePill),
    });
    record("scan-below-threshold-null", r.resolvedA);

    expect(r.resolvedA).toBeNull();
    expect(r.resolvedB).toBeNull();
    // Tier proof (and anti-vacuity guard for THIS case): the scan DID have
    // same-tag elements to consider — three other <button>s survive in the tree —
    // and returned null because none of them cleared the threshold, not because
    // the scan had nothing to look at.
    const sameTag = documentOrder(dom.root).filter(
      (n) => n.tagName.toLowerCase() === r.anchorA.fingerprint.tag,
    );
    expect(sameTag.length).toBeGreaterThan(0);
    expect(sameTag).not.toContain(dom.likePill);
    const best = bestSameTagScore(ORIGINAL, dom.root, r.anchorA.fingerprint);
    expect(best).toBeLessThan(SCORE_THRESHOLD);
    expect(bestSameTagScore(EXTRACTED, dom.root, r.anchorB.fingerprint)).toBe(best);
  });

  test("scan tie — the strict `>` comparison makes document-order-first win", () => {
    const { root, list, first, second } = buildTwinList();
    const r = expectParity({
      target: second,
      root,
      // Rename the wrapper so the captured path's `div.list` segment misses and
      // the tie in the scan is what decides the outcome.
      mutate: () => {
        list.className = "list-v2";
      },
    });
    record("scan-tie-document-order", r.resolvedA);

    const sFirst = ORIGINAL.scoreCandidate(asEl(first), r.anchorA.fingerprint);
    const sSecond = ORIGINAL.scoreCandidate(asEl(second), r.anchorA.fingerprint);
    expect(sFirst).toBe(sSecond); // exact tie, not "close to"
    expect(sFirst).toBeGreaterThanOrEqual(SCORE_THRESHOLD);

    // Tier proof: the tie resolved to the EARLIER node, not the captured target.
    expect(documentOrder(root).indexOf(first)).toBeLessThan(documentOrder(root).indexOf(second));
    expect(r.resolvedA).toBe(asEl(first));
    expect(r.resolvedA).not.toBe(asEl(second));
  });
});

describe("anchor parity: traversal and escaping edge cases", () => {
  test("the traversal root itself is a candidate — target IS the root", () => {
    const dom = buildWatchDom();
    const r = expectParity({ target: dom.root, root: dom.root });
    record("root-is-target", r.resolvedA);

    expect(r.anchorA.selectorPath).toBe("div.app-root");
    // Tier proof: BOTH tiers include the root — the path walk's collectAll seeds
    // with the root, and so does the scan.
    expect(r.resolvedA).toBe(asEl(dom.root));
    expect(ORIGINAL.resolveAnchor(withoutPath(r.anchorA), asEl(dom.root))).toBe(asEl(dom.root));
    expect(EXTRACTED.resolveAnchor(withoutPath(r.anchorB), asEl(dom.root))).toBe(asEl(dom.root));
    // Root-inclusion is scoped to the root you PASS: handed a subtree that
    // excludes the captured element, neither engine can return it. (They agree on
    // the consolation match too — div.watch inherits the identical textContent,
    // scoring 0.625 — which is itself a parity assertion about the boundary.)
    const subtreeA = ORIGINAL.resolveAnchor(r.anchorA, asEl(dom.watch));
    const subtreeB = EXTRACTED.resolveAnchor(r.anchorB, asEl(dom.watch));
    expect(subtreeA).toBe(subtreeB);
    expect(subtreeA).not.toBe(asEl(dom.root));
    expect(subtreeA).toBe(asEl(dom.watch));
    // With no same-tag element anywhere in the passed root, it is null.
    expect(ORIGINAL.resolveAnchor(r.anchorA, asEl(el("span", { class: "nope" })))).toBeNull();
    expect(EXTRACTED.resolveAnchor(r.anchorB, asEl(el("span", { class: "nope" })))).toBeNull();
  });

  test("a volatile-list attribute changed between capture and resolve — still resolves", () => {
    const dom = buildWatchDom();
    const r = expectParity({
      target: dom.player,
      root: dom.root,
      mutate: () => {
        // The player machine cycles states and the controls hide (class swap).
        setAttr(dom.player, "data-state", "ended");
        dom.player.className = "player hide-controls";
      },
    });
    record("volatile-changed", r.resolvedA);

    // data-state is on the default volatile list for BOTH engines, so it never
    // entered either fingerprint or either selector path.
    expect(r.anchorA.fingerprint.dataAttrs).toStrictEqual({ machine: "player" });
    expect(r.anchorB.fingerprint.dataAttrs).toStrictEqual({ machine: "player" });
    expect(r.anchorA.selectorPath).toBe('div[data-machine="player"]');
    expect(r.resolvedA).toBe(asEl(dom.player));
  });

  test("a data attribute whose VALUE contains an escaped quote round-trips", () => {
    const target = el("span", { class: "quoted", data: { title: 'say "hi" \\ ok' }, text: "Q" });
    const root = el("div", { class: "app-root" }).append(target);

    const r = expectParity({ target, root });
    record("escaped-quote", r.resolvedA);

    // The quote and the backslash are escaped on the way into the selector and
    // unescaped on the way out; both engines must agree byte for byte.
    expect(r.anchorA.selectorPath).toBe('span[data-title="say \\"hi\\" \\\\ ok"]');
    expect(r.anchorA.fingerprint.dataAttrs).toStrictEqual({ title: 'say "hi" \\ ok' });
    expect(r.resolvedA).toBe(asEl(target));
    // Tier proof: the path (the surface the escaping lives on) is load-bearing —
    // it is the only thing that survives if the fingerprint's text is destroyed.
    const textless = (a: Anchor): Anchor => ({
      ...a,
      fingerprint: { ...a.fingerprint, textSnippet: "" },
    });
    expect(ORIGINAL.resolveAnchor(textless(r.anchorA), asEl(root))).toBe(asEl(target));
    expect(EXTRACTED.resolveAnchor(textless(r.anchorB), asEl(root))).toBe(asEl(target));
  });
});

// ---------------------------------------------------------------------------
// ANTI-VACUITY GATE
// ---------------------------------------------------------------------------

describe("anti-vacuity", () => {
  test("every tier above is covered exactly once", () => {
    // `map` already returns a fresh array, so only ALL_TIERS needs copying
    // before `sort` (it is a shared constant and sort mutates in place).
    expect(ledger.map((e) => e.tier).sort()).toEqual([...ALL_TIERS].sort());
  });

  test("enough cases resolve to a REAL element (guards against the null-corpus trap)", () => {
    const total = ledger.length;
    const nonNull = ledger.filter((e) => e.nonNull).length;
    const floor = ALL_TIERS.filter((t) => !NULL_BY_DESIGN.has(t)).length;

    // Printed, not buried: this is the number a reviewer needs to see.
    console.log(
      `\n[anti-vacuity] non-null resolutions: ${nonNull}/${total} — floor ${floor} ` +
        `(derived from the case table: ${total} cases, ${NULL_BY_DESIGN.size} null by design)\n` +
        ledger.map((e) => `  ${e.nonNull ? "resolved" : "null    "}  ${e.tier}`).join("\n"),
    );

    expect(total).toBe(ALL_TIERS.length);
    expect(nonNull).toBeGreaterThanOrEqual(floor);
    // The mirror guard: if EVERY case resolved, the null-by-design case silently
    // stopped testing the null path.
    expect(nonNull).toBeLessThan(total);
  });
});

// ---------------------------------------------------------------------------
// MUTATION CHECKS — proof that the comparator has teeth.
//
// Each of these deliberately configures the extracted engine to DISAGREE with
// the original (volatileDataKeys: ["machine"] instead of the default ["state"])
// and asserts that runParity REPORTS the divergence. Without these, a green
// suite would not be evidence that the comparison is wired up at all. These are
// positive tests of the detector — nothing here is skipped or commented out.
// ---------------------------------------------------------------------------

describe("mutation check: a misconfigured engine is DETECTED", () => {
  /** Same code, different volatile list: `machine` volatile, `state` is not. */
  const DIVERGENT: EngineLike = {
    name: "extracted(core,volatile=[machine])",
    ...createAnchorEngine({ volatileDataKeys: ["machine"] }),
  };

  test("sanity: the divergent engine is only a CONFIGURATION change", () => {
    // It is the same implementation — so if the gate goes red below, it is the
    // volatile list that differs, not a code fork.
    expect(typeof DIVERGENT.resolveAnchor).toBe("function");
    expect(DIVERGENT).not.toBe(EXTRACTED);
  });

  test("detects captureAnchor divergence (fingerprint + selectorPath)", () => {
    const dom = buildWatchDom();
    const r = runParity(ORIGINAL, DIVERGENT, { target: dom.player, root: dom.root });

    expect(r.diffs.some((d) => d.startsWith("captureAnchor:"))).toBe(true);
    // Concretely: `machine` is dropped and the volatile `state` leaks in.
    expect(r.anchorA.fingerprint.dataAttrs).toStrictEqual({ machine: "player" });
    expect(r.anchorB.fingerprint.dataAttrs).toStrictEqual({ state: "playing.unmuted" });
    expect(r.anchorA.selectorPath).toBe('div[data-machine="player"]');
    expect(r.anchorB.selectorPath).toBe('div[data-state="playing.unmuted"]');
  });

  test("detects scoreCandidate divergence on the SAME fingerprint", () => {
    const dom = buildWatchDom();
    const fp = ORIGINAL.captureAnchor(asEl(dom.player), { x: 0, y: 0 }, "/w").fingerprint;

    // The original credits data-machine (1.0). The divergent engine treats
    // `machine` as volatile, so staticDataAttrs drops it, the fingerprint's
    // `machine` key matches nothing, and 0.3 of weight scores zero:
    //   (0*0.3 + 1*0.15 + 1*0.25) / 0.7 = 0.5714285714285714
    expect(ORIGINAL.scoreCandidate(asEl(dom.player), fp)).toBe(1);
    expect(EXTRACTED.scoreCandidate(asEl(dom.player), fp)).toBe(1);
    const divergentScore = DIVERGENT.scoreCandidate(asEl(dom.player), fp);
    expect(divergentScore).toBeCloseTo(0.5714285714285714, 12);
    expect(divergentScore).not.toBe(1);
  });

  test("detects resolveAnchor divergence — element vs null", () => {
    const dom = buildWatchDom();
    const r = runParity(ORIGINAL, DIVERGENT, {
      target: dom.player,
      root: dom.root,
      mutate: () => {
        // Destroy the text signal so data-* is what decides, then cycle the
        // volatile state the two engines disagree about.
        dom.playIcon.ownText = "zzz";
        dom.timeLabel.ownText = "qqq";
        setAttr(dom.player, "data-state", "ended");
      },
    });

    // Original: path hits via data-machine, score (0.3+0.15+0)/0.7 = 0.642... -> player.
    expect(r.resolvedA).toBe(asEl(dom.player));
    // Divergent: its path keyed on the now-stale data-state misses, and the scan
    // gets no data credit, so nothing clears the threshold -> null.
    expect(r.resolvedB).toBeNull();
    expect(r.diffs.some((d) => d.startsWith("resolveAnchor:"))).toBe(true);
    expect(r.diffs.some((d) => d.startsWith("scoreCandidate("))).toBe(true);
  });

  test("detects describeAnchor divergence", () => {
    // describeAnchor reads only an already-captured fingerprint, so it diverges
    // when (and only when) the captured fingerprint does: no text, data-* only.
    const target = el("div", { data: { machine: "widget", stable: "yes" } });
    const root = el("div", { class: "app-root" }).append(target);
    const r = runParity(ORIGINAL, DIVERGENT, { target, root });

    expect(r.diffs.some((d) => d.startsWith("describeAnchor:"))).toBe(true);
    expect(ORIGINAL.describeAnchor(r.anchorA)).toBe('div[data-machine="widget"]');
    expect(DIVERGENT.describeAnchor(r.anchorB)).toBe('div[data-stable="yes"]');
  });

  test("the comparator reports EVERY diverging surface, not just the first", () => {
    const dom = buildWatchDom();
    const r = runParity(ORIGINAL, DIVERGENT, {
      target: dom.player,
      root: dom.root,
      mutate: () => {
        dom.playIcon.ownText = "zzz";
        dom.timeLabel.ownText = "qqq";
        setAttr(dom.player, "data-state", "ended");
      },
    });
    const surfaces = new Set(r.diffs.map((d) => d.split(/[:(]/)[0]));
    expect([...surfaces].sort()).toEqual(["captureAnchor", "resolveAnchor", "scoreCandidate"]);
  });
});
