/**
 * Choosing where the comments go, for the build that contains both answers.
 *
 * The decision is made once, at load, from values a page can set. Both halves
 * are here: picking between the two (`resolveMode`) and finding what the page
 * said (`readModeInputs`). The second half exists because the obvious way to
 * write it does not work — see the currentScript test.
 */

import { describe, expect, test } from "bun:test";
import { readModeInputs, resolveMode, type ModeDocument } from "./mode.ts";

/** The two lookups `readModeInputs` performs, as a hand-rolled fake — there is
 *  no jsdom/happy-dom in this repo. */
function fakeDocument(
  found: Record<string, { getAttribute: (name: string) => string | null } | null>,
  currentScript: { dataset: { mode?: string } } | null = null,
): ModeDocument {
  return {
    currentScript,
    querySelector: (selector: string) => found[selector] ?? null,
  };
}

function element(attributes: Record<string, string>) {
  return { getAttribute: (name: string) => attributes[name] ?? null };
}

describe("resolveMode", () => {
  test("defaults to the server, because that is the shared answer", () => {
    expect(resolveMode({})).toBe("server");
  });

  test("the script tag's data-mode wins", () => {
    expect(resolveMode({ script: "client" })).toBe("client");
    expect(resolveMode({ script: "server" })).toBe("server");
  });

  test("`lite` is accepted as the package's own name for client", () => {
    expect(resolveMode({ script: "lite" })).toBe("client");
  });

  test("a mode attribute on the first widget is honoured", () => {
    expect(resolveMode({ element: "client" })).toBe("client");
  });

  test("the script tag outranks the element — one page, one answer", () => {
    expect(resolveMode({ script: "server", element: "client" })).toBe("server");
  });

  test("an unknown value is refused rather than silently treated as lite", () => {
    expect(() => resolveMode({ script: "indexeddb" })).toThrow("indexeddb");
  });

  test("an empty attribute is the same as not writing one", () => {
    expect(resolveMode({ script: "", element: null })).toBe("server");
  });
});

describe("readModeInputs", () => {
  test("finds data-mode on a module script, where currentScript is null", () => {
    // `document.currentScript` is null inside a module — always, by spec. The
    // bundle this file serves IS a module, so reading only currentScript finds
    // nothing and every page silently gets the default. Measured on a page that
    // asked for lite and wrote to the server.
    const doc = fakeDocument({ "script[data-mode]": element({ "data-mode": "lite" }) }, null);
    expect(readModeInputs(doc).script).toBe("lite");
  });

  test("still honours currentScript when there is one", () => {
    const doc = fakeDocument({}, { dataset: { mode: "lite" } });
    expect(readModeInputs(doc).script).toBe("lite");
  });

  test("reads mode from the first widget that has one", () => {
    const doc = fakeDocument({ "fusen-widget[mode]": element({ mode: "lite" }) });
    expect(readModeInputs(doc).element).toBe("lite");
  });

  test("says nothing when the page said nothing", () => {
    expect(readModeInputs(fakeDocument({}))).toEqual({ script: null, element: null });
  });

  test("what it reads is what resolveMode decides on", () => {
    const doc = fakeDocument({ "script[data-mode]": element({ "data-mode": "client" }) });
    expect(resolveMode(readModeInputs(doc))).toBe("client");
  });
});
