/**
 * Where the widget's UI is drawn: a `popover="manual"` box in the TOP LAYER,
 * so a host's modal can never cover the badge.
 *
 * Four kinds of modal had cut the widget off:
 *
 *   1. A div raised with z-index (MUI 1300, a hand-written 9999). Our layers
 *      sit at 35–39, so the overlay covered the badge and comment mode could
 *      not be entered. The top layer is above every z-index, so a popover fixes
 *      this on its own.
 *   2. A native `<dialog>` opened with `showModal()`. That makes everything
 *      outside the dialog INERT — including a popover shown after it.
 *      Measured 2026-10-22 (Chromium): a popover over a modal dialog took no
 *      click, `elementFromPoint` returned the dialog's backdrop, and `focus()`
 *      landed on the dialog. Only the dialog's own subtree is live, so the
 *      layer MOVES INTO the topmost modal while one is open, and back home
 *      when it closes. As a popover it is still drawn against the viewport
 *      there, whatever transform or overflow the dialog has.
 *   3. A JS modal (focus-trap, Headless UI): a visible `[aria-modal="true"]`
 *      element that sets `inert` on its siblings and pulls focus that leaves
 *      it back inside. The badge outside is inert, and the composer would lose
 *      focus to the trap, so the layer parks in it exactly like in a dialog.
 *      A `<dialog>` counts only when `:modal`: `aria-modal` on one opened
 *      with `show()` blocks nothing.
 *   4. Either of the above inside an open shadow root (Lit, Shoelace,
 *      Material Web). `querySelectorAll` and a MutationObserver on the
 *      document see neither the element nor its `open` flipping. Opening one
 *      moves focus into it, though, and `focusin` is composed: its
 *      `composedPath()` names the modal. Once seen it is remembered, and
 *      while parked its shadow roots are observed for it closing or going.
 *
 * What moves is this layer, never `<fusen-widget>` itself: the host's framework
 * owns that node, and a removeChild/insertBefore on a node we had moved would
 * throw. The layer is our own element with its own shadow root, so the
 * stylesheet travels with it. Inside a modal it no longer inherits from
 * `<fusen-widget>`, so the theme tokens the stylesheet reads are copied onto it
 * for as long as it is away.
 *
 * A later popover lands above ours, so a host popover opening re-shows the
 * layer on top. Without the Popover API (pre-2023 browsers) the box is
 * `display: contents`, which is exactly how the widget drew before.
 *
 * Known gap: a shadow-root modal that opens without moving focus, or one in a
 * closed shadow root, is not found; the badge stays inert behind it. Neither
 * is a light-DOM JS modal shown by class or style that sets no `inert` and
 * moves no focus. A visible element that carries `aria-modal="true"` without
 * being modal takes the layer for as long as it is shown. A JS trap
 * that handles Escape in the capture phase (focus-trap) still closes on an
 * Escape pressed on one of our buttons (cancelling a delete): only a text
 * field's Escape is stopped, see below. Re-showing on a host popover also drops an IME
 * composition in progress in the composer; skip the raise while composing if
 * that ever bites.
 */

import { SELF_ATTR } from "../runtime.ts";
import { FEEDBACK_WIDGET_CSS } from "./styles.ts";

let sheet: CSSStyleSheet | undefined;

/** Host tokens the stylesheet reads (`--bg`, `--text`, …), minus our own
 *  `--fb-*` defaults, which the layer defines itself. */
const HOST_TOKENS = [
  ...new Set([...FEEDBACK_WIDGET_CSS.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]!)),
].filter((name) => !name.startsWith("--fb-"));

