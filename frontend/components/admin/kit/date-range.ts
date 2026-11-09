/**
 * Report date ranges: inclusive `YYYY-MM-DD` business dates in Asia/Dhaka,
 * which is exactly how the API reads `from` / `to`. The API caps a range at
 * 366 days, so "All time" resolves to the last 366 days (labelled as such).
 */
import { addDaysToCalendarDate, todayInDhaka } from "../format";
import type { AdminDateRange } from "../../../types/admin-dashboard";

export const MAX_RANGE_DAYS = 366;

export const DATE_RANGE_PRESETS = [
  "today",
  "yesterday",
  "last7",
  "last30",
  "last3m",
  "last6m",
  "thisYear",
  "lastYear",
  "allTime",
  "custom",
] as const;

export type DateRangePreset = (typeof DATE_RANGE_PRESETS)[number];

/** A range plus the preset it came from (`custom` for hand-picked dates). */
export interface DateRangeValue extends AdminDateRange {
  preset: DateRangePreset;
}

export const DATE_RANGE_PRESET_LABELS: Record<DateRangePreset, string> = {
  today: "Today",
  yesterday: "Yesterday",
  last7: "Last 7 days",
  last30: "Last 30 days",
  last3m: "Last 3 months",
  last6m: "Last 6 months",
  thisYear: "This year",
  lastYear: "Last year",
  allTime: "All time",
  custom: "Custom range",
};

/** Label shown on the trigger (honest about the 366-day cap). */
const TRIGGER_LABELS: Record<DateRangePreset, string> = {
  ...DATE_RANGE_PRESET_LABELS,
  allTime: "Last 366 days",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/** Adds calendar months to a `YYYY-MM-DD` date, clamping the day (31 May − 3 months → 28/29 Feb). */
export function addMonthsToCalendarDate(date: string, months: number): string {
  const [y = "1970", m = "1", d = "1"] = date.split("-");
  const total = Number(y) * 12 + (Number(m) - 1) + months;
  const year = Math.floor(total / 12);
  const monthIndex = total - year * 12;
  const day = Math.min(Number(d), daysInMonth(year, monthIndex));
  return `${String(year).padStart(4, "0")}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Number of days in an inclusive range (`2026-09-20 … 2026-09-26` → 7). */
export function rangeDays(range: Partial<AdminDateRange> | null | undefined): number {
  if (!range?.from || !range.to) {
    return 0;
  }
  return Math.round((Date.parse(`${range.to}T00:00:00Z`) - Date.parse(`${range.from}T00:00:00Z`)) / 86_400_000) + 1;
}

/** Resolves a preset against today's Dhaka date. `custom` resolves to the last 7 days. */
export function resolvePresetRange(preset: DateRangePreset, today: string = todayInDhaka()): AdminDateRange {
  const year = Number(today.slice(0, 4));
  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "yesterday": {
      const day = addDaysToCalendarDate(today, -1);
      return { from: day, to: day };
    }
    case "last30":
      return { from: addDaysToCalendarDate(today, -29), to: today };
    case "last3m":
      return { from: addDaysToCalendarDate(addMonthsToCalendarDate(today, -3), 1), to: today };
    case "last6m":
      return { from: addDaysToCalendarDate(addMonthsToCalendarDate(today, -6), 1), to: today };
    case "thisYear":
      return { from: `${year}-01-01`, to: today };
    case "lastYear":
      return { from: `${year - 1}-01-01`, to: `${year - 1}-12-31` };
    case "allTime":
      return { from: addDaysToCalendarDate(today, -(MAX_RANGE_DAYS - 1)), to: today };
    case "last7":
    case "custom":
    default:
      return { from: addDaysToCalendarDate(today, -6), to: today };
  }
}

/** A ready-to-use range state value: `useState(() => createDateRange("last30"))`. */
export function createDateRange(preset: Exclude<DateRangePreset, "custom"> = "last7", today?: string): DateRangeValue {
  return { ...resolvePresetRange(preset, today), preset };
}

function parts(date: string): { day: number; month: string; year: string } {
  const [y = "", m = "1", d = "1"] = date.split("-");
  return { day: Number(d), month: MONTHS[Number(m) - 1] ?? "", year: y };
}

/** `20 Sep – 26 Sep 2026`, `28 Dec 2025 – 3 Jan 2026`, or `26 Sep 2026` for one day. */
export function formatRangeDates(range: AdminDateRange): string {
  const from = parts(range.from);
  const to = parts(range.to);
  if (range.from === range.to) {
    return `${to.day} ${to.month} ${to.year}`;
  }
  const left = from.year === to.year ? `${from.day} ${from.month}` : `${from.day} ${from.month} ${from.year}`;
  return `${left} – ${to.day} ${to.month} ${to.year}`;
}

/** Trigger text: `Last 7 days (20 Sep – 26 Sep 2026)`. */
export function formatRangeLabel(value: DateRangeValue): string {
  return `${TRIGGER_LABELS[value.preset]} (${formatRangeDates(value)})`;
}

/** Short caption for KPI trends: `vs previous 7 days`. */
export function previousPeriodCaption(range: AdminDateRange): string {
  const days = rangeDays(range);
  if (days === 1) {
    return "vs previous day";
  }
  return `vs previous ${days} days`;
}
