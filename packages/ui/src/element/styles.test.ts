/**
 * Gates on the shipped stylesheet — the things that make the package embeddable
 * rather than merely styled.
 *
 * The interesting one is the class-coverage scan: it reads the component sources
 * and fails if the markup uses a class the sheet does not define. That is the
 * check that would have caught the whole reason this file exists — the widget
 * used to lean on `.ms`, `.ghost`, `.icon-btn`, `.name-avatar` and friends that
 * lived in the HOST's global stylesheet and do not cross a shadow boundary.
 */

import { Glob } from "bun";
import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import { DOCKED_BREAKPOINT_PX } from "../breakpoints.ts";
import { DELETE_BUTTON_CLASS } from "../components/delete-confirm.ts";
import { FEEDBACK_WIDGET_CSS } from "./styles.ts";

const COMPONENTS_DIR = new URL("../components/", import.meta.url).pathname;

/**
 * Design tokens the widget reads out of the embedding page. Custom properties
 * inherit through a shadow root, so this list — and nothing else — is the
 * package's theming contract. Every one must be used with a fallback, which the
 * next test enforces; this list exists so ADDING a token is a deliberate,
 * reviewed change to that contract rather than a silent new requirement on the
 * host.
 */
const THEMING_TOKENS = [
  "--aqua-deep",
  "--bg",
  "--border",
  "--brand-gradient",
  "--divider",
  "--inverse-surface",
  "--link",
  "--r-md",
  "--r-pill",
  "--r-round",
  "--r-sm",
  "--sp-lg",
  "--sp-md",
  "--sp-sm",
  "--sp-xs",
  "--surface",
  "--surface-variant",
  "--text",
  "--text-inverse",
  "--text-secondary",
] as const;

/** Class names the markup applies through an expression rather than a literal,
 *  so the scanner below cannot see them. */
const DYNAMIC_CLASSES = [DELETE_BUTTON_CLASS];

/** Classes that are pure markup HOOKS — a stable name for a node so a test or a
 *  host can address it — and carry no styling of their own, here or in the
 *  stylesheet they came from. Listed rather than silently tolerated so that
 *  "this class has no rule" stays a decision instead of an oversight. */
const UNSTYLED_HOOK_CLASSES = ["feedback-item-anchor"];

/** Internal custom properties (`--fb-*`): this sheet both defines and consumes
 *  them, so they are not tokens the embedding page has to supply. */
const isInternal = (name: string) => name.startsWith("--fb-");

/** The `--fb-*` default palette, light and dark. */
const DEFAULT_PALETTE_TOKENS = THEMING_TOKENS.filter(
  (t) =>
    !t.startsWith("--r-") &&
    !t.startsWith("--sp-") &&
    t !== "--aqua-deep" &&
    t !== "--brand-gradient",
);

