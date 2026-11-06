/**
 * The default answer to "who is writing", when the host has not supplied one.
 *
 * The old default was a single fixed author, which reads as harmless until you
 * notice what it does to the default `canDelete`: if everyone shares a key,
 * everyone is the author of everything, and anyone can delete anything. That
 * was survivable while the only shipped store forgot everything on restart. It
 * is not survivable next to a file.
 *
 * So the default becomes an anonymous identity that is at least STABLE PER
 * BROWSER: a random key in a cookie the server issues. It is not authentication
 * and does not pretend to be — a new browser is a new person, and clearing
 * cookies loses the ability to delete your own comments. That limit is the
 * price of asking a host for nothing, and a host that needs more passes
 * `resolveAuthor`.
 *
 * The cookie value is a SECRET and never leaves the server. What a row is
 * stamped with — and what every list, SSE frame and `/me` hands out — is its
 * SHA-256 hex. Publishing the cookie value itself made `author_key` a bearer
 * token: read it from the public list, send it back as the cookie, delete the
 * row. The cookie is `HttpOnly` for the same reason; the widget learns its own
 * PUBLIC key from `GET {basePath}/me`.
 *
 * Rows written before this change were stamped with the raw cookie value, which
 * was already public. Those old cookies are refused (see `COOKIE_FORMAT`) and
 * replaced on the next request, and the old rows match nobody's key, so under
 * the default `canDelete` nobody — their author included — can delete them any
 * more. That is accepted on purpose: a key that has been published cannot be
 * trusted again, and a host that needs those rows gone removes them in its
 * store or through its own `canDelete`.
 *
 * Only a cookie in the exact shape this file mints is honoured. Anything else is
 * treated as no cookie and replaced, so a client cannot pick its own key.
 */

import type { Author } from "./types.ts";

export type AnonymousCookieOptions = {
  /** Cookie name. Defaults to `fusen_author`. */
  name?: string;
  /** Defaults to `Lax`. `None` (with `secure`) only matters to a cross-origin
   *  mount, which the server does not support: it sends no CORS headers. */
  sameSite?: "Lax" | "None";
  /** Defaults to "whatever the request scheme was", as the URL or a proxy's
   *  `X-Forwarded-Proto` reports it. */
  secure?: boolean;
  /** Defaults to a year. */
  maxAgeSec?: number;
  /** Prefix of the derived display name (`<prefix>-abcd`). Defaults to `Guest`. */
  namePrefix?: string;
};

/** An author, plus the `Set-Cookie` that has to ride along if one was minted. */
export type Identified = { author: Author; setCookie: string | null };

const DEFAULT_NAME = "fusen_author";
const DEFAULT_NAME_PREFIX = "Guest";
const DEFAULT_MAX_AGE_SEC = 31_536_000;
/** What `randomKey` mints: 24 random bytes as hex. Deliberately neither 32 hex
 *  (the cookies minted before keys were hashed, whose values are public in
 *  old rows) nor 64 hex (a published key), so neither is ever accepted. */
const COOKIE_FORMAT = /^[0-9a-f]{48}$/;

/** Read one cookie out of a request's `Cookie` header. */
export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function randomKey(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

/** The public key for a cookie secret. Web Crypto rather than `node:crypto`, so
 *  it runs on every Request/Response runtime this package claims. A plain hash
 *  is enough: the secret is 192 random bits, there is nothing to brute-force. */
export async function publicKeyFor(secret: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return toHex(new Uint8Array(digest));
}

/** Did the browser reach us over https? `fusen-serve` sits behind a TLS proxy
 *  on `http://127.0.0.1`, so the URL alone says no and the secret cookie would
 *  never be `Secure`; the proxy's `X-Forwarded-Proto` (its first hop, when it
 *  is a list) says yes. Trusting the header unchecked is safe because a spoofed
 *  value can only ADD `Secure`, which makes the cookie stricter, never looser. */
function isHttps(request: Request): boolean {
  if (new URL(request.url).protocol === "https:") return true;
  const forwarded = request.headers.get("x-forwarded-proto");
  return forwarded?.split(",")[0]?.trim().toLowerCase() === "https";
}

/** A name that distinguishes one anonymous writer from another in the panel,
 *  derived from the key so it needs nothing stored. */
function nameFor(key: string, prefix: string): string {
  return `${prefix}-${key.slice(0, 4)}`;
}

export function createAnonymousIdentity(
  options: AnonymousCookieOptions = {},
): (request: Request) => Promise<Identified> {
  const name = options.name ?? DEFAULT_NAME;
  const sameSite = options.sameSite ?? "Lax";
  const maxAgeSec = options.maxAgeSec ?? DEFAULT_MAX_AGE_SEC;
  const prefix = options.namePrefix ?? DEFAULT_NAME_PREFIX;

  return async (request: Request): Promise<Identified> => {
    const existing = readCookie(request, name);
    if (existing && COOKIE_FORMAT.test(existing)) {
      const key = await publicKeyFor(existing);
      return { author: { name: nameFor(key, prefix), key, picture: null }, setCookie: null };
    }

    const secret = randomKey();
    const key = await publicKeyFor(secret);
    const secure = options.secure ?? isHttps(request);
    const attributes = [
      `${name}=${secret}`,
      "Path=/",
      `Max-Age=${maxAgeSec}`,
      "HttpOnly",
      `SameSite=${sameSite}`,
    ];
    if (secure) attributes.push("Secure");

    return {
      author: { name: nameFor(key, prefix), key, picture: null },
      setCookie: attributes.join("; "),
    };
  };
}