export function createFeedbackLayer(widget: HTMLElement, home: ShadowRoot) {
  // A tag of our own rather than a div: host CSS such as `dialog > div`, and
  // the anchor engine's `:nth-of-type` among the dialog's divs, must not see
  // it. Inline `display: contents` because outer author rules beat `:host`.
  const host = document.createElement("fusen-layer");
  host.setAttribute(SELF_ATTR, "");
  host.style.display = "contents";
  const shadow = host.attachShadow({ mode: "open" });
  // One parsed sheet shared by every layer, not one per remount.
  if (!sheet) {
    sheet = new CSSStyleSheet();
    sheet.replaceSync(FEEDBACK_WIDGET_CSS);
  }
  shadow.adoptedStyleSheets = [sheet];
  const root = document.createElement("div");
  root.className = "fusen-layer";
  shadow.append(root);
  home.append(host);

  const popover = typeof HTMLElement.prototype.showPopover === "function";
  if (popover) root.popover = "manual";

  /** Hide + show is the only way to move to the top of the top layer. It
   *  drops focus, so whatever had it inside the layer gets it back. */
  const raise = () => {
    if (!popover || !host.isConnected) return;
    const focused = shadow.activeElement as HTMLElement | null;
    if (root.matches(":popover-open")) root.hidePopover();
    root.showPopover();
    focused?.focus({ preventScroll: true });
  };

  /** A native modal dialog, or a shown element that calls itself modal. */
  const isModal = (el: Element) =>
    el.isConnected &&
    (el.matches("dialog:modal") ||
      (el.localName !== "dialog" &&
        el.getAttribute("aria-modal") === "true" &&
        (el.checkVisibility?.() ?? el.getClientRects().length > 0)));

  /** Modals inside shadow roots, learned from focus paths: no document query
   *  reaches them. */
  const shadowed = new Set<Element>();

  /** Modals in the order we saw them open. The top layer's own order is not
   *  exposed, and document order gets a dialog opened from inside another one
   *  wrong whenever it sits earlier in the markup. */
  let opened: Element[] = [];
  const topmostModal = () => {
    for (const el of shadowed) if (!el.isConnected) shadowed.delete(el);
    const modals = [
      ...document.querySelectorAll('dialog:modal, [aria-modal="true"]'),
      ...shadowed,
    ].filter(isModal);
    opened = opened.filter((d) => modals.includes(d));
    for (const d of modals) if (!opened.includes(d)) opened.push(d);
    return opened[opened.length - 1] ?? null;
  };

  const copied: string[] = [];
  const carryTokens = (away: boolean) => {
    for (const name of copied.splice(0)) host.style.removeProperty(name);
    if (!away) return;
    const style = getComputedStyle(widget);
    for (const name of HOST_TOKENS) {
      const value = style.getPropertyValue(name);
      // Never over a value already on the layer (pairSurfaceTokens' --text).
      if (!value || host.style.getPropertyValue(name)) continue;
      host.style.setProperty(name, value);
      copied.push(name);
    }
  };

  // `open` flips on showModal()/close(); `aria-modal`, `inert` and `hidden` are
  // how a JS modal announces itself. While parked, childList also catches the
  // modal being removed with the layer inside it, which flips nothing; at home
  // that firehose is not needed, so only `<body>`'s own children are watched
  // there, which is where portals append a modal already marked up. A modal in a
  // shadow root is invisible to the document's observer, so while parked in
  // one each shadow root above it is observed too, and the modal itself for
  // any attribute (a JS modal hides by class or style, not by `open`).
  // While parked in a dialog, an animated or live-updating modal mutates its
  // subtree every frame; skip those batches (childList, or `open` on a
  // non-dialog such as `<details>`) while that dialog is still `:modal`. Its
  // removal disconnects it; a remove+reinsert in one task leaves it connected
  // but no longer `:modal`. A newer modal flips `open` on a dialog or
  // `aria-modal`, which is never skipped.
  // Known gap: a JS trap inserted already marked `aria-modal` inside the parked
  // dialog arrives as childList and is skipped; check addedNodes if one shows up.
  // The modal itself is observed for every attribute, so a host writing its
  // style or class every frame (an animation, a drag) would re-query per frame
  // too: an attribute outside ATTRS on the topmost modal cannot change which
  // modal is topmost, so it is skipped while that modal still reads as modal
  // (a JS modal hidden by class or style no longer does).
  const contentOnly = (r: MutationRecord) =>
    r.type === "childList" ||
    (r.attributeName === "open" && !(r.target instanceof HTMLDialogElement));
  const observer = new MutationObserver((records) => {
    const parked = host.parentNode;
    const top = opened[opened.length - 1];
    const dialogModal = parked instanceof HTMLDialogElement && parked.matches(":modal");
    if (
      records.every(
        (r) =>
          (r.type === "attributes" && r.target === top && !ATTRS.includes(r.attributeName!)) ||
          (dialogModal && contentOnly(r)),
      ) &&
      (!top || isModal(top))
    )
      return;
    reconcile();
  });
  const ATTRS = ["open", "aria-modal", "inert", "hidden"];
  const watch = (modal: Element | null) => {
    observer.disconnect();
    const away = modal !== null;
    observer.observe(document.documentElement, {
      subtree: true,
      childList: away,
      attributes: true,
      attributeFilter: ATTRS,
    });
    if (!modal) {
      if (document.body) observer.observe(document.body, { childList: true });
      return;
    }
    observer.observe(modal, { attributes: true });
    // Parked in the modal's own shadow root: its re-render may drop the layer.
    if (modal.shadowRoot) observer.observe(modal.shadowRoot, { childList: true });
    for (let r = modal.getRootNode(); r instanceof ShadowRoot; r = r.host.getRootNode()) {
      observer.observe(r, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ATTRS,
      });
    }
  };

  // Opening a modal moves focus into it, and `focusin` is composed, so its
  // path names a modal no document query can reach. Focus moving within our
  // own layer opened nothing, so it is ignored outright. The path runs from the
  // target outwards; walk it the other way so a modal nested in another one's
  // shadow root is recorded after it, i.e. as the one on top.
  const onFocusIn = (e: Event) => {
    const path = e.composedPath();
    if (path.includes(host)) return;
    for (const node of path.toReversed()) {
      if (node instanceof Element && node.getRootNode() instanceof ShadowRoot && isModal(node)) {
        shadowed.add(node);
      }
    }
    reconcile();
  };

  const reconcile = () => {
    const modal = popover ? topmostModal() : null;
    // A widget the host hid stays hidden: at home a hidden ancestor hides the
    // popover as well, and parking in a dialog would let it escape that.
    // Safari 17.0–17.3 has popovers but not checkVisibility: assume visible.
    const hidden = () => host.parentNode === home && root.checkVisibility?.() === false;
    // A custom element's light children only render where a slot puts them:
    // inside one with an open shadow root, go into that root instead.
    const parent = modal && !hidden() ? (modal.shadowRoot ?? modal) : home;
    if (host.parentNode === parent) return;
    const focused = shadow.activeElement as HTMLElement | null;
    carryTokens(parent !== home);
    parent.append(host);
    watch(parent === home ? null : modal);
    raise();
    focused?.focus({ preventScroll: true });
  };

  // A host popover entered the top layer above us. `toggle` does not bubble,
  // hence capture. It is not composed either, so our own hide/show never
  // reaches this listener.
  // Only popovers: `<details>` fires `toggle` too, and a dialog is reconcile's.
  // Not while something in the layer has focus: a raise there would drop an
  // IME composition in the composer, which costs more than a covered corner.
  const onToggle = (e: Event) => {
    if (!(e.target as HTMLElement).popover || (e as ToggleEvent).newState !== "open") return;
    if (!shadow.activeElement) raise();
  };
  document.addEventListener("toggle", onToggle, true);
  if (popover) document.addEventListener("focusin", onFocusIn, true);
  // Escape inside our UI (cancelling a delete, leaving the composer) must not
  // also close the host's dialog we are parked in. Cancelled, not stopped:
  // our own document-level handlers still see it.
  host.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && host.parentNode !== home) e.preventDefault();
  });
  // A JS trap (focus-trap) listens on the document in the capture phase and
  // closes whether or not the event was cancelled, so it must not see an
  // Escape typed in the composer at all. Window capture runs before it.
  // Text fields only: our own Escape handlers (cancelling a delete in Panel
  // and Pins) sit on the document and would be stopped too, and no text
  // field of ours handles Escape itself.
  const stopFieldEscape = (e: KeyboardEvent) => {
    if (e.key !== "Escape" || host.parentNode === home) return;
    const path = e.composedPath();
    if (!path.includes(host)) return;
    const field = path[0];
    if (field instanceof HTMLTextAreaElement || field instanceof HTMLInputElement) {
      e.preventDefault();
      e.stopPropagation();
    }
  };
  window.addEventListener("keydown", stopFieldEscape, true);

  /** Show at home first: reconcile reads that visibility to decide whether a
   *  modal already open may take the layer. */
  const refresh = () => {
    raise();
    reconcile();
  };
  watch(null);
  refresh();

  return {
    /** Render target. */
    root,
    /** The element that moves; `pairSurfaceTokens` writes onto it. */
    host,
    /** After `<fusen-widget>` itself was moved: removal hid the popover. */
    refresh,
    dispose() {
      observer.disconnect();
      document.removeEventListener("toggle", onToggle, true);
      document.removeEventListener("focusin", onFocusIn, true);
      window.removeEventListener("keydown", stopFieldEscape, true);
      shadowed.clear();
      host.remove();
    },
  };
}
