import { afterEach, describe, expect, test } from "bun:test";
import type { PageContext } from "./types.ts";
import { capturePageContext } from "./snapshot.ts";

// ---------------------------------------------------------------------------
// This suite runs under `bun test --conditions=browser`, which is plain Bun —
// there is no jsdom/happy-dom in this repo, and none is added here (see
// anchor.test.ts for the same hand-rolled-fixture constraint). Bun defines
// `navigator.userAgent` ("Bun/x.y.z") but leaves `innerWidth`/`innerHeight`/
// `matchMedia` undefined (verified empirically), so the built-in device probe
// feature-checks its way to "no device" by default. Tests that want a device
// slice stub only those globals, and afterEach tears them back down so the
// unstubbed non-browser environment stays the genuine default state.
// ---------------------------------------------------------------------------

function stubDeviceGlobals(width: number, height: number, standalone: boolean): void {
  (globalThis as unknown as { innerWidth: number }).innerWidth = width;
  (globalThis as unknown as { innerHeight: number }).innerHeight = height;
  (globalThis as unknown as { matchMedia: (q: string) => { matches: boolean } }).matchMedia = (
    q: string,
  ) => ({ matches: standalone && q.includes("standalone") });
}

afterEach(() => {
  delete (globalThis as unknown as { innerWidth?: unknown }).innerWidth;
  delete (globalThis as unknown as { innerHeight?: unknown }).innerHeight;
  delete (globalThis as unknown as { matchMedia?: unknown }).matchMedia;
});

/** Asserts the invariants the host's strict wire schema enforces: `version: 1`,
 *  `machines` present and string→string, optional fields either absent or
 *  fully-formed, and no extra keys. */
function expectShapeValid(ctx: PageContext): void {
  expect(ctx).not.toBeNull();
  expect(ctx.version).toBe(1);
  expect(typeof ctx.machines).toBe("object");
  expect(ctx.machines).not.toBeNull();
  for (const [name, state] of Object.entries(ctx.machines)) {
    expect(typeof name).toBe("string");
    expect(typeof state).toBe("string");
  }
  expect(
    Object.keys(ctx).every((k) => ["version", "machines", "playback", "device"].includes(k)),
  ).toBe(true);
  const playback = ctx.playback;
  if (playback !== undefined) {
    expect(Number.isFinite(playback.currentTime)).toBe(true);
    expect(Number.isFinite(playback.duration)).toBe(true);
    expect(["hls", "native"]).toContain(playback.engine);
  }
  const device = ctx.device;
  if (device !== undefined) {
    expect(typeof device.ua).toBe("string");
    expect(device.ua.length).toBeGreaterThan(0);
    expect(device.viewport).toMatch(/^\d+x\d+$/);
    expect(typeof device.standalone).toBe("boolean");
  }
}

describe("capturePageContext — defaults", () => {
  test("no contributors at all yields the minimal valid context, never throws", () => {
    expect(() => capturePageContext()).not.toThrow();
    const ctx = capturePageContext();
    expect(ctx.machines).toEqual({});
    expect(ctx.playback).toBeUndefined();
    expectShapeValid(ctx);
  });

  test("no-arg call is equivalent to an empty contributors object", () => {
    expect(capturePageContext()).toEqual(capturePageContext({}));
  });

  test("built-in device probe drops the slice outside a browser rather than emitting 'undefinedxundefined'", () => {
    const ctx = capturePageContext();
    expect(ctx.device).toBeUndefined();
    expect("device" in ctx).toBe(false);
    expectShapeValid(ctx);
  });

  test("built-in device probe populates ua/viewport/standalone from browser globals", () => {
    stubDeviceGlobals(390, 844, true);

    const ctx = capturePageContext();

    expect(ctx.device?.viewport).toBe("390x844");
    expect(ctx.device?.standalone).toBe(true);
    expect(typeof ctx.device?.ua).toBe("string");
    expect(ctx.device?.ua.length).toBeGreaterThan(0);
    expectShapeValid(ctx);
  });
});

