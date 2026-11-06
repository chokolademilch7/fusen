/**
 * Wire types the core operates on, declared LOCALLY so this package has zero
 * dependencies (spec D5 / §4: core is dependency-free plain TypeScript).
 *
 * These are structurally identical to the zod-inferred types in the host's wire
 * package — the host keeps zod as the runtime validator at the HTTP boundary and
 * the core never validates, it only reads. Because both sides are checked by
 * `tsc` against the same shape, a divergence surfaces as a type error at the
 * host's adapter boundary rather than silently at runtime.
 *
 * `version: 1` is kept as a literal on purpose: the serialized anchor format is
 * versioned and must stay backward compatible from v1 onward (spec §6 D-list).
 */

/** Similarity signals captured alongside the selector path, used when the path misses. */
export type AnchorFingerprint = {
  tag: string;
  id?: string;
  /** `data-*` attributes minus the volatile ones — key WITHOUT the `data-` prefix. */
  dataAttrs: Record<string, string>;
  classList: string[];
  /** Whitespace-collapsed textContent, sliced to 40 chars. */
  textSnippet: string;
};

/** A remembered element location. Serialized into storage; format tagged v1. */
export type Anchor = {
  version: 1;
  route: string;
  selectorPath: string;
  fingerprint: AnchorFingerprint;
  /** Where inside the element's box the pin sat, as a 0..1 fraction of each axis. */
  rectRatio: { x: number; y: number };
};

/**
 * What the page was doing when the note was written.
 *
 * `machines` is REQUIRED and there is deliberately no URL or scroll field: the
 * host's wire schema is a strict-shape object and the server validates every
 * write against it. An earlier draft of the spec claimed a URL/scroll default;
 * that was withdrawn (D3) because it is unrepresentable here.
 */
export type PageContext = {
  version: 1;
  machines: Record<string, string>;
  playback?: { currentTime: number; duration: number; engine: "hls" | "native" };
  device?: { ua: string; viewport: string; standalone: boolean };
};
