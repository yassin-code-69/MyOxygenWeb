/**
 * Bangladesh mobile numbers — mirrors `backend/src/services/phone.ts` exactly.
 *
 * Accepted input: `01XXXXXXXXX`, `1XXXXXXXXX`, `8801XXXXXXXXX`, `+8801XXXXXXXXX`
 * (operator digit 3–9), with optional spaces, dashes or parentheses.
 * Canonical form (what the API stores for shipping addresses): `01XXXXXXXXX`.
 */

/** Same pattern as the backend (applied after removing spaces, dashes and parentheses). */
export const BANGLADESH_MOBILE_PATTERN = /^(?:\+?880|0)?1[3-9]\d{8}$/;

const CAPTURE = /^(?:\+?880|0)?(1[3-9]\d{8})$/;

/** Removes the separators users commonly type (`017-1234 5678`, `(+880) 1712…`). */
export function compactPhone(raw: string): string {
  return raw.trim().replace(/[\s()-]/g, "");
}

/** `01XXXXXXXXX`, or `null` when `raw` is not a Bangladeshi mobile number. */
export function normalizeBangladeshMobile(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") {
    return null;
  }
  const match = CAPTURE.exec(compactPhone(raw));
  return match ? `0${match[1]}` : null;
}

/** True when `raw` is a Bangladeshi mobile number in any accepted format. */
export function isBangladeshMobile(raw: string | null | undefined): boolean {
  return normalizeBangladeshMobile(raw) !== null;
}

/** `+8801XXXXXXXXX`, or `null` when invalid. */
export function toInternationalBangladeshMobile(raw: string | null | undefined): string | null {
  const local = normalizeBangladeshMobile(raw);
  return local === null ? null : `+88${local}`;
}

/** `01712345678` → `01712-345678` for display; other values are returned unchanged. */
export function formatBangladeshMobile(raw: string | null | undefined): string {
  const local = normalizeBangladeshMobile(raw);
  if (local === null) {
    return raw ?? "";
  }
  return `${local.slice(0, 5)}-${local.slice(5)}`;
}
