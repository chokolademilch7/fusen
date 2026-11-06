/**
 * Acceptance tests for the React example.
 *
 * What we want to confirm: "on a React page that loads the one prebuilt fusen-lite.js,
 * pin -> post -> still there after reload works in a real browser".
 * There is no server and storage is IndexedDB, so reload is the only proof of persistence.
 */

import { expect, test, type Page } from "@playwright/test";

const BODY = "The deadline wording does not match reality";

declare global {
  // The read hook the page exposes. Importing @fusen/lite's types would stop the
  // example from being "reads only the one prebuilt file", so declare only the
  // minimum used here.
  interface Window {
    __fusen?: {
      version: number;
      dump: () => Promise<{ body: string }[]>;
      count: () => Promise<number>;
      clear: () => Promise<void>;
    };
    /** Control hook App.tsx exposes for tests. */
    exampleControls?: { hideBody: (body: string | undefined) => void };
  }
}

/** The widget host element. State is reflected in light DOM data-* attributes. */
const host = (page: Page) => page.locator("fusen-widget");

/** The custom element has upgraded = data-machine is set. */
async function waitForUpgrade(page: Page) {
  await expect(host(page)).toHaveAttribute("data-machine", "feedback");
}

/**
 * While picking, a full-screen overlay takes pointer events, so locator.click()
 * stalls on "intercepts pointer events". Click by coordinates through the overlay.
 */
async function clickThroughOverlay(page: Page, selector: string) {
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`no bounding box: ${selector}`);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

async function enterFeedbackMode(page: Page) {
  await page.getByRole("button", { name: "Start feedback mode" }).click();
  await expect(host(page)).toHaveAttribute("data-state", "mode.picking");
}

/**
 * Write one note. **Do not re-enter the mode if already in it.**
 *
 * After a post the machine returns to `idle` (sending closes the mode by design), so
 * the second note re-enters. Pins are only drawn in the mode, so re-enter before looking at pins.
 */
async function addComment(page: Page, body: string, selector = "#deadline p") {
  if ((await host(page).getAttribute("data-state")) === "idle") await enterFeedbackMode(page);
  await clickThroughOverlay(page, selector);
  await expect(host(page)).toHaveAttribute("data-state", "mode.composing");
  await page.getByPlaceholder("What should change here?").fill(body);
  await page.getByRole("button", { name: "Post", exact: true }).click();
  await expect(host(page)).toHaveAttribute("data-state", "idle");
}

/**
 * Check that the pin shows up **over the tapped element**.
 *
 * Counting alone only says "something got drawn once"; it cannot tell which element
 * the pin is tied to, or whether re-anchoring found the right target. Position covers both.
 */
async function expectPinOver(page: Page, selector: string) {
  const target = await page.locator(selector).boundingBox();
  if (!target) throw new Error(`no bounding box: ${selector}`);
  const pin = await page.locator(".feedback-pin").boundingBox();
  if (!pin) throw new Error("no pin rendered");

  // Allow slack of one pin height. The pin centers itself on the target's center, so it
  // sticks out when the target is shorter than the pin (measured: on a 24px one-line
  // paragraph the center sat 2px above). A regression that pins the neighbouring element
  // is usually off by tens of px, so this slack still catches it.
  const slack = pin.height;
  const center = { x: pin.x + pin.width / 2, y: pin.y + pin.height / 2 };
  expect(center.x).toBeGreaterThanOrEqual(target.x - slack);
  expect(center.x).toBeLessThanOrEqual(target.x + target.width + slack);
  expect(center.y).toBeGreaterThanOrEqual(target.y - slack);
  expect(center.y).toBeLessThanOrEqual(target.y + target.height + slack);
}

/**
 * Hide the comment whose body is `body`. **Do not set hideItem on the element directly.**
 *
 * We want to change App's state and watch React re-render and pass the `hideItem` property
 * to the element. Assigning it to the element here would stay green even if React's handoff broke.
 */
async function hideBody(page: Page, body: string | undefined) {
  await page.waitForFunction(() => Boolean(window.exampleControls));
  await page.evaluate((b) => window.exampleControls!.hideBody(b), body);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  // clear() can only be called through window.__fusen, so wait until the module has run
  // and the bridge exists. Calling it without waiting makes ?. a silent no-op, and the
  // next test runs with the previous test's comments still there.
  await waitForUpgrade(page);
  await page.evaluate(() => window.__fusen?.clear());
  await page.reload();
  await waitForUpgrade(page);
});

test("the custom element upgrades and starts in idle", async ({ page }) => {
  await expect(host(page)).toHaveAttribute("data-machine", "feedback");
  await expect(host(page)).toHaveAttribute("data-state", "idle");
});

test("entering the mode waits for a pick", async ({ page }) => {
  await enterFeedbackMode(page);
  await expect(page.getByText("Tap the spot you want to comment on")).toBeVisible();
});

test("tapping a paragraph through the overlay moves on to input", async ({ page }) => {
  await enterFeedbackMode(page);
  await clickThroughOverlay(page, "#deadline p");
  await expect(host(page)).toHaveAttribute("data-state", "mode.composing");
});

