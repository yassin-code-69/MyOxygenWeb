/**
 * Locale-stable formatting helpers (identical output on server and client,
 * so they are safe to use during SSR without hydration mismatches).
 */
import { currency } from "../tokens/typography";

/** Coerce API money values (`"1250.00"`, `1250`, `null`) to a finite number. */
export function toNumber(value: number | string | null | undefined, fallback = 0): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

const integerFormatter = new Intl.NumberFormat(currency.locale, {
  maximumFractionDigits: 0,
});

const decimalFormatter = new Intl.NumberFormat(currency.locale, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export interface FormatBDTOptions {
  /** Show paisa (2 decimals). Defaults to `"auto"`: decimals only when non-zero. */
  decimals?: boolean | "auto";
  /** Prefix with `৳`. Default `true`. */
  withSymbol?: boolean;
}

/**
 * Format an amount in Bangladeshi Taka with lakh/crore grouping:
 * `formatBDT(125000)` → `"৳1,25,000"`, `formatBDT("99.50")` → `"৳99.50"`.
 */
export function formatBDT(
  value: number | string | null | undefined,
  { decimals = "auto", withSymbol = true }: FormatBDTOptions = {}
): string {
  const amount = toNumber(value);
  const showDecimals = decimals === "auto" ? !Number.isInteger(amount) : decimals;
  const formatted = (showDecimals ? decimalFormatter : integerFormatter).format(amount);
  return withSymbol ? `${currency.symbol}${formatted}` : formatted;
}

/** Discount percentage between a base and an effective price (0 when not discounted). */
export function discountPercent(
  basePrice: number | string | null | undefined,
  effectivePrice: number | string | null | undefined
): number {
  const base = toNumber(basePrice);
  const effective = toNumber(effectivePrice, base);
  if (base <= 0 || effective >= base) {
    return 0;
  }
  return Math.round(((base - effective) / base) * 100);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Parse an ISO date or `YYYY-MM-DD` string. Date-only strings are treated as
 * calendar dates (no timezone shift), which is what batch expiry dates are.
 */
export function parseDate(value: string | Date | null | undefined): Date | null {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) {
    const [, y, m, d] = dateOnly;
    return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** `"2027-03-31"` → `"Mar 2027"` (UTC calendar month; stable across server/client). */
export function formatMonthYear(value: string | Date | null | undefined): string | null {
  const date = parseDate(value);
  if (!date) {
    return null;
  }
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** `"2027-03-31"` → `"31 Mar 2027"`. */
export function formatDayMonthYear(value: string | Date | null | undefined): string | null {
  const date = parseDate(value);
  if (!date) {
    return null;
  }
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}
