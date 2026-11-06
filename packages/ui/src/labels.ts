/**
 * Every string the widget puts on screen, in one overridable map.
 *
 * The defaults are English. A host that wants another language (or another
 * tone) passes a partial override; README.ja.md has a Japanese map to copy. There
 * is no i18n framework here on purpose — a label map is the smallest thing that
 * removes hardcoded copy without dictating a dependency.
 *
 * Entries that interpolate are functions rather than templates with
 * placeholders, so a translation can reorder or pluralize freely.
 */

const relative = new Intl.RelativeTimeFormat("en");

/** Relative-time wording. Lives here rather than in a date library because it
 *  is copy, and copy is overridable. */
function defaultFormatRelativeTime(iso: string): string {
  const diffS = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (diffS < 60) return "just now";
  const ago = (n: number, unit: Intl.RelativeTimeFormatUnit) =>
    relative.format(-Math.floor(n), unit);
  if (diffS < 3600) return ago(diffS / 60, "minute");
  if (diffS < 86400) return ago(diffS / 3600, "hour");
  if (diffS < 86400 * 30) return ago(diffS / 86400, "day");
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export type FeedbackLabels = {
  /** Badge cluster. */
  openPanel: string;
  startMode: string;
  endMode: string;
  /** Picking overlay. */
  pickHint: string;
  /** Composer. */
  composerPlaceholder: string;
  composerCount: (length: number, max: number) => string;
  composerCancel: string;
  composerSubmit: string;
  composerError: string;
  composerRetry: string;
  /** Panel. */
  panelTitle: string;
  panelEmpty: string;
  close: string;
  itemFocusHint: string;
  focusNotFound: string;
  /** Handed to the host (`onNotify` / `feedback-notify`) once a comment is sent. */
  sent: string;
  /** Shared between panel rows and pin popovers. */
  voteUp: string;
  deleteItem: string;
  deleteConfirmHint: string;
  deleteConfirmText: string;
  /** Pins. `description` comes from the core's describeAnchor(). */
  pinCluster: (count: number, description: string) => string;
  formatRelativeTime: (iso: string) => string;
};

export const DEFAULT_LABELS: FeedbackLabels = {
  openPanel: "Open the feedback list",
  startMode: "Start feedback mode",
  endMode: "End feedback mode",
  pickHint: "Tap the spot you want to comment on",
  composerPlaceholder: "What should change here?",
  composerCount: (length, max) => `${length}/${max}`,
  composerCancel: "Cancel",
  composerSubmit: "Post",
  composerError: "Could not send",
  composerRetry: "Retry",
  panelTitle: "Feedback",
  panelEmpty: "No feedback yet",
  close: "Close",
  itemFocusHint: "Show where this note is pinned",
  focusNotFound: "This note's spot is not on the current page",
  sent: "Sent",
  voteUp: "+1",
  deleteItem: "Withdraw this note",
  deleteConfirmHint: "Tap again to withdraw",
  deleteConfirmText: "Withdraw?",
  // Only called for clusters of two or more.
  pinCluster: (count, description) => `${count} comments: ${description}`,
  formatRelativeTime: defaultFormatRelativeTime,
};

/** Fill the gaps in a host's partial override. */
export function resolveLabels(overrides?: Partial<FeedbackLabels>): FeedbackLabels {
  return overrides ? { ...DEFAULT_LABELS, ...overrides } : DEFAULT_LABELS;
}