test("posting puts a pin over the tapped paragraph", async ({ page }) => {
  await addComment(page, BODY);
  await enterFeedbackMode(page);
  await expect(page.locator(".feedback-pin")).toHaveCount(1);
  await expectPinOver(page, "#deadline p");
});

test("two notes on separate paragraphs put a pin over each", async ({ page }) => {
  // With only one note, you cannot observe that pins are per **cluster**, not per item,
  // nor the panel order, nor that actions hit the right row.
  await addComment(page, "The overview wording is stiff", "#overview p");
  await addComment(page, "The deadline text is too small", "#deadline p");
  await enterFeedbackMode(page);

  await expect(page.locator(".feedback-pin")).toHaveCount(2);

  await page.getByRole("button", { name: "Open the feedback list" }).click();
  const texts = await page.locator(".feedback-item-text").allInnerTexts();
  expect(texts[0]).toContain("The deadline text is too small");
  expect(texts[1]).toContain("The overview wording is stiff");
});

test("leaving the mode removes the overlay and the page is usable again", async ({ page }) => {
  // The worst way a library can break is "holding the host page hostage".
  // If the overlay never comes off, the host's clicks are swallowed forever.
  await enterFeedbackMode(page);
  await page.getByRole("button", { name: "End feedback mode" }).click();
  await expect(host(page)).toHaveAttribute("data-state", "idle");
  // Still in the mode, this fails with "intercepts pointer events".
  await page.locator("#deadline p").click({ timeout: 5000 });
});

test("cancelling the draft returns to picking and adds no pin", async ({ page }) => {
  await enterFeedbackMode(page);
  await clickThroughOverlay(page, "#deadline p");
  await expect(host(page)).toHaveAttribute("data-state", "mode.composing");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(host(page)).toHaveAttribute("data-state", "mode.picking");
  await expect(page.locator(".feedback-pin")).toHaveCount(0);
});

test("the list panel shows the posted body", async ({ page }) => {
  await addComment(page, BODY);
  await page.getByRole("button", { name: "Open the feedback list" }).click();
  await expect(page.getByText(BODY)).toBeVisible();
});

test("the pin stays in the same place after reload (it is in IndexedDB)", async ({ page }) => {
  await addComment(page, BODY);

  await page.reload();
  await waitForUpgrade(page);
  // Pins are only drawn in the mode, so zero right after reload is correct.
  await expect(page.locator(".feedback-pin")).toHaveCount(0);
  await enterFeedbackMode(page);
  await expect(page.locator(".feedback-pin")).toHaveCount(1);
  // A count only says "it resolved". Position tells whether it found the right target.
  await expectPinOver(page, "#deadline p");
});

test("window.__fusen exposes the full set of members", async ({ page }) => {
  // External tools (CDP / MCP) read through this hook alone. The point is to check its **shape**.
  const members = await page.evaluate(() =>
    Object.keys(window.__fusen as unknown as Record<string, unknown>).sort(),
  );
  expect(members).toEqual(["clear", "count", "dump", "identity", "routes", "version"]);
});

test("window.__fusen returns its contents to external tools", async ({ page }) => {
  await addComment(page, BODY);

  const read = await page.evaluate(async () => ({
    version: window.__fusen!.version,
    count: await window.__fusen!.count(),
    bodies: (await window.__fusen!.dump()).map((item) => item.body),
  }));

  expect(read.version).toBe(1);
  expect(read.count).toBe(1);
  expect(read.bodies).toEqual([BODY]);
});

test("a comment hidden by hideItem leaves the list, and comes back when it is unhidden", async ({
  page,
}) => {
  const kept = "The overview wording is stiff";
  const hidden = "The deadline text is too small";
  await addComment(page, kept, "#overview p");
  await addComment(page, hidden, "#deadline p");
  await page.getByRole("button", { name: "Open the feedback list" }).click();
  await expect(page.getByText(hidden)).toBeVisible();

  await hideBody(page, hidden);
  await expect(page.getByText(hidden)).toHaveCount(0);
  await expect(page.getByText(kept)).toBeVisible();

  await hideBody(page, undefined);
  await expect(page.getByText(hidden)).toBeVisible();
});

test("a comment hidden by hideItem loses its pin too, and gets it back when unhidden", async ({
  page,
}) => {
  const kept = "The overview wording is stiff";
  const hidden = "The deadline text is too small";
  await addComment(page, kept, "#overview p");
  await addComment(page, hidden, "#deadline p");

  // Enter the mode first, to see whether **already drawn** pins follow the prop change.
  await enterFeedbackMode(page);
  await expect(page.locator(".feedback-pin")).toHaveCount(2);

  await hideBody(page, hidden);
  await expect(page.locator(".feedback-pin")).toHaveCount(1);
  await expectPinOver(page, "#overview p");

  await hideBody(page, undefined);
  await expect(page.locator(".feedback-pin")).toHaveCount(2);
});
