/**
 * Which storage this page uses, for the build that ships both.
 *
 * The widget never changed to make this possible: "where do comments go" and
 * "how do updates arrive" have always been injected (`configureFusenWidget`),
 * and lite is one pair of implementations while the fetch/EventSource default
 * is the other. This module only picks between them.
 *
 * READ ONCE, AT LOAD. The choice configures a process-wide runtime — one shared
 * item list, one realtime connection — so it cannot be per element, and
 * re-reading it later would mean two storages disagreeing about the same page.
 * Editing the attribute afterwards (in devtools, say) therefore changes
 * nothing, which is also why it grants nothing: the attribute selects a
 * destination, and the server remains the only authority on what may be written
 * or deleted there.
 */

/**
 * `client` = the comments live in this browser. `server` = they live where
 * everyone can see them. The pair names WHERE THE DATA IS, which is the choice
 * a page is actually making; "lite" named the build instead, and a reader of
 * `data-mode="lite"` could not tell what it bought.
 */
export type FusenMode = "client" | "server";

export type ModeInputs = {
  /** `data-mode` on the script tag that loaded this bundle. */
  script?: string | null;
  /** `mode` on the first `<fusen-widget>` present at load. */
  element?: string | null;
};

function asMode(value: string): FusenMode {
  if (value === "client" || value === "server") return value;
  // The package that implements the client side is called `@fusen/lite`, so
  // that word will be typed. Accepting it costs a line and saves a page that
  // silently stored its comments in the wrong place.
  if (value === "lite") return "client";
  throw new Error(`unknown fusen mode: ${value} (expected "client" or "server")`);
}

/**
 * The script tag outranks the element, and the default is `server` — the mode
 * where other people can see what was written. `lite` keeps comments in one
 * browser, which is a deliberate choice and should have to be typed.
 */
export function resolveMode(inputs: ModeInputs): FusenMode {
  const declared = inputs.script || inputs.element;
  return declared ? asMode(declared) : "server";
}

/** The parts of `document` this needs, so the lookup can be tested without one. */
export type ModeDocument = {
  currentScript: { dataset: { mode?: string } } | null;
  querySelector: (selector: string) => { getAttribute: (name: string) => string | null } | null;
};

/**
 * Find what the page said.
 *
 * `document.currentScript` is NULL inside a module — always, per spec — and the
 * bundle that calls this is a module. Reading only `currentScript` therefore
 * finds nothing, and a page that asked for `lite` silently gets the server
 * instead: comments land in a database the author never set up. So the script
 * tag is located by attribute, and `currentScript` is kept only for the case
 * where a classic script imported this.
 */
export function readModeInputs(doc: ModeDocument): ModeInputs {
  const fromCurrent = doc.currentScript?.dataset.mode ?? null;
  const tagged = fromCurrent ? null : doc.querySelector("script[data-mode]");
  const widget = doc.querySelector("fusen-widget[mode]");
  return {
    script: fromCurrent ?? tagged?.getAttribute("data-mode") ?? null,
    element: widget?.getAttribute("mode") ?? null,
  };
}
