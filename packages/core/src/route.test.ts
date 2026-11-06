import { expect, test } from "bun:test";
import { isSafeRoute } from "./route.ts";

test("same-origin paths and the empty default are safe", () => {
  for (const r of ["", "/", "/watch/1", "/a?b=1#c", "/café", "/\u65e5\u672c"])
    expect(isSafeRoute(r)).toBe(true);
});

test("scripts, external and protocol-relative URLs are not", () => {
  for (const r of [
    "javascript:alert(1)",
    " javascript:alert(1)",
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/\t/evil.example",
    "watch/1",
    "data:text/html,x",
  ]) {
    expect(isSafeRoute(r)).toBe(false);
  }
  expect(isSafeRoute(null)).toBe(false);
  expect(isSafeRoute(1)).toBe(false);
});
