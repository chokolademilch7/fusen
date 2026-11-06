import { expect, test, type Page } from "@playwright/test";

/**
 * Acceptance tests for the plain HTML example. They prove three things only:
 * the tag boots with no build step, one comment can be written,
 * and it is still in IndexedDB after a reload.
 */

/** `window.__fusen` is the read hatch the lite bundle installs at runtime. Only the minimal type is declared here. */
declare global {
  interface Window {
    __fusen?: {
      version: number;
      dump: () => Promise<{ body: string }[]>;
      count: () => Promise<number>;
      clear: () => Promise<void>;
    };
  }
}

const URL_PATH = "/";

const LABEL = {
  enterMode: "Start feedback mode",
  // The way out of the mode. The tests only knew "start", so the exit path
  // was never exercised.
  exitMode: "End feedback mode",
  pickHint: "Tap the spot you want to comment on",
  composer: "What should change here?",
  cancel: "Cancel",
  submit: "Post",
  openPanel: "Open the feedback list",
} as const;

const host = (page: Page) => page.locator("fusen-widget");

/** Wait until the module has run and `window.__fusen` exists. Calling
 *  `window.__fusen?.clear()` without this succeeds without clearing anything when it has not loaded. */
const waitForHatch = (page: Page) => page.waitForFunction(() => Boolean(window.__fusen));

/** While picking, the widget takes the pointer with a full-screen overlay, so
 *  `locator.click()` stops at "intercepts pointer events". Click through by coordinates. */
async function clickThroughOverlay(page: Page, selector: string) {
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`no bounding box for ${selector}`);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

async function enterMode(page: Page) {
  await page.getByRole("button", { name: LABEL.enterMode }).click();
  await expect(host(page)).toHaveAttribute("data-state", "mode.picking");
}

/**
 * Write one comment. **Does not re-enter the mode if already in it.**
 *
 * After posting, the machine returns to `idle` (sending closes the mode by design),
 * so the second comment re-enters. Pins are drawn only in the mode, so tests that
 * look at pins call `enterMode` after posting before counting.
 */
async function addComment(page: Page, body: string, selector = "#lending p") {
  if ((await host(page).getAttribute("data-state")) === "idle") await enterMode(page);
  await clickThroughOverlay(page, selector);
  await expect(host(page)).toHaveAttribute("data-state", "mode.composing");
  await page.getByPlaceholder(LABEL.composer).fill(body);
  await page.getByRole("button", { name: LABEL.submit, exact: true }).click();
  // Once posted, the machine returns to idle. If it gets stuck in submitting, this fails.
  await expect(host(page)).toHaveAttribute("data-state", "idle");
}

/**
 * Check that the pin appears **over the element that was clicked**.
 *
 * Counting alone only says "something was drawn". It cannot tell which element the
 * pin is tied to, or whether re-anchoring found the right one. Position covers both.
 *
 * We tried removing `SELF_ATTR` to break it so "the widget itself gets picked as the
 * target", but it **did not reproduce** (measured). The host has `display: contents`,
 * so it has no box of its own and never shows up in the `elementsFromPoint` stack; it is
 * not picked even without self-exclusion. Self-exclusion matters when shadow content is
 * retargeted, which is a separate case.
 */
async function expectPinOver(page: Page, selector: string) {
  const target = await page.locator(selector).boundingBox();
  if (!target) throw new Error(`no bounding box for ${selector}`);
  const pin = await page.locator(".feedback-pin").boundingBox();
  if (!pin) throw new Error("no pin rendered");
  expectCenterWithin({ x: pin.x + pin.width / 2, y: pin.y + pin.height / 2 }, target, pin.height);
}

/** Set a hideItem on the host that hides the comment whose body is `body`. `undefined` removes it. */
async function setHideItem(page: Page, body: string | undefined) {
  await host(page).evaluate((el, b) => {
    (el as HTMLElement & { hideItem?: unknown }).hideItem =
      b === undefined ? undefined : (item: { body: string }) => item.body === b;
  }, body);
}

type Rect = { x: number; y: number; width: number; height: number };

/**
 * The pin's center lies within the target's rect. **Loosened by the pin's height.**
 *
 * A pin is placed with its center on the target's center, so when the target is
 * shorter than the pin, it sticks out above and below. Measured: a 28px pin on a
 * 24px one-line paragraph had its center 2px above. Making this strict turns it into
 * a test that always fails on one-line paragraphs, red for the unrelated reason of
 * element height. A pin stuck on the neighbouring element is usually off by tens of
 * px or more, so this slack does not miss the regression we care about.
 */
