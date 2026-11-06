#!/usr/bin/env bun
/**
 * Does a real browser accept the tools `@fusen/lite` registers?
 *
 * WHY THIS IS NOT A `bun test`. `webmcp.test.ts` registers against a fake
 * `ModelContext`, and a fake accepts whatever shape the code invents. Two things
 * it therefore cannot check are exactly the two that break silently:
 *
 *   - whether `execute` resolving to `{content:[{type,text}]}` is the shape the
 *     browser wants, or something adjacent that it rejects
 *   - whether `document.modelContext` is where the API actually is
 *
 * Both are read off the spec IDL in `webmcp.ts`. A spec is not a browser, so
 * this asks the browser.
 *
 * WHY IT IS NOT IN `verify` EITHER. It needs Chrome 149-156 with the origin
 * trial flag, which is a machine-specific precondition — the same reason
 * `read-via-cdp.ts` is a script and not a test. `bun run verify` has to pass
 * anywhere, so a check that can only pass on one browser would either fail
 * honest runs or be skipped into meaninglessness. Run this by hand when
 * touching `webmcp.ts`, and record the Chrome version in the PR.
 *
 *     bun run scripts/check-webmcp.ts
 *     bun run scripts/check-webmcp.ts --json
 *
 * Exit codes: 0 the browser saw the tools and ran them, 3 this browser has no
 * WebMCP (wrong version, or the flag is off), 4 the tools registered but did not
 * behave. The three need different fixes, and one generic non-zero would make
 * the caller guess.
 */

import { chromium } from "@playwright/test";
import { copyFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { WEBMCP_TOOL_NAMES } from "../packages/lite/src/webmcp.ts";

const REPO = dirname(import.meta.dirname);
const BUNDLE = join(REPO, "packages/lite/dist/fusen-lite.js");
const PORT = 8577;
const BODY = "Body readable through webmcp";
const asJson = process.argv.includes("--json");

/**
 * A page with the opt-in on it, built from the SHIPPED bundle rather than from
 * source. What is checked has to be what a host would actually load — a source
 * import would pass while a broken build shipped.
 */
function servePage(): { url: string; quietUrl: string; elementUrl: string; stop: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "fusen-webmcp-"));
  copyFileSync(BUNDLE, join(dir, "fusen-lite.js"));
  const html = (onScript: string, onElement: string) =>
    `<!doctype html><meta charset="utf-8"><title>webmcp check</title>
<p id="target">a paragraph to pin a comment to</p>
<script type="module" src="./fusen-lite.js"${onScript}></script>
<fusen-widget route="/"${onElement}></fusen-widget>`;
  writeFileSync(join(dir, "index.html"), html(" data-webmcp", ""));
  // The same page without the opt-in. Checking that this one publishes NOTHING
  // is the half that matters: a default that silently exposed the comments
  // would look identical to a working feature from every angle but this one.
  writeFileSync(join(dir, "quiet.html"), html("", ""));
  // The other documented spelling. It reads the element rather than the script
  // tag, which is a different code path and has only ever been checked against
  // a fake document.
  writeFileSync(join(dir, "element.html"), html("", " webmcp"));

  const server = Bun.serve({
    port: PORT,
    async fetch(request) {
      const path = new URL(request.url).pathname;
      const file = Bun.file(join(dir, path === "/" ? "index.html" : path.slice(1)));
      // A 404, not a missing `Bun.file`: Chrome asks for /favicon.ico, and an
      // unreadable file throws in the server, which made a passing run exit 1.
      return (await file.exists()) ? new Response(file) : new Response(null, { status: 404 });
    },
  });
  // localhost, not a LAN address: `document.modelContext` is `[SecureContext]`,
  // and plain http anywhere else would make this fail for a reason that has
  // nothing to do with the code under test.
  return {
    url: `http://localhost:${PORT}/`,
    quietUrl: `http://localhost:${PORT}/quiet.html`,
    elementUrl: `http://localhost:${PORT}/element.html`,
    stop: () => server.stop(true),
  };
}

function fail(code: 3 | 4, message: string): never {
  console.error(message);
  process.exit(code);
}

const site = servePage();
const browser = await chromium.launch({ args: ["--enable-features=WebMCPTesting"] });
const page = await browser.newPage();
const pageErrors: string[] = [];
page.on("pageerror", (error) => pageErrors.push(String(error)));

