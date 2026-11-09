/**
 * Reporting periods, series buckets, KPIs and percentage helpers shared by the
 * dashboard (admin-telemetry.service.ts) and the reports under services/reports.
 *
 * Rules (docs/API_CONTRACT.md, "Admin v2"):
 *  - `from` / `to` are inclusive business dates (APP_TIMEZONE, Asia/Dhaka).
 *    A missing `to` is today; a missing `from` is `defaultDays - 1` days before
 *    `to`. The span may not exceed MAX_REPORT_RANGE_DAYS (366).
 *  - The previous period has the same number of days and ends the day before
 *    `from`: previousTo = from - 1, previousFrom = from - days.
 *  - Series use `day` buckets when the range is <= 92 days, else `month`
 *    buckets. Every bucket is present (zero-filled).
 *  - Kpi.changePercent = (value - previous) / |previous| * 100, rounded to 2
 *    decimals; null when previous = 0 (no baseline). Dividing by |previous|
 *    keeps the sign meaningful for values that can be negative (net profit).
 *  - Percentages of a whole are rounded to 2 decimals and are 0 (never NaN or
 *    Infinity) when the whole is 0.
 */
import { env } from "../../env";
import { addDays, daysBetween, todayInBusinessTz } from "../../lib/dates";
import { fieldValidationError } from "../service-utils";

export const MAX_REPORT_RANGE_DAYS = 366;
export const DAY_GRANULARITY_MAX_DAYS = 92;
export const DASHBOARD_DEFAULT_DAYS = 7;
export const REPORT_DEFAULT_DAYS = 30;

export type Granularity = "day" | "month";

export interface RangeQuery {
  from?: string;
  to?: string;
}

export interface ReportRange {
  from: string;
  to: string;
  timezone: string;
  previousFrom: string;
  previousTo: string;
  granularity: Granularity;
}

export interface ResolvedRange extends ReportRange {
  /** Number of days in the range (inclusive). */
  days: number;
}

export interface SeriesPoint {
  /** YYYY-MM-DD (day buckets) or YYYY-MM (month buckets). */
  period: string;
  /** "Sep 26" (day) or "Sep 2026" (month). */
  label: string;
}

export interface Kpi {
  value: number;
  previous: number;
  changePercent: number | null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

export function granularityFor(days: number): Granularity {
  return days <= DAY_GRANULARITY_MAX_DAYS ? "day" : "month";
}

/**
 * Resolves the requested period (defaults, previous period, granularity).
 * @throws 422 VALIDATION_ERROR when from > to or the span exceeds 366 days.
 */
export function resolveReportRange(
  query: RangeQuery,
  defaultDays: number,
  today: string = todayInBusinessTz(),
): ResolvedRange {
  const to = query.to ?? today;
  const from = query.from ?? addDays(to, -(defaultDays - 1));
  if (from > to) {
    throw fieldValidationError({ from: ["from must be on or before to"] });
  }
  const days = daysBetween(from, to) + 1;
  if (days > MAX_REPORT_RANGE_DAYS) {
    throw fieldValidationError({ to: [`The range must not exceed ${MAX_REPORT_RANGE_DAYS} days`] });
  }
  return {
    from,
    to,
    timezone: env.APP_TIMEZONE,
    previousFrom: addDays(from, -days),
    previousTo: addDays(from, -1),
    granularity: granularityFor(days),
    days,
  };
}

/** Public shape of a range (drops the internal `days`). */
export function publicRange(range: ResolvedRange): ReportRange {
  return {
    from: range.from,
    to: range.to,
    timezone: range.timezone,
    previousFrom: range.previousFrom,
    previousTo: range.previousTo,
    granularity: range.granularity,
  };
}

/** Bucket key of a business date: the date itself (day) or YYYY-MM (month). */
export function periodOf(date: string, granularity: Granularity): string {
  return granularity === "day" ? date : date.slice(0, 7);
}

export function periodLabel(period: string, granularity: Granularity): string {
  const [year, month, day] = period.split("-");
  const name = MONTHS[Number(month) - 1] ?? month ?? "";
  return granularity === "day" ? `${name} ${Number(day)}` : `${name} ${year ?? ""}`;
}

/** Every bucket of the range, in order (zero-fill template). */
export function seriesBuckets(range: Pick<ReportRange, "from" | "to" | "granularity">): SeriesPoint[] {
  const points: SeriesPoint[] = [];
  let last: string | null = null;
  for (let date = range.from; date <= range.to; date = addDays(date, 1)) {
    const period = periodOf(date, range.granularity);
    if (period !== last) {
      points.push({ period, label: periodLabel(period, range.granularity) });
      last = period;
    }
  }
  return points;
}

/**
 * Builds a zero-filled series from per-day rows (aggregated in SQL by business
 * day). Month buckets are summed from at most 366 daily rows.
 */
export function buildSeries<V extends Record<string, number>>(
  range: Pick<ReportRange, "from" | "to" | "granularity">,
  dailyRows: ReadonlyArray<{ date: string; values: V }>,
  zero: () => V,
): Array<SeriesPoint & V> {
  const totals = new Map<string, V>();
  for (const row of dailyRows) {
    const period = periodOf(row.date, range.granularity);
    const bucket = totals.get(period) ?? zero();
    for (const key of Object.keys(row.values) as Array<keyof V>) {
      const current = bucket[key] as number;
      bucket[key] = (current + (row.values[key] as number)) as V[keyof V];
    }
    totals.set(period, bucket);
  }
  return seriesBuckets(range).map((point) => ({ ...point, ...(totals.get(point.period) ?? zero()) }));
}

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** part / whole * 100, rounded to 2 decimals; 0 when whole is 0. */
export function percentOf(part: number, whole: number): number {
  if (whole === 0 || !Number.isFinite(whole)) return 0;
  return round2((part / whole) * 100);
}

/** Relative change in %, 2 decimals; null without a baseline (previous = 0). */
export function changePercent(value: number, previous: number): number | null {
  if (previous === 0) return null;
  return round2(((value - previous) / Math.abs(previous)) * 100);
}

export function kpi(value: number, previous: number): Kpi {
  return { value, previous, changePercent: changePercent(value, previous) };
}

/** Money KPI from integer paisa (exact), exposed in taka. */
export function moneyKpi(valuePaisa: number, previousPaisa: number): Kpi {
  return {
    value: Math.round(valuePaisa) / 100,
    previous: Math.round(previousPaisa) / 100,
    changePercent: changePercent(valuePaisa, previousPaisa),
  };
}

/** Average in paisa (rounded half away from zero); 0 when count is 0. */
export function averagePaisa(totalPaisa: number, count: number): number {
  return count === 0 ? 0 : Math.round(totalPaisa / count);
}
