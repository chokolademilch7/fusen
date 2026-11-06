import { expect, test, type Page } from "@playwright/test";

/**
 * You can comment on what is inside a modal while it is open.
 *
 * Both kinds used to break the flow:
 * - A div on a high z-index sits above the badge (z-index 36), so you cannot enter the mode.
 * - A showModal() <dialog> makes everything outside inert, so the badge gets no clicks.
 * And entering the mode first covers the page with the overlay, so you cannot open the modal.
 *
 * The badge is clicked with `locator.click()`, not by coordinates. Before clicking,
 * Playwright checks that the topmost element at that point is the target itself, so
 * a covered badge fails with "intercepts pointer events" — the regression we want to catch.
 */

const URL_PATH = "/modal.html";

const LABEL = {
  enterMode: "Start feedback mode",
  composer: "What should change here?",
  submit: "Post",
} as const;

declare global {
  interface Window {
    __fusen?: {
      version: number;
      clear: () => Promise<void>;
      dump: () => Promise<{ body: string }[]>;
    };
  }
}

const host = (page: Page) => page.locator("fusen-widget");

/** While picking, the overlay takes the pointer, so click through it by coordinates. */
async function clickThroughOverlay(page: Page, selector: string) {
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`no bounding box for ${selector}`);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

async function commentOn(page: Page, selector: string, body: string) {
  await page.getByRole("button", { name: LABEL.enterMode }).click();
  await expect(host(page)).toHaveAttribute("data-state", "mode.picking");
  await clickThroughOverlay(page, selector);
  await expect(host(page)).toHaveAttribute("data-state", "mode.composing");
  await page.getByPlaceholder(LABEL.composer).fill(body);
  await page.getByRole("button", { name: LABEL.submit, exact: true }).click();
  await expect(host(page)).toHaveAttribute("data-state", "idle");
  expect((await page.evaluate(() => window.__fusen!.dump())).map((i) => i.body)).toContain(body);
}

test.beforeEach(async ({ page }) => {
  await page.goto(URL_PATH);
  await page.waitForFunction(() => Boolean(window.__fusen));
  await page.evaluate(() => window.__fusen!.clear());
  await page.reload();
  await page.waitForFunction(() => Boolean(window.__fusen));
});

test("can comment on a paragraph inside a showModal() dialog while it stays open", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Review in a dialog" }).click();
  await expect(page.locator("#confirm-dialog")).toHaveAttribute("open", "");
  await commentOn(page, "#dialog-text", "Can I change the party size here?");
  // The dialog did not close while we commented.
  await expect(page.locator("#confirm-dialog")).toHaveAttribute("open", "");
});

test("Escape while picking only leaves the mode and does not close the dialog", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Review in a dialog" }).click();
  await page.getByRole("button", { name: LABEL.enterMode }).click();
  await expect(host(page)).toHaveAttribute("data-state", "mode.picking");
  await page.keyboard.press("Escape");
  await expect(host(page)).toHaveAttribute("data-state", "idle");
  await expect(page.locator("#confirm-dialog")).toHaveAttribute("open", "");
});

test("can still comment on the page after the dialog is closed", async ({ page }) => {
  await page.getByRole("button", { name: "Review in a dialog" }).click();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.locator("#confirm-dialog")).not.toHaveAttribute("open", "");
  await commentOn(page, "h1", "The heading is too small");
});

test("the widget survives the dialog element being removed", async ({ page }) => {
  await page.getByRole("button", { name: "Review in a dialog" }).click();
  await page.evaluate(() => document.getElementById("confirm-dialog")!.remove());
  await commentOn(page, "h1", "Still works after removal");
});

test("can comment on a paragraph inside a z-index 9999 overlay", async ({ page }) => {
  await page.getByRole("button", { name: "Review in an overlay" }).click();
  await expect(page.locator("#overlay-modal")).toBeVisible();
  await commentOn(page, "#overlay-text", "Please list the cancellation fee");
  await expect(page.locator("#overlay-modal")).toBeVisible();
});

