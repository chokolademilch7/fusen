import { expect, test, type Page } from "@playwright/test";

/**
 * When the host defines only `--bg`, the list text is still readable.
 *
 * The existing "list text does not blend into the background" test only checks
 * `textColor !== panelBg`. That stays green for **rgb(15,15,15) text on rgb(23,22,20)**
 * — a 1.05:1 ratio, effectively unreadable.
 * So this test checks the actual contrast ratio, not just that the colours differ.
 */

const URL_PATH = "/tokens.html";

const LABEL = {
  enterMode: "Start feedback mode",
  composer: "What should change here?",
  submit: "Post",
  openPanel: "Open the feedback list",
} as const;

declare global {
  interface Window {
    __fusen?: { version: number; clear: () => Promise<void> };
  }
}

const host = (page: Page) => page.locator("fusen-widget");

/** While picking, the overlay takes the pointer, so click through it by coordinates. */
async function clickThroughOverlay(page: Page, selector: string) {
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`no bounding box for ${selector}`);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

/** Relative luminance of sRGB, exactly as WCAG 2.x defines it. */
function luminance([r, g, b]: [number, number, number]): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function parseRgb(value: string): [number, number, number] {
  const m = value.match(/(\d+(?:\.\d+)?)/g);
  if (!m || m.length < 3) throw new Error(`not an rgb colour: ${value}`);
  return [Number(m[0]), Number(m[1]), Number(m[2])];
}

function contrast(fg: string, bg: string): number {
  const a = luminance(parseRgb(fg));
  const b = luminance(parseRgb(bg));
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

test("list text is readable when the host defines only --bg", async ({ page }) => {
  await page.goto(URL_PATH);
  await page.waitForFunction(() => Boolean(window.__fusen));
  await page.evaluate(() => window.__fusen?.clear());
  await page.reload();
  await page.waitForFunction(() => Boolean(window.__fusen));

  await page.getByRole("button", { name: LABEL.enterMode }).click();
  await expect(host(page)).toHaveAttribute("data-state", "mode.picking");
  await clickThroughOverlay(page, "#lending p");
  await expect(host(page)).toHaveAttribute("data-state", "mode.composing");
  await page.getByPlaceholder(LABEL.composer).fill("readable");
  await page.getByRole("button", { name: LABEL.submit, exact: true }).click();
  await expect(host(page)).toHaveAttribute("data-state", "idle");

  await page.getByRole("button", { name: LABEL.openPanel }).click();

  const text = page.locator(".feedback-item-text").first();
  await expect(text).toBeVisible();

  // If the panel itself is transparent, the colour you actually see is an ancestor's.
  // To measure what is on screen, take the background from the first non-transparent ancestor.
  const seen = await text.evaluate((el) => {
    const transparent = (c: string) => c === "transparent" || /,\s*0\)$/.test(c);
    let node: Element | null = el;
    let bg = "transparent";
    while (node && transparent(bg)) {
      bg = getComputedStyle(node).backgroundColor;
      const root = node.getRootNode();
      node = node.parentElement ?? (root instanceof ShadowRoot ? root.host : null);
    }
    return { color: getComputedStyle(el).color, bg };
  });

  expect(
    contrast(seen.color, seen.bg),
    `text ${seen.color} is unreadable on background ${seen.bg}`,
  ).toBeGreaterThanOrEqual(4.5);
});
