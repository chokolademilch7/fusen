/**
 * The one responsive breakpoint the widget has, in one place.
 *
 * It is consumed twice — once as a `matchMedia` query in `Panel.tsx` (to decide
 * whether the list is a fullscreen sheet or a right-hand drawer, which changes
 * BEHAVIOUR: a docked panel does not close when you tap an item) and once as an
 * `@media` block in the shipped stylesheet. Those two used to be a hand-kept
 * pair of literals in different files; they are the same decision, so they are
 * the same constant.
 */

/** Width at or above which the comment list docks to the right edge. */
export const DOCKED_BREAKPOINT_PX = 640;

/** The same breakpoint as a media query string, for `window.matchMedia`. */
export const DOCKED_QUERY = `(min-width: ${DOCKED_BREAKPOINT_PX}px)`;
