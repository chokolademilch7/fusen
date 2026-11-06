[← README](../../README.md) · English | [日本語](../ja/guide/design.md)

# Design contracts

**Overlay manners.** A full-screen transparent layer sits on top, but clicks pass straight
through it except while you are picking an element. Focus is trapped only while the panel is
open, and Esc gets you out. The only public styling surface is CSS custom properties; the
internal structure is not exposed (no `::part`). Icons are bundled inline SVG, so there is no
font dependency, and the CSS is embedded in the JS, so there is no separate stylesheet to serve.
Under SSR nothing is rendered; it draws once it starts in the browser.

**State names are a public contract.** The custom element puts `data-machine="feedback"` and
`data-state` on itself (on the light DOM side). There are five values: `idle` /
`mode.picking` / `mode.composing` / `mode.submitting` / `mode.error`.

Outside code collects page state with `document.querySelectorAll("[data-machine]")`, and the raw
DOM API does not pierce shadow roots, so the attributes have to be on the host element itself.

From this contract follows a constraint: **the state machine cannot be made parallel**. The
inside and the outside join state names differently (`" "` versus `"."`); they match today only
because the machine is not parallel. Make it parallel and the outside checks silently stop
matching.