test("can comment on a second dialog opened from the first (earlier in the markup)", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Review in a dialog" }).click();
  await page.getByRole("button", { name: "See details" }).click();
  await expect(page.locator("#detail-dialog")).toHaveAttribute("open", "");
  await commentOn(page, "#detail-text", "How many high chairs do you have?");
  // Closing the second dialog returns to the first, which is still clickable.
  await page.getByRole("button", { name: "Close details" }).click();
  await commentOn(page, "#dialog-text", "Still works back in the first dialog");
});

test("moves into the inner modal when a modal nests inside a shadow-root modal", async ({
  page,
}) => {
  // When both open at once and focus lands straight inside, one focusin path
  // carries both, inner first. Mistaking the outer for topmost parks there.
  await page.evaluate(() => {
    const shell = (tag: string, inner: string) =>
      customElements.define(
        tag,
        class extends HTMLElement {
          constructor() {
            super();
            this.attachShadow({
              mode: "open",
            }).innerHTML = `<div class="modal" aria-modal="true">${inner}</div>`;
          }
        },
      );
    shell(
      "inner-modal",
      `<p id="nested-text">Nested content</p><button id="nested-ok" type="button">OK</button>`,
    );
    shell("outer-modal", `<p>Outer</p><inner-modal></inner-modal>`);
    document.body.append(document.createElement("outer-modal"));
    const inner = document.querySelector("outer-modal")!.shadowRoot!.querySelector("inner-modal")!;
    (inner.shadowRoot!.getElementById("nested-ok") as HTMLElement).focus();
  });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const inner = document
          .querySelector("outer-modal")!
          .shadowRoot!.querySelector("inner-modal")!.shadowRoot!;
        if (inner.querySelector(".modal > fusen-layer")) return "inner";
        const outer = document.querySelector("outer-modal")!.shadowRoot!;
        return outer.querySelector(".modal > fusen-layer") ? "outer" : "elsewhere";
      }),
    )
    .toBe("inner");
  await commentOn(page, "inner-modal #nested-text", "Works inside a nested modal too");
});

test("theme colours defined on a wrapper still apply inside the dialog", async ({ page }) => {
  await page.getByRole("button", { name: "Review in a dialog" }).click();
  await page.getByRole("button", { name: LABEL.enterMode }).click();
  await clickThroughOverlay(page, "#dialog-text");
  const composer = page.locator(".feedback-composer");
  await expect(composer).toHaveCSS("background-color", "rgb(23, 22, 20)");
  await expect(composer).toHaveCSS("color", "rgb(236, 232, 225)");
});

test("Escape in the composer inside a dialog does not close the dialog", async ({ page }) => {
  await page.getByRole("button", { name: "Review in a dialog" }).click();
  await page.getByRole("button", { name: LABEL.enterMode }).click();
  await clickThroughOverlay(page, "#dialog-text");
  await page.getByPlaceholder(LABEL.composer).fill("half-written");
  await page.getByPlaceholder(LABEL.composer).press("Escape");
  await expect(page.getByPlaceholder(LABEL.composer)).toHaveValue("half-written");
  await expect(page.locator("#confirm-dialog")).toHaveAttribute("open", "");
});

test("an Escape in the composer does not close a modal whose trap listens in the capture phase", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Review in a focus trap" }).click();
  await page.getByRole("button", { name: LABEL.enterMode }).click();
  await clickThroughOverlay(page, "#trap-text");
  await page.getByPlaceholder(LABEL.composer).fill("Half-written");
  await page.getByPlaceholder(LABEL.composer).press("Escape");
  await expect(page.getByPlaceholder(LABEL.composer)).toHaveValue("Half-written");
  await expect(page.locator("#trap-modal")).toBeVisible();
});

test("the badge survives a framework re-attaching <fusen-widget>", async ({ page }) => {
  // Detaching closes the popover inside. Unless re-attaching shows it again, the widget disappears.
  await page.evaluate(() => document.body.append(document.querySelector("fusen-widget")!));
  await commentOn(page, "h1", "Still works after re-attaching");
});