try {
  await page.goto(site.url);
  await page.waitForFunction(() => Boolean((globalThis as { __fusen?: unknown }).__fusen));

  // One real comment, written through the widget. Without it every assertion
  // below would pass against an empty store and prove nothing — the tools would
  // be "working" in the sense that they return no data.
  await page.getByLabel("Start feedback mode").click();
  const box = await page.locator("#target").boundingBox();
  if (!box) fail(4, "the target paragraph has no box — the page did not render");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.getByPlaceholder("What should change here?").fill(BODY);
  await page.getByRole("button", { name: "Post", exact: true }).click();
  // Poll from here, not with `waitForFunction`. Its predicate is checked for
  // truthiness WITHOUT being awaited, so an async predicate returns a Promise —
  // always truthy — and the "wait" passes before the save lands. That raced the
  // tool calls below against the write and failed about one run in three with
  // `total: 0`, while a later call in the same run saw the comment.
  const saved = Date.now() + 5000;
  while ((await page.evaluate(() => (globalThis as any).__fusen.count())) !== 1) {
    if (Date.now() > saved) fail(4, "the comment was not saved within 5s of posting it");
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  const seen = await page.evaluate(async () => {
    const modelContext = (document as any).modelContext ?? (navigator as any).modelContext ?? null;
    if (!modelContext) return null;

    // Registration is async and starts at module load; the widget being up does
    // not mean it has resolved.
    for (let attempt = 0; attempt < 20; attempt++) {
      const tools = await modelContext.getTools();
      if (tools.length > 0) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    const tools = await modelContext.getTools();

    const call = async (name: string, input: unknown) => {
      const tool = tools.find((candidate: any) => candidate.name === name);
      if (!tool) return { error: `not registered: ${name}` };
      const result = await modelContext.executeTool(tool, JSON.stringify(input));
      // The browser hands back what `execute` resolved to. Reading the text out
      // here is the assertion that the content-block shape survived the trip.
      const parsed = typeof result === "string" ? JSON.parse(result) : result;
      return { text: parsed?.content?.[0]?.text ?? null, raw: parsed };
    };

    return {
      where: (document as any).modelContext ? "document" : "navigator",
      names: tools.map((tool: any) => tool.name).sort(),
      annotations: tools.map((tool: any) => tool.annotations),
      list: await call("fusen_list_feedback", {}),
      get: await call("fusen_get_feedback", { id: 1 }),
      missing: await call("fusen_get_feedback", { id: 99 }),
      routes: await call("fusen_summarize_routes", {}),
    };
  });

  if (pageErrors.length > 0) fail(4, `the page threw:\n  ${pageErrors.join("\n  ")}`);

  if (!seen) {
    const version = browser.version();
    fail(
      3,
      `This browser has no WebMCP: neither document.modelContext nor navigator.modelContext ` +
        `exists (Chrome ${version}).\n` +
        `It is an origin trial in Chrome 149-156. Enable chrome://flags/#enable-webmcp-testing, ` +
        `or run this against a browser in that range.`,
    );
  }

  const expected = [...WEBMCP_TOOL_NAMES].sort();
  if (JSON.stringify(seen.names) !== JSON.stringify(expected)) {
    fail(4, `the browser sees ${JSON.stringify(seen.names)}, expected ${JSON.stringify(expected)}`);
  }
  if (!seen.annotations.every((a: any) => a?.untrustedContentHint && a?.readOnlyHint)) {
    fail(4, `annotations did not survive registration: ${JSON.stringify(seen.annotations)}`);
  }
  if (typeof seen.list.text !== "string" || !seen.list.text.includes(BODY)) {
    fail(4, `fusen_list_feedback did not return the comment: ${JSON.stringify(seen.list)}`);
  }
  if (typeof seen.get.text !== "string" || !seen.get.text.includes("selectorPath")) {
    fail(4, `fusen_get_feedback did not return the anchor: ${JSON.stringify(seen.get)}`);
  }
  if (typeof seen.missing.text !== "string" || !seen.missing.text.includes("not found")) {
    // A missing id must ANSWER. If it threw, the browser would surface a
    // protocol error and an agent would read the tool as broken.
    fail(4, `a missing id did not answer: ${JSON.stringify(seen.missing)}`);
  }
  if (typeof seen.routes.text !== "string" || !seen.routes.text.includes('"count": 1')) {
    fail(4, `fusen_summarize_routes did not count the comment: ${JSON.stringify(seen.routes)}`);
  }

  /** What a freshly loaded page ends up publishing. */
  const namesOn = async (url: string): Promise<string[]> => {
    const other = await browser.newPage();
    await other.goto(url);
    await other.waitForFunction(() => Boolean((globalThis as { __fusen?: unknown }).__fusen));
    const names = await other.evaluate(async () => {
      const modelContext = (document as any).modelContext;
      // A fixed wait, not a poll-until-found: on the page that should publish
      // nothing, "nothing yet" would otherwise pass as "nothing".
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return (await modelContext.getTools()).map((tool: any) => tool.name).sort();
    });
    await other.close();
    return names;
  };

  const quietNames = await namesOn(site.quietUrl);
  if (quietNames.length > 0) {
    fail(4, `a page WITHOUT data-webmcp published tools: ${JSON.stringify(quietNames)}`);
  }

  const elementNames = await namesOn(site.elementUrl);
  if (JSON.stringify(elementNames) !== JSON.stringify(expected)) {
    fail(
      4,
      `<fusen-widget webmcp> published ${JSON.stringify(elementNames)}, ` +
        `expected ${JSON.stringify(expected)}`,
    );
  }

  if (asJson) {
    console.log(JSON.stringify({ browser: browser.version(), ...seen }, null, 2));
  } else {
    console.log(`✓ ${browser.version()} — ${seen.where}.modelContext`);
    for (const name of seen.names) console.log(`  ✓ ${name}`);
    console.log(`  ✓ payloads carry the comment, the anchor, and the count`);
    console.log(`  ✓ a missing id answers instead of throwing`);
    console.log(`  ✓ the same page without data-webmcp publishes nothing`);
    console.log(`  ✓ <fusen-widget webmcp> publishes the same three`);
  }
} finally {
  await browser.close();
  site.stop();
}