describe("capturePageContext — contributors", () => {
  test("all three fields populated via contributors", () => {
    const ctx = capturePageContext({
      machines: () => ({ feedback: "mode.picking", library: "ready.grid" }),
      playback: () => ({ currentTime: 42.3, duration: 120, engine: "hls" }),
      device: () => ({ ua: "TestAgent/1.0", viewport: "1280x720", standalone: false }),
    });

    expect(ctx).toEqual({
      version: 1,
      machines: { feedback: "mode.picking", library: "ready.grid" },
      playback: { currentTime: 42.3, duration: 120, engine: "hls" },
      device: { ua: "TestAgent/1.0", viewport: "1280x720", standalone: false },
    });
    expectShapeValid(ctx);
  });

  test("a device contributor overrides the built-in probe", () => {
    stubDeviceGlobals(390, 844, true);

    const ctx = capturePageContext({
      device: () => ({ ua: "Override/1.0", viewport: "800x600", standalone: false }),
    });

    expect(ctx.device).toEqual({ ua: "Override/1.0", viewport: "800x600", standalone: false });
    expectShapeValid(ctx);
  });

  test("device: undefined means 'use the default', NOT 'no device' — the `cond ? probe : undefined` footgun", () => {
    stubDeviceGlobals(1024, 768, false);

    const ctx = capturePageContext({ device: undefined });

    expect(ctx.device).toBeDefined();
    expect(ctx.device?.viewport).toBe("1024x768");
    expect(ctx.device?.standalone).toBe(false);
    expectShapeValid(ctx);
  });

  test("device: null disables the built-in probe even in a browser-like env", () => {
    stubDeviceGlobals(390, 844, true);

    const ctx = capturePageContext({ machines: () => ({ player: "playing" }), device: null });

    expect(ctx.device).toBeUndefined();
    expect("device" in ctx).toBe(false);
    expect(ctx.machines).toEqual({ player: "playing" });
    expectShapeValid(ctx);
  });

  test("playback is omitted when the contributor reports no media", () => {
    const ctx = capturePageContext({
      machines: () => ({ library: "ready.grid" }),
      playback: () => undefined,
    });

    expect(ctx.playback).toBeUndefined();
    expect("playback" in ctx).toBe(false);
    expectShapeValid(ctx);
  });

  test("both engine values pass through unchanged (the blob:-src inference is the host's job)", () => {
    const hls = capturePageContext({
      playback: () => ({ currentTime: 5, duration: 60, engine: "hls" }),
    });
    const native = capturePageContext({
      playback: () => ({ currentTime: 5, duration: 60, engine: "native" }),
    });

    expect(hls.playback?.engine).toBe("hls");
    expect(native.playback?.engine).toBe("native");
    expectShapeValid(hls);
    expectShapeValid(native);
  });

  test("currentTime/duration are rounded to 1 decimal", () => {
    const ctx = capturePageContext({
      playback: () => ({ currentTime: 42.34, duration: 119.96, engine: "hls" }),
    });

    expect(ctx.playback).toEqual({ currentTime: 42.3, duration: 120, engine: "hls" });
    expectShapeValid(ctx);
  });

  test("NaN duration (metadata not yet loaded) guards the whole playback field out, not just the bad value", () => {
    const ctx = capturePageContext({
      machines: () => ({ player: "loading" }),
      playback: () => ({ currentTime: 3.2, duration: Number.NaN, engine: "hls" }),
    });

    expect(ctx.playback).toBeUndefined();
    // the rest of the snapshot is unaffected by the guarded field
    expect(ctx.machines).toEqual({ player: "loading" });
    expectShapeValid(ctx);
  });

  test("Infinity currentTime also drops the whole playback field", () => {
    const ctx = capturePageContext({
      playback: () => ({ currentTime: Number.POSITIVE_INFINITY, duration: 60, engine: "hls" }),
    });

    expect(ctx.playback).toBeUndefined();
    expectShapeValid(ctx);
  });
});

describe("capturePageContext — per-slice isolation", () => {
  test("a throwing machines contributor is isolated; playback and device survive", () => {
    const ctx = capturePageContext({
      machines: () => {
        throw new Error("machines probe exploded");
      },
      playback: () => ({ currentTime: 1.5, duration: 10, engine: "native" }),
      device: () => ({ ua: "TestAgent/1.0", viewport: "1280x720", standalone: false }),
    });

    expect(ctx.machines).toEqual({});
    expect(ctx.playback).toEqual({ currentTime: 1.5, duration: 10, engine: "native" });
    expect(ctx.device?.ua).toBe("TestAgent/1.0");
    expectShapeValid(ctx);
  });

  test("a throwing playback contributor is isolated; machines and device survive", () => {
    const ctx = capturePageContext({
      machines: () => ({ player: "playing.unmuted" }),
      playback: () => {
        throw new Error("no media element");
      },
      device: () => ({ ua: "TestAgent/1.0", viewport: "1280x720", standalone: false }),
    });

    expect(ctx.machines).toEqual({ player: "playing.unmuted" });
    expect(ctx.playback).toBeUndefined();
    expect(ctx.device?.viewport).toBe("1280x720");
    expectShapeValid(ctx);
  });

  test("a throwing device contributor is isolated; machines and playback survive", () => {
    const ctx = capturePageContext({
      machines: () => ({ player: "playing.unmuted" }),
      playback: () => ({ currentTime: 2, duration: 30, engine: "hls" }),
      device: () => {
        throw new Error("matchMedia missing");
      },
    });

    expect(ctx.device).toBeUndefined();
    expect(ctx.machines).toEqual({ player: "playing.unmuted" });
    expect(ctx.playback).toEqual({ currentTime: 2, duration: 30, engine: "hls" });
    expectShapeValid(ctx);
  });

  test("every contributor throwing still yields a shape-valid minimal context", () => {
    const boom = (): never => {
      throw new Error("boom");
    };
    const ctx = capturePageContext({ machines: boom, playback: boom, device: boom });

    expect(ctx).toEqual({ version: 1, machines: {} });
    expectShapeValid(ctx);
  });
});

describe("capturePageContext — rejects unwire-able contributor output", () => {
  test("a machines contributor returning non-string states drops only those entries", () => {
    const ctx = capturePageContext({
      machines: () =>
        ({ good: "ready", bad: 42, alsoBad: null }) as unknown as Record<string, string>,
    });

    expect(ctx.machines).toEqual({ good: "ready" });
    expectShapeValid(ctx);
  });

  test("a machines contributor returning a non-object degrades to {}", () => {
    const ctx = capturePageContext({
      machines: () => "nope" as unknown as Record<string, string>,
    });

    expect(ctx.machines).toEqual({});
    expectShapeValid(ctx);
  });

  test("an engine value outside the wire enum drops the playback field", () => {
    const ctx = capturePageContext({
      playback: () =>
        ({ currentTime: 1, duration: 2, engine: "dash" }) as unknown as NonNullable<
          PageContext["playback"]
        >,
    });

    expect(ctx.playback).toBeUndefined();
    expectShapeValid(ctx);
  });

  test("a partial device object drops the device field rather than emitting half of it", () => {
    const ctx = capturePageContext({
      device: () => ({ ua: "TestAgent/1.0" }) as unknown as NonNullable<PageContext["device"]>,
    });

    expect(ctx.device).toBeUndefined();
    expectShapeValid(ctx);
  });
});