test("a widget the host hid stays hidden when a dialog opens", async ({ page }) => {
  await page.evaluate(() => (document.getElementById("theme")!.hidden = true));
  await page.getByRole("button", { name: "Review in a dialog" }).click();
  await expect(page.getByRole("button", { name: LABEL.enterMode })).toBeHidden();
});

test("can comment on a paragraph inside a focus-trapping aria-modal modal", async ({ page }) => {
  // Siblings go inert so the badge cannot be clicked, and even if it could, focus is pulled out of the composer.
  await page.getByRole("button", { name: "Review in a focus trap" }).click();
  await expect(page.locator("#trap-modal")).toBeVisible();
  await commentOn(page, "#trap-text", "Do you take cards at the restaurant?");
  await expect(page.locator("#trap-modal")).toBeVisible();
  // After it closes and the element is removed, the page can still be commented on.
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.locator("#trap-modal")).toHaveCount(0);
  await commentOn(page, "h1", "Still works after the trap");
});

test("can comment on a dialog opened with showModal() inside a shadow root", async ({ page }) => {
  await page.getByRole("button", { name: "Review in a component" }).click();
  const dialog = page.locator("shadow-dialog dialog");
  await expect(dialog).toHaveAttribute("open", "");
  await commentOn(page, "shadow-dialog #shadow-text", "Where is the parking?");
  await expect(dialog).toHaveAttribute("open", "");
  // Closing returns to the page. A close() inside a shadow root is invisible from document.
  await page.locator("shadow-dialog #close-shadow").click();
  await expect(dialog).not.toHaveAttribute("open", "");
  await commentOn(page, "h1", "Still works after the component dialog");
});

test("does not move into an aria-modal <dialog> opened with show() (it blocks nothing)", async ({
  page,
}) => {
  await page.evaluate(() => {
    const d = document.createElement("dialog");
    d.id = "loose-dialog";
    d.setAttribute("aria-modal", "true");
    d.textContent = "non-modal";
    document.body.append(d);
    d.show();
  });
  await expect(page.locator("#loose-dialog")).toBeVisible();
  await commentOn(page, "h1", "Can comment on the page while a non-modal dialog is open");
  await expect(page.locator("#loose-dialog fusen-layer")).toHaveCount(0);
});

test("does not re-query for modals on every change while dialog content keeps moving", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Review in a dialog" }).click();
  await expect(page.getByRole("button", { name: LABEL.enterMode })).toBeVisible();
  // This observer only exists inside a dialog, so first confirm the widget moved there.
  await expect
    .poll(() => page.evaluate(() => document.querySelector("fusen-layer")?.parentElement?.id))
    .toBe("confirm-dialog");
  const queries = await page.evaluate(async () => {
    // Stand-in for an animating modal: rewrite the content, toggle a <details>
    // and rewrite the dialog's own style and class, 200 times.
    const details = document.createElement("details");
    document.getElementById("dialog-text")!.append(details);
    await Promise.resolve();
    let count = 0;
    const original = Document.prototype.querySelectorAll;
    Document.prototype.querySelectorAll = function (this: Document, selector: string) {
      if (selector.includes(":modal")) count++;
      return original.call(this, selector);
    } as typeof original;
    const text = document.getElementById("dialog-text")!;
    const dialog = document.getElementById("confirm-dialog")!;
    try {
      for (let i = 0; i < 200; i++) {
        text.append(document.createElement("span"));
        details.open = !details.open;
        dialog.style.opacity = String(1 - (i % 10) / 100);
        dialog.classList.toggle("tick");
        await Promise.resolve();
      }
      await new Promise((r) => requestAnimationFrame(r));
    } finally {
      Document.prototype.querySelectorAll = original;
    }
    return count;
  });
  expect(queries).toBe(0);
  await commentOn(page, "#dialog-text", "Still works while it moves");
});

test("the widget returns to the page when the dialog is re-attached within the same task", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Review in a dialog" }).click();
  // Detaching makes it non-modal. Re-attaching leaves the open attribute unchanged.
  await page.evaluate(() => {
    const dialog = document.getElementById("confirm-dialog")!;
    dialog.remove();
    document.body.append(dialog);
  });
  await commentOn(page, "h1", "Can comment on the page after re-attaching");
});
