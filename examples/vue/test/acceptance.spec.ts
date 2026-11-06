/**
 * Acceptance tests that check end to end, in a real browser, that the Vue example really works.
 *
 * What they check is "the lite widget behaves the same on Vue as on plain HTML";
 * the widget's full spec lives in the package's unit tests.
 */

import { expect, test, type Page } from "@playwright/test";

/** The read hatch the page exposes. External tools may rely on this shape alone. */
type FusenBridge = {
  version: number;
  dump: () => Promise<{ body: string }[]>;
  count: () => Promise<number>;
  clear: () => Promise<void>;
};

/**
 * `Window` is not extended with `declare global` because it would clash with the other examples' test declarations.
 * Functions passed to page.evaluate run in the browser, so this type is only used for casts.
 */
type FusenWindow = { __fusen?: FusenBridge };

/** Control hook App.vue exposes for tests. */
type ExampleWindow = { exampleControls?: { hideBody: (body: string | undefined) => void } };

const BODY = "Let's settle here what happens when the approver is away";

const widget = (page: Page) => page.locator("fusen-widget");

/**
 * While picking, the screen is covered by the widget's full-screen overlay, and
 * locator.click() stalls on "intercepts pointer events".
 * Firing a raw mouse event at coordinates is the only way to reach the element underneath.
 */
async function clickThroughOverlay(page: Page, selector: string) {
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`no bounding box for ${selector}`);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

async function enterMode(page: Page) {
  await page.getByRole("button", { name: "Start feedback mode" }).click();
  await expect(widget(page)).toHaveAttribute("data-state", "mode.picking");
}

/** A paragraph in the section without an id = the target that shows anchors do not rely on ids. */
const TARGET = "section:not([id]) p";

/**
 * Write one note. **Do not re-enter the mode if already in it.**
 *
 * After a post it returns to `idle` (sending closes the mode by design), so the second note re-enters.
 * Pins are only drawn in the mode, so re-enter before looking at pins.
 */
async function leaveOneComment(page: Page, body: string, selector = TARGET) {
  if ((await widget(page).getAttribute("data-state")) === "idle") await enterMode(page);
  await clickThroughOverlay(page, selector);
  await expect(widget(page)).toHaveAttribute("data-state", "mode.composing");
  await page.getByPlaceholder("What should change here?").fill(body);
  await page.getByRole("button", { name: "Post", exact: true }).click();
  // A finished post returns to idle. Without this check, a machine stuck in submitting
  // would go unnoticed (pins are drawn when !idle).
  await expect(widget(page)).toHaveAttribute("data-state", "idle");
}

/**
 * The pin shows up **over the tapped element**.
 *
 * A count alone only says "something got drawn once". The slack is one pin height because
 * the pin centers itself on the target's center (it sticks out when the target is shorter
 * than the pin; measured 2px). A regression that pins the neighbouring element is off by tens of px, so it is still caught.
 */
async function expectPinOver(page: Page, selector: string) {
  const target = await page.locator(selector).boundingBox();
  if (!target) throw new Error(`no bounding box for ${selector}`);
  const pin = await page.locator(".feedback-pin").boundingBox();
  if (!pin) throw new Error("no pin rendered");
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
 * We want to change App's ref and watch Vue re-render and pass the `hideItem` property
 * to the element. Assigning it to the element here would stay green even if Vue's handoff broke.
 */
async function hideBody(page: Page, body: string | undefined) {
  await page.waitForFunction(() => Boolean((window as unknown as ExampleWindow).exampleControls));
  await page.evaluate(
    (b) => (window as unknown as ExampleWindow).exampleControls!.hideBody(b),
    body,
  );
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  // __fusen appears only after the module has loaded. Swallowing it with `?.` means a
  // missed clear goes unnoticed and the next test runs on a dirty DB.
  await page.waitForFunction(() => Boolean((window as unknown as FusenWindow).__fusen));
  await page.evaluate(() => (window as unknown as FusenWindow).__fusen!.clear());
  await page.reload();
  await expect(widget(page)).toHaveAttribute("data-state", "idle");
});

test("boots as a custom element and starts in idle", async ({ page }) => {
  await expect(widget(page)).toHaveAttribute("data-machine", "feedback");
  await expect(widget(page)).toHaveAttribute("data-state", "idle");
});

test("entering the mode waits for a pick", async ({ page }) => {
  await enterMode(page);
  await expect(page.getByText("Tap the spot you want to comment on")).toBeVisible();
});

test("pointing at a paragraph through the overlay moves to composing", async ({ page }) => {
  await enterMode(page);
  await clickThroughOverlay(page, TARGET);
  await expect(widget(page)).toHaveAttribute("data-state", "mode.composing");
});

