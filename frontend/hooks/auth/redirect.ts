/**
 * Post-login redirect handling. Only same-origin, relative application paths
 * are honoured (`/checkout`, `/orders/ORD-…?placed=1`) — never absolute URLs,
 * protocol-relative `//host` URLs, backslash tricks or `javascript:` payloads.
 */

const AUTH_PAGES = new Set(["/login", "/register"]);
const PLACEHOLDER_ORIGIN = "https://my-oxygen.invalid";

function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x20 || code === 0x7f) {
      return true;
    }
  }
  return false;
}

/**
 * Returns a safe in-app path for `raw`, or `null` when it must be ignored.
 * Auth pages are rejected so a redirect can never loop back to /login.
 */
export function sanitizeRedirect(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") {
    return null;
  }
  const value = raw.trim();
  if (value === "" || value.length > 2048) {
    return null;
  }
  // Must be a root-relative path: "/x" but not "//x" or "/\x" (browsers treat both as host-relative).
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return null;
  }
  // Control characters, whitespace and backslashes can smuggle a host or scheme past naive checks.
  if (/[\s\\]/.test(value) || hasControlCharacter(value)) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(value, PLACEHOLDER_ORIGIN);
  } catch {
    return null;
  }
  if (url.origin !== PLACEHOLDER_ORIGIN) {
    return null;
  }
  if (AUTH_PAGES.has(url.pathname.replace(/\/+$/, "") || "/")) {
    return null;
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

/** `/login?redirect=<path>` (the redirect is dropped when unsafe). */
export function buildLoginHref(returnTo?: string | null): string {
  const safe = sanitizeRedirect(returnTo);
  return safe ? `/login?redirect=${encodeURIComponent(safe)}` : "/login";
}

/** `/register?redirect=<path>` (the redirect is dropped when unsafe). */
export function buildRegisterHref(returnTo?: string | null): string {
  const safe = sanitizeRedirect(returnTo);
  return safe ? `/register?redirect=${encodeURIComponent(safe)}` : "/register";
}