function expectCenterWithin(center: { x: number; y: number }, target: Rect, slack: number) {
  expect(center.x).toBeGreaterThanOrEqual(target.x - slack);
  expect(center.x).toBeLessThanOrEqual(target.x + target.width + slack);
  expect(center.y).toBeGreaterThanOrEqual(target.y - slack);
  expect(center.y).toBeLessThanOrEqual(target.y + target.height + slack);
}

test.beforeEach(async ({ page }) => {
  await page.goto(URL_PATH);
  await waitForHatch(page);
  await page.evaluate(() => window.__fusen!.clear());
  await page.reload();
  await waitForHatch(page);
});

test("the custom element boots and exposes idle in the light DOM", async ({ page }) => {
  await expect(host(page)).toHaveAttribute("data-machine", "feedback");
  await expect(host(page)).toHaveAttribute("data-state", "idle");
});

test("entering the mode goes to mode.picking and shows the hint", async ({ page }) => {
  await enterMode(page);
  await expect(page.getByText(LABEL.pickHint)).toBeVisible();
});

test("clicking a paragraph through the overlay moves to mode.composing", async ({ page }) => {
  await enterMode(page);
  await clickThroughOverlay(page, "#hours p");
  await expect(host(page)).toHaveAttribute("data-state", "mode.composing");
});

test("typing and posting puts a pin over the clicked paragraph", async ({ page }) => {
  await addComment(page, "Please raise the borrowing limit a little", "#lending p");
  await enterMode(page);
  await expect(page.locator(".feedback-pin")).toHaveCount(1);
  await expectPinOver(page, "#lending p");
});

test('a successful post sends "Sent" to the host via feedback-notify', async ({ page }) => {
  // Sending closes the mode and the pins leave the screen. This notice is the only sign the send worked.
  const notices: string[] = [];
  await page.exposeFunction("fusenNotice", (m: string) => notices.push(m));
  await page.evaluate(() =>
    document.addEventListener("feedback-notify", (e) =>
      (window as unknown as { fusenNotice: (m: string) => void }).fusenNotice(
        (e as CustomEvent<{ message: string }>).detail.message,
      ),
    ),
  );
  await addComment(page, "Please stay open later");
  await expect.poll(() => notices).toEqual(["Sent"]);
});

test("two comments on separate paragraphs each get a pin over their paragraph", async ({
  page,
}) => {
  // With only single-comment tests, none of these breakages would be noticed:
  // pins are drawn per **cluster**, not per item; the panel's order; and delete
  // hitting the right row. Making a second comment exposes them all at once.
  await addComment(page, "Make the opening hours bigger", "#hours p");
  await addComment(page, "The borrowing rules are too long", "#lending p");
  await enterMode(page);

  await expect(page.locator(".feedback-pin")).toHaveCount(2);

  // The paragraphs are far apart, so they do not cluster and each pin sits on its own paragraph.
  const hours = (await page.locator("#hours p").boundingBox())!;
  const lending = (await page.locator("#lending p").boundingBox())!;
  const pins = await page.locator(".feedback-pin").all();
  const centers = await Promise.all(
    pins.map(async (pin) => {
      const box = (await pin.boundingBox())!;
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    }),
  );
  // Loosen by the pin height, for the same reason as above.
  const SLACK = 28;
  const within = (c: { x: number; y: number }, r: Rect) =>
    c.x >= r.x - SLACK &&
    c.x <= r.x + r.width + SLACK &&
    c.y >= r.y - SLACK &&
    c.y <= r.y + r.height + SLACK;

  expect(centers.some((c) => within(c, hours))).toBe(true);
  expect(centers.some((c) => within(c, lending))).toBe(true);
  // The two pins sit on different paragraphs (not both on the same one).
  expect(centers.filter((c) => within(c, hours)).length).toBe(1);

  // The panel is newest first. With only one comment, the order was never checked.
  await page.getByRole("button", { name: LABEL.openPanel }).click();
  const texts = await page.locator(".feedback-item-text").allInnerTexts();
  expect(texts[0]).toContain("The borrowing rules are too long");
  expect(texts[1]).toContain("Make the opening hours bigger");
});

test("leaving the mode removes the overlay and the page is usable again", async ({ page }) => {
  // The worst way a library can break is holding the host page hostage.
  // If `<Show when={isPicking()}>` stops removing the overlay, the host page's clicks
  // are swallowed forever. Every test ended inside the mode, so this was never checked.
  await enterMode(page);
  await page.getByRole("button", { name: LABEL.exitMode }).click();
  await expect(host(page)).toHaveAttribute("data-state", "idle");

  // Being able to click a page element normally proves the overlay is gone.
  // In the mode this fails with "intercepts pointer events".
  await page.locator("#hours p").click({ timeout: 5000 });
});

