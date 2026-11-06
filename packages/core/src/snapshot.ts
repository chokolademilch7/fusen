import type { PageContext } from "./types.ts";

/**
 * Captures what the page was doing at the instant a note is written — state of
 * whatever state machines the host wants to report, media playback position,
 * and coarse device info — so a reader can reconstruct the situation without a
 * screenshot.
 *
 * This is purely additive metadata. It must NEVER block or fail a submission:
 * every slice is captured in isolation so one missing/broken piece (a host
 * probe that throws, no matchMedia, an odd test environment, a future browser
 * quirk) drops only that piece, and the outer call can never throw — worst case
 * it returns the minimal-but-valid `{ version: 1, machines: {} }`.
 *
 * The core knows nothing about the host's DOM conventions. The two probes that
 * used to be hardcoded here (`[data-machine]`/`data-state` scanning, and
 * inferring the playback engine from a `blob:` <video> src) are now supplied by
 * the host as contributors. Only the generic device probe remains built in, and
 * the caller can override it or switch it off.
 */

type Playback = NonNullable<PageContext["playback"]>;
type Device = NonNullable<PageContext["device"]>;

/**
 * Host-supplied slice producers, passed per call — there is deliberately no
 * module-level registry, so two widget instances on the same page cannot stomp
 * on each other's configuration.
 *
 * Every contributor may throw or return `undefined`; either way only its own
 * slice is dropped. Returning a value the wire schema would reject also just
 * drops the slice.
 *
 * `device` is the one slice with a built-in default: leaving it `undefined`
 * (or omitting the key) uses the built-in browser probe, a function overrides
 * it, and `null` is the explicit off switch. Note the asymmetry — a host
 * building options as `{ device: enabled ? probe : undefined }` gets the
 * built-in probe, not "no device"; it must pass `null` to disable.
 */
export type PageContextContributors = {
  machines?: () => Record<string, string> | undefined;
  playback?: () => Playback | undefined;
  device?: (() => Device | undefined) | null;
};

/** Runs a slice producer so that a throw is indistinguishable from "no data". */
function attempt<T>(produce: () => T | undefined): T | undefined {
  try {
    return produce();
  } catch {
    return undefined;
  }
}

/** Keeps only string→string entries so a sloppy contributor cannot emit a
 *  machines map the wire schema would reject. */
function normalizeMachines(raw: Record<string, string> | undefined): Record<string, string> {
  if (!raw || typeof raw !== "object") return {};
  const machines: Record<string, string> = {};
  for (const [name, state] of Object.entries(raw)) {
    if (!name) continue;
    if (typeof state !== "string") continue;
    machines[name] = state;
  }
  return machines;
}

/** Round to 1 decimal; NaN/Infinity (e.g. metadata not yet loaded) → null so
 *  the caller can omit playback entirely rather than saving a bogus value. */
function roundedOrNull(n: unknown): number | null {
  return typeof n === "number" && Number.isFinite(n) ? Math.round(n * 10) / 10 : null;
}

/** A non-finite currentTime OR duration guards out the whole playback field,
 *  not just the bad value. Same for an engine outside the wire's enum. */
function normalizePlayback(raw: Playback | undefined): Playback | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const currentTime = roundedOrNull(raw.currentTime);
  const duration = roundedOrNull(raw.duration);
  if (currentTime === null || duration === null) return undefined;
  if (raw.engine !== "hls" && raw.engine !== "native") return undefined;
  return { currentTime, duration, engine: raw.engine };
}

function normalizeDevice(raw: Device | undefined): Device | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  if (typeof raw.ua !== "string" || typeof raw.viewport !== "string") return undefined;
  if (typeof raw.standalone !== "boolean") return undefined;
  return { ua: raw.ua, viewport: raw.viewport, standalone: raw.standalone };
}

/**
 * Built-in device probe. Every global it needs is feature-checked by `typeof`
 * rather than assumed: outside a browser `innerWidth` is `undefined`, and
 * `` `${undefined}x${undefined}` `` is still a *string*, so a shape check alone
 * would happily emit "undefinedxundefined" to the wire. Failing the check drops
 * the device slice deterministically instead of depending on whether a bare
 * reference happens to throw.
 */
function captureDevice(): Device | undefined {
  const g = globalThis as unknown as {
    navigator?: { userAgent?: unknown };
    innerWidth?: unknown;
    innerHeight?: unknown;
    matchMedia?: (query: string) => { matches: boolean };
  };
  const ua = g.navigator?.userAgent;
  if (typeof ua !== "string" || ua.length === 0) return undefined;
  if (typeof g.innerWidth !== "number" || typeof g.innerHeight !== "number") return undefined;
  if (typeof g.matchMedia !== "function") return undefined;
  return {
    ua,
    viewport: `${g.innerWidth}x${g.innerHeight}`,
    standalone: g.matchMedia("(display-mode: standalone)").matches === true,
  };
}

/**
 * Never throws. Never returns a shape the host's strict wire schema would
 * reject: `machines` is always present (`{}` at minimum) and the optional
 * fields are omitted entirely rather than set to a partial value.
 */
export function capturePageContext(contributors: PageContextContributors = {}): PageContext {
  try {
    const machines = normalizeMachines(
      contributors.machines ? attempt(contributors.machines) : undefined,
    );

    const playback = contributors.playback
      ? normalizePlayback(attempt(contributors.playback))
      : undefined;

    const deviceProbe =
      contributors.device === null ? undefined : (contributors.device ?? captureDevice);
    const device = deviceProbe ? normalizeDevice(attempt(deviceProbe)) : undefined;

    return {
      version: 1,
      machines,
      ...(playback ? { playback } : {}),
      ...(device ? { device } : {}),
    };
  } catch {
    return { version: 1, machines: {} };
  }
}