/** The `--fb-*` declarations in one `:host { … }` block, as name → value. */
function hostDefaults(block: string): Record<string, string> {
  return Object.fromEntries(
    [...block.matchAll(/(--fb-[\w-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]),
  );
}

/** WCAG 2.x contrast ratio of two `#rrggbb` colours. */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const s = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

/** Every component source, so the gates below can assert against real markup. */
function readComponentSources(opts: { excludeIcon?: boolean } = {}): string[] {
  const out: string[] = [];
  for (const file of new Glob("*.tsx").scanSync(COMPONENTS_DIR)) {
    if (opts.excludeIcon && file === "Icon.tsx") continue;
    out.push(readFileSync(COMPONENTS_DIR + file, "utf8"));
  }
  return out;
}

function readIconSource(): string {
  return readFileSync(COMPONENTS_DIR + "Icon.tsx", "utf8");
}

/**
 * Pull every class name the markup applies as a literal. Handles the three forms
 * the components actually use: `class="a b"`, `class={cond ? "a" : "b"}` (any
 * string literal inside the braces) and `classList={{ name: cond }}`.
 */
function literalClasses(source: string): string[] {
  const out: string[] = [];
  for (const m of source.matchAll(/class=(?:"([^"]*)"|\{([^}]*)\})/g)) {
    if (m[1]) out.push(...m[1].split(/\s+/));
    if (m[2]) for (const s of m[2].matchAll(/"([^"]+)"/g)) out.push(...s[1]!.split(/\s+/));
  }
  for (const m of source.matchAll(/classList=\{\{([^}]*)\}\}/g)) {
    for (const k of m[1]!.matchAll(/([A-Za-z_][\w-]*)\s*:/g)) out.push(k[1]!);
  }
  return out.filter(Boolean);
}

describe("shipped stylesheet", () => {
  test("defines every class the components apply", () => {
    const sources = readComponentSources();
    expect(sources.length).toBeGreaterThanOrEqual(7);

    const used = new Set(DYNAMIC_CLASSES);
    for (const source of sources) for (const c of literalClasses(source)) used.add(c);
    // Guard against the scanner silently matching nothing.
    expect(used.size).toBeGreaterThanOrEqual(30);
    for (const hook of UNSTYLED_HOOK_CLASSES) used.delete(hook);

    const missing = [...used].filter((c) => !FEEDBACK_WIDGET_CSS.includes(`.${c}`));
    expect(missing).toEqual([]);
  });

  test("re-declares the resets that do not cross the shadow boundary", () => {
    // box-sizing is the load-bearing one: the composer textarea, the pin popover
    // and every pill button size themselves assuming border-box.
    expect(FEEDBACK_WIDGET_CSS).toContain("box-sizing: border-box");
    expect(FEEDBACK_WIDGET_CSS).toMatch(/\nbutton \{[^}]*cursor: pointer/);
    expect(FEEDBACK_WIDGET_CSS).toMatch(/\na \{[^}]*text-decoration: none/);
    expect(FEEDBACK_WIDGET_CSS).toContain(":host { display: contents;");
  });

  test("sets its own text colour, so it never inherits the page's onto its own surfaces", () => {
    // `display: contents` means the host contributes no box, and the shadow tree
    // inherits `color` straight from the embedding page. Every surface here
    // paints `background: var(--bg, #ffffff)` — so a page that is light-on-dark
    // (or merely `color-scheme: light dark` with no colour of its own, under a
    // browser that prefers dark) put WHITE text on the WHITE panel. Measured in
    // a real browser: the item text and the panel background were both
    // rgb(255,255,255). The token still wins when the host defines one.
    expect(FEEDBACK_WIDGET_CSS).toMatch(/:host \{[^}]*color: var\(--text, var\(--fb-text\)\)/);
  });

  test("no surface paints a background without also owning its text colour", () => {
    // The rule that would have caught the above as a class rather than an
    // instance: if a selector sets --bg as its background it is a surface, and a
    // surface owes the text on it a colour. `:host` supplies that by
    // inheritance, so this asserts the inherited default exists at all.
    const paintsBg = FEEDBACK_WIDGET_CSS.includes("background: var(--bg, var(--fb-bg))");
    const ownsColor = /:host \{[^}]*color:/.test(FEEDBACK_WIDGET_CSS);
    expect(paintsBg && ownsColor).toBe(true);
  });

  test("carries no font, no network request and no host path assumption", () => {
    expect(FEEDBACK_WIDGET_CSS).not.toContain("@font-face");
    expect(FEEDBACK_WIDGET_CSS).not.toContain("/fonts/");
    expect(FEEDBACK_WIDGET_CSS).not.toContain("Material Symbols");
    expect(FEEDBACK_WIDGET_CSS).not.toContain('font-family: "');
    expect(FEEDBACK_WIDGET_CSS).not.toContain("url(");
    expect(FEEDBACK_WIDGET_CSS).not.toContain("@import");
  });

  test("every design token is used with a fallback", () => {
    // var(--x) with no comma = a hard requirement on the host's :root, which is
    // exactly what an embeddable widget must not have.
    const withoutFallback = [...FEEDBACK_WIDGET_CSS.matchAll(/var\(\s*(--[\w-]+)\s*\)/g)]
      .map((m) => m[1]!)
      .filter((name) => !isInternal(name));
    expect([...new Set(withoutFallback)]).toEqual([]);
  });

  test("depends on exactly the documented token set", () => {
    const used = new Set(
      [...FEEDBACK_WIDGET_CSS.matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1]!),
    );
    for (const name of used) if (isInternal(name)) used.delete(name);
    expect([...used].sort()).toEqual([...THEMING_TOKENS]);
  });

  test("ships a light and a dark default for every colour token, and both are readable", () => {
    // Light on :host, dark on :host inside the prefers-color-scheme block. A
    // colour token missing from either set would fall through to nothing.
    const darkBlock = /@media \(prefers-color-scheme: dark\) \{\s*:host \{([^}]*)\}/.exec(
      FEEDBACK_WIDGET_CSS,
    )?.[1];
    const lightBlock = [
      ...FEEDBACK_WIDGET_CSS.matchAll(/\n:host \{([^}]*--fb-bg[^}]*)\}/g),
    ][0]?.[1];
    expect(darkBlock).toBeDefined();
    expect(lightBlock).toBeDefined();
    const expected = DEFAULT_PALETTE_TOKENS.map((t) => t.replace("--", "--fb-")).sort();
    for (const block of [lightBlock!, darkBlock!]) {
      const d = hostDefaults(block);
      expect(Object.keys(d).sort()).toEqual(expected);
      // The pairs the widget actually paints together, at WCAG AA for body text.
      expect(contrast(d["--fb-text"]!, d["--fb-bg"]!)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(d["--fb-text"]!, d["--fb-surface-variant"]!)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(d["--fb-text-secondary"]!, d["--fb-bg"]!)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(d["--fb-text-inverse"]!, d["--fb-inverse-surface"]!)).toBeGreaterThanOrEqual(
        4.5,
      );
      expect(contrast(d["--fb-link"]!, d["--fb-bg"]!)).toBeGreaterThanOrEqual(4.5);
    }
  });

  test("the docked breakpoint comes from the shared constant", () => {
    expect(FEEDBACK_WIDGET_CSS).toContain(`@media (min-width: ${DOCKED_BREAKPOINT_PX}px)`);
    // …and only from it: no other literal min-width can sneak back in.
    const breakpoints = [...FEEDBACK_WIDGET_CSS.matchAll(/min-width:\s*(\d+)px/g)].map((m) =>
      Number(m[1]),
    );
    expect([...new Set(breakpoints)]).toEqual([DOCKED_BREAKPOINT_PX]);
  });
});