test("posting puts a pin over the tapped paragraph", async ({ page }) => {
  await leaveOneComment(page, BODY);
  await enterMode(page);
  await expect(page.locator(".feedback-pin")).toHaveCount(1);
  await expectPinOver(page, TARGET);
});

test("two notes on separate paragraphs show two pins", async ({ page }) => {
  // With only one note, you cannot observe that pins are per **cluster**, not per item,
  // nor the panel order.
  await leaveOneComment(page, "The overview wording needs polish", "#overview p");
  await leaveOneComment(page, "The schedule wording is confusing", "#schedule p");
  await enterMode(page);

  await expect(page.locator(".feedback-pin")).toHaveCount(2);

  await page.getByRole("button", { name: "Open the feedback list" }).click();
  const texts = await page.locator(".feedback-item-text").allInnerTexts();
  expect(texts[0]).toContain("The schedule wording is confusing");
  expect(texts[1]).toContain("The overview wording needs polish");
});

test("leaving the mode removes the overlay and the page is usable again", async ({ page }) => {
  // The worst way a library can break is "holding the host page hostage".
  // If the overlay never comes off, the host's clicks are swallowed forever.
  await enterMode(page);
  await page.getByRole("button", { name: "End feedback mode" }).click();
  await expect(widget(page)).toHaveAttribute("data-state", "idle");
  // Still in the mode, this fails with "intercepts pointer events".
  await page.locator("#overview p").click({ timeout: 5000 });
});

test("cancelling the draft returns to picking and adds no pin", async ({ page }) => {
  await enterMode(page);
  await clickThroughOverlay(page, TARGET);
  await expect(widget(page)).toHaveAttribute("data-state", "mode.composing");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(widget(page)).toHaveAttribute("data-state", "mode.picking");
  await expect(page.locator(".feedback-pin")).toHaveCount(0);
});

test("the list shows the posted body", async ({ page }) => {
  await enterMode(page);
  await leaveOneComment(page, BODY);
  await page.getByRole("button", { name: "Open the feedback list" }).click();
  await expect(page.getByText(BODY)).toBeVisible();
});

test("the pin stays in the same place after reload (IndexedDB + re-anchoring)", async ({
  page,
}) => {
  await enterMode(page);
  await leaveOneComment(page, BODY);

  await page.reload();
  // Pins are only drawn in the mode, so zero until re-entering is normal.
  await enterMode(page);
  await expect(page.locator(".feedback-pin")).toHaveCount(1);
  // A count only says "it resolved". Position tells whether it found the right target.
  await expectPinOver(page, TARGET);
});

test("window.__fusen exposes the full set of members", async ({ page }) => {
  // External tools (CDP / MCP) read through this hook alone. The point is to check its **shape**.
  const members = await page.evaluate(() =>
    Object.keys(
      (window as unknown as FusenWindow).__fusen as unknown as Record<string, unknown>,
    ).sort(),
  );
  expect(members).toEqual(["clear", "count", "dump", "identity", "routes", "version"]);
});

test("window.__fusen can read the contents", async ({ page }) => {
  await enterMode(page);
  await leaveOneComment(page, BODY);

  const dumped = await page.evaluate(() => (window as unknown as FusenWindow).__fusen!.dump());
  expect(dumped).toHaveLength(1);
  expect(dumped[0]!.body).toBe(BODY);

  expect(await page.evaluate(() => (window as unknown as FusenWindow).__fusen!.count())).toBe(1);
  expect(await page.evaluate(() => (window as unknown as FusenWindow).__fusen!.version)).toBe(1);
});

test("a comment hidden by hideItem leaves the list, and comes back when it is unhidden", async ({
  page,
}) => {
  const kept = "The overview wording needs polish";
  const hidden = "The schedule wording is confusing";
  await leaveOneComment(page, kept, "#overview p");
  await leaveOneComment(page, hidden, "#schedule p");
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
  const kept = "The overview wording needs polish";
  const hidden = "The schedule wording is confusing";
  await leaveOneComment(page, kept, "#overview p");
  await leaveOneComment(page, hidden, "#schedule p");

  // Enter the mode first, to see whether **already drawn** pins follow the prop change.
  await enterMode(page);
  await expect(page.locator(".feedback-pin")).toHaveCount(2);

  await hideBody(page, hidden);
  await expect(page.locator(".feedback-pin")).toHaveCount(1);
  await expectPinOver(page, "#overview p");

  await hideBody(page, undefined);
  await expect(page.locator(".feedback-pin")).toHaveCount(2);
});
