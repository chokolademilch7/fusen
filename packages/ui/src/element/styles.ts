/**
 * The widget's stylesheet, as a string, so it can be adopted INTO the shadow
 * root the custom element opens. Nothing here is loaded from a URL: the package
 * ships no `<link>`, no `@font-face`, and no `/fonts/` path assumption, which is
 * what "embeddable" has to mean.
 *
 * WHERE THIS CAME FROM. Every rule below was previously a rule in the embedding
 * app's global stylesheet. Two groups had to be copied, for different reasons:
 *
 *  1. The widget's own `.feedback-*` block. Obviously ours.
 *  2. Rules the widget's markup USES but that were defined elsewhere in the
 *     host's sheet, and therefore do not cross the shadow boundary:
 *     the `* { box-sizing }` reset, the `button` reset, the `a` reset, `.ms`
 *     (which is now an SVG sizing rule, not a font rule — see `Icon.tsx`),
 *     `.name-avatar` / `.name-avatar-img`, `.icon-btn`, `.ghost`, and the
 *     `.muted` / `.center` / `.spacer` / `.error` utilities.
 *
 * DESIGN TOKENS ARE THE ONE THING WE DO NOT COPY. Custom properties inherit
 * THROUGH a shadow boundary, so the host's `:root` token block reaches in for
 * free — and that is the point: the widget should take on the look of whatever
 * it is embedded in, including its light/dark switch. What we owe in exchange is
 * that a page defining NO tokens still gets a sane widget, so every `var()` here
 * carries a fallback (the host's light-mode value). That set of names is the
 * package's public theming surface; see the list in the test next door, which
 * fails if a `var()` is ever added without a fallback.
 *
 * The colour fallbacks are not literals but `--fb-*` defaults declared on
 * `:host` below: a light set, swapped for a dark set under
 * `prefers-color-scheme: dark`. So a page with no tokens follows the OS theme,
 * and a page that defines a token keeps it in both modes. Consequence worth
 * knowing: a light-only page with no tokens gets a dark widget on a dark-mode
 * OS — defining the tokens (the documented contract) is how a page pins its look.
 */

import { DOCKED_BREAKPOINT_PX } from "../breakpoints.ts";