describe("icons", () => {
  test("no component renders an icon-font ligature any more", () => {
    // Icon.tsx is excluded on purpose: its header quotes the old ligature markup
    // to explain what replaced it.
    for (const source of readComponentSources({ excludeIcon: true })) {
      expect(source).not.toContain('<span class="ms">');
    }
  });

  test("every glyph the components ask for has path data", () => {
    const iconSource = readIconSource();
    const names = new Set<string>();
    for (const source of readComponentSources()) {
      for (const m of source.matchAll(/<Icon name=(?:"([^"]+)"|\{[^}]*\})/g)) {
        if (m[1]) names.add(m[1]);
      }
      // Badge picks its glyph with a ternary.
      for (const m of source.matchAll(/<Icon name=\{[^}]*\}/g)) {
        for (const s of m[0].matchAll(/"([a-z_]+)"/g)) names.add(s[1]!);
      }
    }
    expect([...names].sort()).toEqual([
      "add",
      "chat_bubble",
      "close",
      "delete",
      "list_alt",
      "send",
    ]);
    for (const name of names) {
      expect(iconSource).toContain(`${name}:`);
    }
  });

  test("icons are sized by font-size so the existing rules keep working", () => {
    expect(FEEDBACK_WIDGET_CSS).toMatch(/\.ms \{[^}]*width: 1em/);
    expect(FEEDBACK_WIDGET_CSS).toMatch(/\.ms \{[^}]*fill: currentColor/);
    expect(FEEDBACK_WIDGET_CSS).toContain(".feedback-badge .ms { font-size: 26px; }");
  });

  test("icons are hidden from assistive tech, since their buttons carry labels", () => {
    expect(readIconSource()).toContain('aria-hidden="true"');
  });
});
