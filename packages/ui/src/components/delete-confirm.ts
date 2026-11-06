/**
 * The one shared piece of the two-step delete confirmation: deciding whether a
 * document-level pointer event landed ON a delete button or somewhere else
 * (which cancels the confirmation).
 *
 * WHY THIS IS NOT JUST `e.target.closest(…)`. The widget now renders inside a
 * shadow root, and these listeners are on `document`. Event RETARGETING means
 * that by the time a shadow-internal event reaches the document, `e.target` has
 * been rewritten to the shadow HOST — so `e.target.closest(".feedback-item-delete")`
 * is always false, every tap counts as "outside", and the first tap on delete
 * cancels the very confirmation it just opened. `composedPath()` is the API that
 * still reports the real path through the shadow tree, so it is what this asks.
 *
 * Node shapes are duck-typed rather than `instanceof Element`-checked so the
 * behaviour is testable against plain fake objects — there is no DOM in this
 * repo's test runner.
 */

/** Class marking a delete button, matched against the event path. Kept next to
 *  the matcher so the two cannot drift. */
export const DELETE_BUTTON_CLASS = "feedback-item-delete";

type PathNode = { classList?: { contains(token: string): boolean } };

export function isDeleteButtonTap(event: { composedPath(): readonly unknown[] }): boolean {
  return event
    .composedPath()
    .some((node) => (node as PathNode)?.classList?.contains(DELETE_BUTTON_CLASS) === true);
}