export const FEEDBACK_WIDGET_CSS = `
/* ---------- boundary resets ----------
 * The host page's own resets stop at the shadow boundary, so the handful the
 * widget's markup depends on are re-declared here. box-sizing is load-bearing:
 * the composer textarea (width:100% + padding), the pin popover
 * (width:min(360px,…) + padding) and every pill button assume border-box. */
/* Declare color together with background.
 *
 * This is a gap we actually hit. The panel, popovers and composer all paint
 * background: var(--bg, var(--fb-bg)) but declared no text color, and because
 * :host is display: contents the host page's color was inherited as is. When
 * the page has color-scheme: light dark and no color of its own, a browser
 * that prefers dark renders the body white: white text on a white background
 * (measured: textColor and panelBg both rgb(255,255,255)).
 *
 * The original app never showed it because its page color matched the tokens.
 * The widget is responsible for the text color on the background it paints.
 * Tokens the host defines still win, so the host's look does not change. */
:host { display: contents; color: var(--text, var(--fb-text)); }
/* Default palette. Tokens the host defines win. */
:host {
  --fb-bg: #ffffff; --fb-text: #0f0f0f; --fb-text-secondary: #606060;
  --fb-surface: #f8f8f8; --fb-surface-variant: #f2f2f2;
  --fb-inverse-surface: #0f0f0f; --fb-text-inverse: #f1f1f1;
  --fb-divider: #f2f2f2; --fb-border: #e5e5e5; --fb-link: #065fd4;
}
:host, *, *::before, *::after { box-sizing: border-box; }
/* The top-layer box everything is drawn in (see layer.ts). Undo the UA
 * popover look, cover the viewport without taking a single click, and hand
 * pointer events back to each layer explicitly below — which also survives a
 * host setting body { pointer-events: none } while its own modal is open. */
.fusen-layer {
  position: fixed; inset: 0; width: auto; height: auto; margin: 0; padding: 0;
  border: 0; background: transparent; color: inherit; overflow: visible;
  pointer-events: none;
}
/* No Popover API: a fixed box would be a stacking context trapping 35–39
 * under any positioned host element, so draw as if it were not there. */
.fusen-layer:not([popover]) { display: contents; }
button { font: inherit; color: inherit; border: 0; background: none; cursor: pointer; padding: 0; }
a { color: var(--link, var(--fb-link)); text-decoration: none; }
a:hover { text-decoration: underline; }

/* Icons are inlined SVG (see Icon.tsx). The class name and the "size it with
 * font-size" idiom are kept so every '.x .ms { font-size: N }' rule below still
 * sizes its icon. */
.ms {
  display: inline-block;
  width: 1em; height: 1em;
  flex: none;
  fill: currentColor;
  line-height: 1;
  -webkit-user-select: none;
  user-select: none;
}

/* ---------- borrowed base classes ---------- */
.name-avatar {
  width: 40px; height: 40px; flex: none; border-radius: var(--r-round, 40px);
  display: inline-flex; align-items: center; justify-content: center;
  background: var(--brand-gradient, linear-gradient(135deg, #00cfef, #0093d0)); color: #fff;
  font-size: 16px; font-weight: 500;
}
.name-avatar-img { object-fit: cover; background: none; }
.icon-btn {
  width: 40px; height: 40px; border-radius: var(--r-round, 40px);
  display: grid; place-items: center;
}
.icon-btn .ms { font-size: 24px; }
.icon-btn:hover { background: var(--surface-variant, var(--fb-surface-variant)); }
/* pill button (tonal on surface-variant) */
.ghost {
  display: inline-flex; align-items: center; gap: 8px;
  height: 36px; padding: 0 var(--sp-md, 16px);
  border-radius: var(--r-pill, 18px);
  background: var(--surface-variant, var(--fb-surface-variant));
  color: var(--text, var(--fb-text));
  font-size: 14px; font-weight: 500;
  transition: filter 0.15s;
}
.ghost:hover { filter: brightness(0.96); }
.muted { color: var(--text-secondary, var(--fb-text-secondary)); }
.center { text-align: center; padding: 48px 0; }
.spacer { flex: 1; }
.error { color: #ff0000; margin: 0; text-align: center; font-size: 14px; }

/* ---------- feedback widget ---------- */
.feedback-badge-cluster {
  position: fixed; right: var(--sp-md, 16px);
  bottom: calc(var(--sp-md, 16px) + env(safe-area-inset-bottom));
  /* Above the overlay (35) so ✕ stays tappable while picking; below the
   * composer (37) so it never covers the bottom sheet's Post button (leaving
   * while composing goes through Cancel) */
  z-index: 36; display: flex; flex-direction: column; align-items: flex-end;
  gap: var(--sp-sm, 8px); pointer-events: auto;
}
.feedback-panel-toggle, .feedback-badge {
  width: 48px; height: 48px; border-radius: var(--r-round, 40px);
  display: grid; place-items: center; color: #fff;
  background: var(--inverse-surface, var(--fb-inverse-surface)); color: var(--text-inverse, var(--fb-text-inverse));
  box-shadow: 0 8px 20px rgb(0 0 0 / 0.25);
}
.feedback-badge {
  width: 56px; height: 56px;
  background: var(--brand-gradient, linear-gradient(135deg, #00cfef, #0093d0)); color: #fff;
}
.feedback-badge.active {
  background: var(--inverse-surface, var(--fb-inverse-surface)); color: var(--text-inverse, var(--fb-text-inverse));
}
.feedback-panel-toggle .ms { font-size: 22px; }
.feedback-badge .ms { font-size: 26px; }

.feedback-overlay {
  position: fixed; inset: 0; z-index: 35;
  background: rgb(0 20 30 / 0.08);
  touch-action: none; cursor: crosshair; pointer-events: auto;
  display: flex; align-items: flex-start; justify-content: center;
}
.feedback-overlay-hint {
  margin-top: calc(var(--sp-lg, 24px) + env(safe-area-inset-top));
  padding: 10px 16px; border-radius: var(--r-pill, 18px);
  background: var(--inverse-surface, var(--fb-inverse-surface)); color: var(--text-inverse, var(--fb-text-inverse));
  font-size: 13px; font-weight: 500;
  box-shadow: 0 8px 20px rgb(0 0 0 / 0.25);
  pointer-events: none;
}

.feedback-pick-hover {
  position: fixed; pointer-events: none; border-radius: var(--r-sm, 8px);
  border: 1.5px dashed var(--aqua-deep, #0093d0);
  background: rgb(0 207 239 / 0.06);
}
.feedback-pick-highlight {
  position: fixed; z-index: 35; pointer-events: none; border-radius: var(--r-sm, 8px);
  border: 2px solid var(--aqua-deep, #0093d0);
  background: rgb(0 207 239 / 0.14);
  box-shadow: 0 0 0 2px rgb(0 207 239 / 0.25);
}

/* The spot of a note tapped in the list. Above pick (35), below pins (38) */
.feedback-focus-highlight {
  position: fixed; z-index: 37; pointer-events: none; border-radius: var(--r-sm, 8px);
  border: 2px solid var(--aqua-deep, #0093d0);
  background: rgb(0 207 239 / 0.18);
  box-shadow: 0 0 0 4px rgb(0 207 239 / 0.2);
  animation: fusen-focus-pulse 0.9s ease-in-out 2;
}
@keyframes fusen-focus-pulse {
  0%, 100% { box-shadow: 0 0 0 4px rgb(0 207 239 / 0.2); }
  50% { box-shadow: 0 0 0 10px rgb(0 207 239 / 0.05); }
}

.feedback-pins { position: fixed; inset: 0; z-index: 38; pointer-events: none; }
.feedback-pin {
  position: fixed; transform: translate(-50%, -100%);
  border-radius: var(--r-round, 40px); pointer-events: auto;
  box-shadow: 0 4px 10px rgb(0 0 0 / 0.3);
}
.feedback-pin-stack { display: flex; align-items: center; }
.feedback-pin-stack > * + * { margin-left: -10px; }
.feedback-pin-stack .name-avatar {
  width: 28px; height: 28px; font-size: 12px;
  border: 2px solid var(--bg, var(--fb-bg));
}
/* A host colour (pinColor) is set inline as the stack's border-color — the
 * stack draws no border of its own — and replaces the ring the avatars already
 * draw against the page. Nothing else about the pin moves. */
.feedback-pin-stack[data-toned] > * { border-color: inherit; }
.feedback-pin-more {
  width: 28px; height: 28px; flex: none; border-radius: var(--r-round, 40px);
  display: inline-flex; align-items: center; justify-content: center;
  background: var(--inverse-surface, var(--fb-inverse-surface)); color: var(--text-inverse, var(--fb-text-inverse));
  font-size: 11px; font-weight: 600;
  border: 2px solid var(--bg, var(--fb-bg));
}
/* position (left/top/bottom/transform) is computed inline in Pins.tsx,
 * anchored to the tapped pin cluster's viewport coords — see popoverStyle. */
.feedback-pin-popover {
  position: fixed; z-index: 38; pointer-events: auto;
  width: min(360px, calc(100vw - 2 * var(--sp-md, 16px)));
  background: var(--bg, var(--fb-bg)); border: 1px solid var(--border, var(--fb-border));
  border-radius: var(--r-md, 12px);
  padding: var(--sp-md, 16px); box-shadow: 0 12px 30px rgb(0 0 0 / 0.25);
}
/* Square icon-only button: no shorthand \`.ghost\` reuse here — ghost's
 * horizontal pill padding survived past the width/height
 * override and collapsed the content box to 0, which made the grid
 * centering fall back to start-alignment (icon rendered ~7px off-center).
 * Self-contained rule instead. */
.feedback-pin-popover-close {
  position: absolute; top: 8px; right: 8px; width: 32px; height: 32px;
  padding: 0; border-radius: var(--r-round, 40px);
  display: grid; place-items: center;
}
.feedback-pin-popover-close:hover { background: var(--surface-variant, var(--fb-surface-variant)); }
.feedback-pin-popover-close .ms { font-size: 16px; }
.feedback-pin-popover-list {
  display: flex; flex-direction: column; gap: var(--sp-sm, 8px);
  max-height: min(40vh, 360px); overflow-y: auto;
}
.feedback-item-author { display: flex; align-items: center; gap: var(--sp-sm, 8px); }
.feedback-item-author .name-avatar { width: 28px; height: 28px; font-size: 12px; }
.feedback-item-author-name { font-size: 13px; font-weight: 500; }

.feedback-composer {
  position: fixed; inset: auto 0 0 0; z-index: 37; pointer-events: auto;
  background: var(--bg, var(--fb-bg)); border-top: 1px solid var(--border, var(--fb-border));
  border-radius: var(--r-md, 12px) var(--r-md, 12px) 0 0;
  padding: var(--sp-md, 16px) var(--sp-md, 16px) calc(var(--sp-md, 16px) + env(safe-area-inset-bottom));
  box-shadow: 0 -8px 24px rgb(0 0 0 / 0.2);
}
.feedback-composer-form { display: flex; flex-direction: column; gap: var(--sp-sm, 8px); }
.feedback-composer-textarea {
  width: 100%; padding: 10px 12px; border: 1px solid var(--border, var(--fb-border));
  border-radius: var(--r-sm, 8px);
  background: var(--surface, var(--fb-surface)); color: var(--text, var(--fb-text));
  font-size: 15px; font-family: inherit;
  resize: none;
}
.feedback-composer-textarea:focus { outline: none; border-color: var(--aqua-deep, #0093d0); }
.feedback-composer-actions {
  display: flex; align-items: center; justify-content: space-between; gap: var(--sp-sm, 8px);
}
.feedback-composer-count { font-size: 12px; }
.feedback-composer-buttons { display: flex; gap: var(--sp-sm, 8px); }
.feedback-composer-cancel {
  height: 36px; padding: 0 var(--sp-md, 16px); border-radius: var(--r-pill, 18px);
  font-size: 14px; font-weight: 500;
}
.feedback-composer-submit {
  display: inline-flex; align-items: center; gap: 6px;
  height: 36px; padding: 0 var(--sp-md, 16px); border-radius: var(--r-pill, 18px);
  background: var(--inverse-surface, var(--fb-inverse-surface)); color: var(--text-inverse, var(--fb-text-inverse));
  font-size: 14px; font-weight: 500;
}
.feedback-composer-submit:disabled { opacity: 0.4; cursor: default; }
.feedback-composer-submit .ms { font-size: 18px; }
.feedback-composer-retry { font-weight: 500; }

.feedback-panel {
  /* The full-screen panel explicitly covers the whole feedback UI
   * (badge 36 / composer 37 / pins 38). Only the host's toast (40) sits above */
  position: fixed; inset: 0; z-index: 39; pointer-events: auto;
  background: var(--bg, var(--fb-bg)); display: flex; flex-direction: column;
  padding-top: env(safe-area-inset-top);
}
.feedback-panel-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: var(--sp-md, 16px); border-bottom: 1px solid var(--divider, var(--fb-divider)); flex: none;
}
.feedback-panel-head h2 { font-size: 16px; font-weight: 500; margin: 0; }
.feedback-panel-list { flex: 1; overflow-y: auto; padding: var(--sp-md, 16px); }

/* Tablet and up get a drawer docked on the right instead of a full screen.
 * The page behind stays visible, so tapping a list row highlights its spot
 * right next to it. The width is DOCKED_BREAKPOINT_PX from breakpoints.ts —
 * generated from the same constant as Panel.tsx's matchMedia, so they cannot
 * drift apart. */
@media (min-width: ${DOCKED_BREAKPOINT_PX}px) {
  .feedback-panel {
    --fb-drawer-w: min(380px, 90vw);
    inset: 0 0 0 auto; width: var(--fb-drawer-w);
    border-left: 1px solid var(--divider, var(--fb-divider));
    box-shadow: -8px 0 24px rgb(0 0 0 / 0.18);
  }
  .feedback-badge-cluster {
    transition: right 0.2s ease;
  }
  .feedback-badge-cluster[data-panel-open] {
    right: calc(min(380px, 90vw) + var(--sp-md, 16px));
  }
}

.feedback-item {
  padding: var(--sp-sm, 8px) 0; border-bottom: 1px solid var(--divider, var(--fb-divider));
  display: flex; flex-direction: column; gap: 4px;
}
.feedback-item-route {
  font-size: 12px; color: var(--link, var(--fb-link)); text-align: left; align-self: flex-start;
}
.feedback-item-text {
  font-size: 14px; line-height: 1.5; white-space: pre-wrap; overflow-wrap: anywhere;
}
/* The whole body is a "jump to that spot" button */
.feedback-item-focus {
  width: 100%; text-align: left; color: inherit; background: none;
  padding: 2px 4px; margin: 0 -4px; border-radius: var(--r-sm, 8px);
}
.feedback-item-focus:hover { background: var(--surface-variant, var(--fb-surface-variant)); }
/* Host slot content (renderItemMeta) renders INSIDE this shadow root, so the
 * rules for the "done" status badge and its PR number have to live here too —
 * the host's global sheet cannot reach them. */
.feedback-item-status {
  display: inline-flex; align-items: center; gap: 4px; align-self: flex-start;
  height: 20px; padding: 0 8px; border-radius: var(--r-pill, 18px);
  font-size: 12px; font-weight: 500; white-space: nowrap;
  background: rgb(0 150 90 / 0.12); color: #1a7f4e;
}
.feedback-item-status .ms { font-size: 14px; }
.feedback-item-pr { font-variant-numeric: tabular-nums; opacity: 0.85; }
.feedback-item-row { display: flex; align-items: center; gap: var(--sp-sm, 8px); font-size: 12px; }
.feedback-item-vote {
  width: 28px; height: 28px; border-radius: var(--r-round, 40px);
  display: grid; place-items: center; background: var(--surface-variant, var(--fb-surface-variant)); flex: none;
}
.feedback-item-vote .ms { font-size: 16px; }
.feedback-item-votes { font-size: 13px; font-weight: 500; font-variant-numeric: tabular-nums; }
/* Withdraw button, shown only on your own notes. The two-step confirm that
 * guards against mis-taps is .confirming — the icon turns into a "Withdraw?"
 * label, and that change of shape says "there is one more step"
 * (no window.confirm). */
.feedback-item-delete {
  width: 28px; height: 28px; border-radius: var(--r-round, 40px);
  display: grid; place-items: center; background: var(--surface-variant, var(--fb-surface-variant)); flex: none;
  color: var(--text-secondary, var(--fb-text-secondary));
  transition: background-color 0.15s ease, color 0.15s ease, width 0.15s ease, padding 0.15s ease;
}
.feedback-item-delete:hover { color: #ff0000; }
.feedback-item-delete .ms { font-size: 16px; }
.feedback-item-delete.confirming {
  width: auto; padding: 0 10px; border-radius: var(--r-pill, 18px);
  background: rgb(255 0 0 / 0.12); color: #ff0000;
  font-size: 12px; font-weight: 500; white-space: nowrap;
}

/* Host slot on the right of the panel header (panelHeaderActions), before the close button. */
.feedback-panel-head-actions { display: flex; align-items: center; gap: var(--sp-xs, 4px); }
.feedback-panel-triage-link {
  display: inline-flex; align-items: center; gap: 6px;
  height: 32px; padding: 0 12px; border-radius: var(--r-pill, 18px);
  background: var(--surface-variant, var(--fb-surface-variant)); color: var(--text, var(--fb-text));
  font-size: 13px; font-weight: 500; white-space: nowrap;
  transition: filter 0.15s;
}
.feedback-panel-triage-link:hover { filter: brightness(0.96); }
.feedback-panel-triage-link .ms { font-size: 18px; }

/* ---------- dark mode ----------
 * The host's tokens, when defined, still win; this swaps only the defaults
 * underneath them, plus the few places that hard-code a colour or a filter
 * direction. */
@media (prefers-color-scheme: dark) {
  :host {
    --fb-bg: #0f0f0f; --fb-text: #f1f1f1; --fb-text-secondary: #aaaaaa;
    --fb-surface: #212121; --fb-surface-variant: #272727;
    --fb-inverse-surface: #f1f1f1; --fb-text-inverse: #0f0f0f;
    --fb-divider: #3f3f3f; --fb-border: #3f3f3f; --fb-link: #3ea6ff;
  }
  .ghost:hover { filter: brightness(1.2); }
  .feedback-panel-triage-link:hover { filter: brightness(1.2); }
  /* Low-alpha fill is shared; only the text goes lighter (keeps the muted tone) */
  .feedback-item-status { color: #7ee2a8; }
}

/* ---------- reduced motion ---------- */
@media (prefers-reduced-motion: reduce) {
  .feedback-focus-highlight { animation: none; }
  .feedback-item-delete { transition: none; }
  .feedback-badge-cluster { transition: none; }
  .feedback-panel-triage-link { transition: none; }
}
`;
