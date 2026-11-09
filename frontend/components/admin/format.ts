/**
 * Back-office formatting helpers. Every timestamp is shown in Asia/Dhaka
 * (the business timezone, UTC+6, no DST) regardless of the viewer's device.
 */
import { formatBDT, formatDayMonthYear } from "../../lib/format";

export const BUSINESS_TIMEZONE = "Asia/Dhaka";
/** Bangladesh has a fixed UTC offset (no daylight saving). */
export const BUSINESS_UTC_OFFSET = "+06:00";

/**
 * One formatter for every Dhaka wall-clock part. `en-US` short months are
 * always three letters (`en-GB` now prints "Sept"), so dates read the same as
 * `formatCalendarDate` everywhere in the back-office.
 */
const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: BUSINESS_TIMEZONE,
  weekday: "short",
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

interface DhakaParts {
  weekday: string;
  day: string;
  month: string;
  year: string;
  hour: string;
  minute: string;
  dayPeriod: string;
}

function dhakaParts(date: Date): DhakaParts {
  const parts = partsFormatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    weekday: get("weekday"),
    day: get("day"),
    month: get("month"),
    year: get("year"),
    hour: get("hour"),
    minute: get("minute"),
    dayPeriod: get("dayPeriod"),
  };
}

/** `en-CA` yields ISO-like `YYYY-MM-DD`. */
const isoDayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const isoTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: BUSINESS_TIMEZONE,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

const integerFormatter = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** `09 Nov 2026, 6:25 pm` in Dhaka time; `—` for empty values. */
export function formatDhakaDateTime(value: string | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) {
    return "—";
  }
  const p = dhakaParts(date);
  return `${p.day} ${p.month} ${p.year}, ${p.hour}:${p.minute} ${p.dayPeriod.toLowerCase()}`;
}

/** `09 Nov 2026` (Dhaka day) for an ISO timestamp; `—` for empty values. */
export function formatDhakaDate(value: string | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) {
    return "—";
  }
  const p = dhakaParts(date);
  return `${p.day} ${p.month} ${p.year}`;
}

/** Calendar date (`YYYY-MM-DD`, e.g. a batch expiry) → `5 Sep 2027`, no timezone shift. */
export function formatCalendarDate(value: string | null | undefined): string {
  return formatDayMonthYear(value) ?? "—";
}

/** Today's date in Dhaka as `YYYY-MM-DD`. */
export function todayInDhaka(now: Date = new Date()): string {
  return isoDayFormatter.format(now);
}

/** Adds whole days to a `YYYY-MM-DD` date. */
export function addDaysToCalendarDate(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

/**
 * A Mantine `DateTimePicker` value (`YYYY-MM-DD HH:mm:ss`, wall-clock time in
 * Dhaka) → ISO-8601 with the Dhaka offset, as the API expects.
 */
export function dhakaWallTimeToIso(value: string): string {
  const [datePart, timePart = "00:00:00"] = value.trim().split(/[ T]/);
  const time = timePart.length === 5 ? `${timePart}:00` : timePart;
  return `${datePart}T${time}${BUSINESS_UTC_OFFSET}`;
}

/** ISO timestamp → Dhaka wall-clock `YYYY-MM-DD HH:mm:ss` for a `DateTimePicker`. */
export function isoToDhakaWallTime(value: string | null | undefined): string | null {
  const date = toDate(value);
  if (!date) {
    return null;
  }
  return `${isoDayFormatter.format(date)} ${isoTimeFormatter.format(date)}`;
}

/** Epoch milliseconds of a Dhaka wall-clock picker value. */
export function dhakaWallTimeToMs(value: string): number {
  return new Date(dhakaWallTimeToIso(value)).getTime();
}

/** Grouped integer (`1,25,000`). */
export function formatCount(value: number): string {
  return integerFormatter.format(value);
}

/** Money in BDT with paisa only when present. */
export function formatMoney(value: number | null | undefined): string {
  return formatBDT(value ?? 0);
}

/** Signed integer with a real minus sign (`+12`, `−3`). */
export function formatSignedDelta(value: number): string {
  if (value > 0) {
    return `+${formatCount(value)}`;
  }
  if (value < 0) {
    return `−${formatCount(Math.abs(value))}`;
  }
  return "0";
}

/** `"MANUAL_ADJUSTMENT"` → `"Manual adjustment"`. */
export function humanizeEnum(value: string): string {
  const text = value.replace(/_/g, " ").toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Initials for an avatar (`"Ayesha Rahman"` → `"AR"`). */
export function initialsOf(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return "?";
  }
  const first = parts[0]?.charAt(0) ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.charAt(0) ?? "") : "";
  return `${first}${last}`.toUpperCase();
}