test("the list panel shows the posted text", async ({ page }) => {
  const body = "The return box is hard to find";
  await addComment(page, body);
  await page.getByRole("button", { name: LABEL.openPanel }).click();
  await expect(page.getByText(body)).toBeVisible();
});

test("a comment hidden by hideItem leaves the list and comes back when unhidden", async ({
  page,
}) => {
  const kept = "Longer opening hours would be nice";
  const hidden = "The return box is hard to find";
  await addComment(page, kept, "#hours p");
  await addComment(page, hidden);
  await page.getByRole("button", { name: LABEL.openPanel }).click();
  await expect(page.getByText(hidden)).toBeVisible();

  await setHideItem(page, hidden);
  await expect(page.getByText(hidden)).toHaveCount(0);
  await expect(page.getByText(kept)).toBeVisible();

  await setHideItem(page, undefined);
  await expect(page.getByText(hidden)).toBeVisible();
});

test("a comment hidden by hideItem loses its pin and gets it back when unhidden", async ({
  page,
}) => {
  // The panel and the pins read the same filtered list. Checking only the panel lets a
  // regression that hands the pins the unfiltered list (`<Pins items={feedbackItems()}>`) stay green.
  const kept = "Longer opening hours would be nice";
  const hidden = "The return box is hard to find";
  await addComment(page, kept, "#hours p");
  await addComment(page, hidden, "#lending p");

  // Enter the mode first and check that **already drawn** pins follow hideItem changes.
  // Setting the filter before entering the mode would only test the single pass at mount.
  await enterMode(page);
  await expect(page.locator(".feedback-pin")).toHaveCount(2);

  await setHideItem(page, hidden);
  // The remaining pin sits on the paragraph that was not hidden.
  await expect(page.locator(".feedback-pin")).toHaveCount(1);
  await expectPinOver(page, "#hours p");
  // The loosened slack alone may not tell it apart from the neighbouring paragraph, so
  // also check it is not on the hidden paragraph's rect (catches an inverted or swapped predicate).
  const pin = (await page.locator(".feedback-pin").boundingBox())!;
  const lending = (await page.locator("#lending p").boundingBox())!;
  const cy = pin.y + pin.height / 2;
  expect(cy < lending.y || cy > lending.y + lending.height).toBe(true);

  await setHideItem(page, undefined);
  await expect(page.locator(".feedback-pin")).toHaveCount(2);
});

test("cancelling the composer returns to picking and adds no pin", async ({ page }) => {
  // It is the first escape hatch a user touches, yet the cancel button was never pressed
  // in browser or unit tests. It stayed green if the button vanished or was wired to the wrong event.
  await enterMode(page);
  await clickThroughOverlay(page, "#hours p");
  await expect(host(page)).toHaveAttribute("data-state", "mode.composing");

  await page.getByRole("button", { name: LABEL.cancel, exact: true }).click();
  await expect(host(page)).toHaveAttribute("data-state", "mode.picking");
  await expect(page.locator(".feedback-pin")).toHaveCount(0);
});

test("the pin stays in the same place after a reload (IndexedDB persistence + re-anchoring)", async ({
  page,
}) => {
  await addComment(page, "The photo exhibit captions are too small", "#hours p");
  await page.reload();
  await waitForHatch(page);
  // Right after the reload we are idle, so no pins are drawn yet.
  await expect(page.locator(".feedback-pin")).toHaveCount(0);
  await enterMode(page);
  await expect(page.locator(".feedback-pin")).toHaveCount(1);
  // A count only says "it resolved". Whether it resolved **to the right element** is checked by position.
  await expectPinOver(page, "#hours p");
});

test("the same comment can be read from window.__fusen", async ({ page }) => {
  const body = "Please stay open later on public holidays";
  await addComment(page, body);

  const seen = await page.evaluate(async () => {
    const hatch = window.__fusen!;
    return {
      version: hatch.version,
      count: await hatch.count(),
      bodies: (await hatch.dump()).map((item) => item.body),
    };
  });

  expect(seen.version).toBe(1);
  expect(seen.count).toBe(1);
  expect(seen.bodies).toEqual([body]);
});

test("window.__fusen exposes its full set of members", async ({ page }) => {
  // External tools (CDP / MCP) read through this hatch alone. If `installBridge`
  // drops a member, nothing notices unless a test calls it.
  // The point is the **shape**, not whether the calls succeed.
  const members = await page.evaluate(() =>
    Object.keys(window.__fusen as unknown as Record<string, unknown>).sort(),
  );
  expect(members).toEqual(["clear", "count", "dump", "identity", "routes", "version"]);
});
