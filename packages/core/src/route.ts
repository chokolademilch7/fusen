/**
 * The shape of a route both sides agree to store and to navigate to.
 *
 * A route ends up in the host's own router (`onNavigate` /
 * `feedback-navigate`). Writes are anonymous by default, so a stored
 * `javascript:alert(1)` or `https://evil.example` would reach every reader's
 * navigation hook as a single tap. A same-origin path is all the widget ever
 * captures, so that is all that is accepted:
 *
 *   - `""` — the element's default before the host sets `route`;
 *   - a path starting with exactly one `/` — not `//host` or `/\host`, which
 *     browsers resolve as protocol-relative URLs to another origin;
 *   - no control characters, which URL parsers strip (`/\t/evil.example`).
 */
export function isSafeRoute(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (value === "") return true;
  if (value[0] !== "/") return false;
  if (value[1] === "/" || value[1] === "\\") return false;
  // oxlint-disable-next-line no-control-regex
  return !/[\u0000-\u001f\u007f]/.test(value);
}