/** Remaining time in a compact form (`2d 4h`, `3h 12m`, `45m`). */
export function formatCountdown(ms: number): string {
  if (ms <= 0) {
    return "ended";
  }
  const totalMinutes = Math.floor(ms / 60_000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${Math.max(minutes, 1)}m`;
}

/** `6:42 AM` in Dhaka time; `—` for empty values. */
export function formatDhakaTime(value: string | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) {
    return "—";
  }
  const p = dhakaParts(date);
  return `${p.hour}:${p.minute} ${p.dayPeriod}`;
}

/** `Tue, 26 Sep 2026` in Dhaka time. */
export function formatDhakaWeekdayDate(value: string | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) {
    return "—";
  }
  const p = dhakaParts(date);
  return `${p.weekday}, ${Number(p.day)} ${p.month} ${p.year}`;
}

const relativeFormatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/**
 * Short relative time for activity feeds: `just now`, `12 minutes ago`,
 * `3 hours ago`, `yesterday`, `4 days ago`; older than 30 days → the Dhaka date.
 */
export function formatRelativeTime(value: string | Date | null | undefined, now: number = Date.now()): string {
  const date = toDate(value);
  if (!date) {
    return "—";
  }
  const seconds = Math.round((date.getTime() - now) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 45) {
    return "just now";
  }
  if (abs < 3600) {
    return relativeFormatter.format(Math.round(seconds / 60), "minute");
  }
  if (abs < 86_400) {
    return relativeFormatter.format(Math.round(seconds / 3600), "hour");
  }
  if (abs < 30 * 86_400) {
    return relativeFormatter.format(Math.round(seconds / 86_400), "day");
  }
  return formatDhakaDate(date);
}

/**
 * Compact relative time for narrow lists: `just now`, `9 min ago`,
 * `3 hr ago`, `2 days ago`; older than 30 days → the Dhaka date.
 */
export function formatRelativeTimeShort(value: string | Date | null | undefined, now: number = Date.now()): string {
  const date = toDate(value);
  if (!date) {
    return "—";
  }
  const seconds = Math.max(0, Math.round((now - date.getTime()) / 1000));
  if (seconds < 45) {
    return "just now";
  }
  if (seconds < 3600) {
    return `${Math.max(1, Math.round(seconds / 60))} min ago`;
  }
  if (seconds < 86_400) {
    return `${Math.round(seconds / 3600)} hr ago`;
  }
  const days = Math.round(seconds / 86_400);
  if (days < 30) {
    return days === 1 ? "1 day ago" : `${days} days ago`;
  }
  return formatDhakaDate(date);
}

/** Compact Taka for chart axes: `৳950`, `৳45K`, `৳1.2L` (lakh), `৳3.4Cr` (crore). */
export function formatCompactTaka(value: number): string {
  const sign = value < 0 ? "−" : "";
  const abs = Math.abs(value);
  if (abs >= 10_000_000) {
    return `${sign}৳${Number((abs / 10_000_000).toFixed(1))}Cr`;
  }
  if (abs >= 100_000) {
    return `${sign}৳${Number((abs / 100_000).toFixed(1))}L`;
  }
  if (abs >= 1000) {
    return `${sign}৳${Number((abs / 1000).toFixed(1))}K`;
  }
  return `${sign}৳${formatCount(abs)}`;
}

/** Compact count for chart axes: `950`, `1.2K`, `3.4L`. */
export function formatCompactCount(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "−" : "";
  if (abs >= 100_000) {
    return `${sign}${Number((abs / 100_000).toFixed(1))}L`;
  }
  if (abs >= 1000) {
    return `${sign}${Number((abs / 1000).toFixed(1))}K`;
  }
  return `${sign}${formatCount(abs)}`;
}

/** `12.5%` (trailing zeros dropped, `digits` max decimals). */
export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  return `${Number(value.toFixed(digits))}%`;
}

/** First word of a full name (`"Ayesha Rahman"` → `"Ayesha"`). */
export function firstNameOf(name: string | null | undefined): string {
  return (name ?? "").trim().split(/\s+/)[0] ?? "";
}

/** `"1 item"` / `"3 items"`. */
export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${formatCount(count)} ${count === 1 ? singular : plural}`;
}

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  COD: "Cash on delivery",
  ONLINE_GATEWAY: "Online payment",
};

export function paymentMethodLabel(method: string): string {
  return PAYMENT_METHOD_LABELS[method] ?? humanizeEnum(method);
}

export const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Super admin",
  INVENTORY_MANAGER: "Inventory manager",
  ORDER_MANAGER: "Order manager",
  MARKETING_MANAGER: "Marketing manager",
  SUPPORT_STAFF: "Support staff",
  CUSTOMER: "Customer",
};

export function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? humanizeEnum(role);
}
