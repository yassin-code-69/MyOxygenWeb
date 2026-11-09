/**
 * Bangladesh mobile numbers. Accepted inputs: 01XXXXXXXXX, 1XXXXXXXXX,
 * 8801XXXXXXXXX and +8801XXXXXXXXX (operator digit 3-9), with optional
 * spaces, dashes or parentheses. Stored canonically as 01XXXXXXXXX.
 */
export const BANGLADESH_MOBILE_PATTERN = /^(?:\+?880|0)?1[3-9]\d{8}$/;
const CAPTURE = /^(?:\+?880|0)?(1[3-9]\d{8})$/;

function compact(raw: string): string {
  return raw.trim().replace(/[\s()-]/g, "");
}

/** 01XXXXXXXXX, or null when `raw` is not a Bangladeshi mobile number. */
export function normalizeBangladeshMobile(raw: string): string | null {
  const match = CAPTURE.exec(compact(raw));
  return match ? `0${match[1]}` : null;
}

/** 8801XXXXXXXXX (MSISDN used by SMS gateways), or null when invalid. */
export function toBangladeshMsisdn(raw: string): string | null {
  const local = normalizeBangladeshMobile(raw);
  return local === null ? null : `88${local}`;
}
