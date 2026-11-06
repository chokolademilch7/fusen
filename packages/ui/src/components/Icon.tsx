/**
 * The widget's icons, inlined as SVG.
 *
 * These used to be `<span class="ms">close</span>` — Material Symbols LIGATURE
 * text, which only renders as a glyph if the embedding page happens to have
 * loaded that icon font. That made the package depend on three things it has no
 * business knowing: an `@font-face` rule in the host's stylesheet, a
 * `/fonts/material-symbols-outlined.woff2` path, and a `<link rel=preload>` in
 * the host's HTML. Inside a shadow root it is worse than a dependency: an
 * `@font-face` declared in a shadow stylesheet is not guaranteed to apply, so
 * the widget could not even carry the font itself.
 *
 * Six glyphs is a small enough fixed set to just ship. The path data is the
 * Material Symbols Outlined 24px outline for each name, on the font's native
 * `0 -960 960 960` viewBox.
 *
 * SIZING: the `ms` class is kept, and the `.ms` rule in the shipped stylesheet
 * sizes the SVG as `1em` square in `currentColor`. That means every
 * `.<something> .ms { font-size: … }` rule the widget already had keeps working
 * unchanged, and an icon still inherits the colour of the button it sits on.
 *
 * ACCESSIBILITY: every icon in this widget sits on a control that already has an
 * `aria-label` from the label map, so the glyph itself must contribute nothing
 * to the accessible name — hence `aria-hidden`. Inline SVG is not focusable in
 * any current engine, so `aria-hidden` alone is the whole story.
 */

/** Every glyph the widget draws. Adding a case here is the only way to add one. */
export type IconName = "add" | "chat_bubble" | "close" | "delete" | "list_alt" | "send";

const PATHS: Record<IconName, string> = {
  add: "M440-440H200v-80h240v-240h80v240h240v80H520v240h-80v-240Z",
  chat_bubble:
    "M80-80v-720q0-33 23.5-56.5T160-880h640q33 0 56.5 23.5T880-800v480q0 33-23.5 56.5T800-240H240L80-80Zm126-240h594v-480H160v525l46-45Zm-46 0v-480 480Z",
  close:
    "m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z",
  delete:
    "M280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520ZM360-280h80v-360h-80v360Zm160 0h80v-360h-80v360ZM280-720v520-520Z",
  list_alt:
    "M348.5-291.5Q360-303 360-320t-11.5-28.5Q337-360 320-360t-28.5 11.5Q280-337 280-320t11.5 28.5Q303-280 320-280t28.5-11.5Zm0-160Q360-463 360-480t-11.5-28.5Q337-520 320-520t-28.5 11.5Q280-497 280-480t11.5 28.5Q303-440 320-440t28.5-11.5Zm0-160Q360-623 360-640t-11.5-28.5Q337-680 320-680t-28.5 11.5Q280-657 280-640t11.5 28.5Q303-600 320-600t28.5-11.5ZM440-280h240v-80H440v80Zm0-160h240v-80H440v80Zm0-160h240v-80H440v80ZM200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm0-80h560v-560H200v560Zm0-560v560-560Z",
  send: "M120-160v-640l760 320-760 320Zm80-120 474-200-474-200v140l240 60-240 60v140Zm0 0v-400 400Z",
};

export function Icon(props: { name: IconName }) {
  return (
    <svg class="ms" viewBox="0 -960 960 960" aria-hidden="true">
      <path d={PATHS[props.name]} />
    </svg>
  );
}
