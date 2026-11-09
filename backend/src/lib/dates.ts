/**
 * Business-calendar date helpers.
 *
 * Every "today" comparison in the domain (batch expiry, FEFO eligibility,
 * nightly jobs, shelf-life status) must use the store's business time zone
 * (env.APP_TIMEZONE, default Asia/Dhaka), never the server's UTC clock.
 * Dates are exchanged as ISO calendar strings (YYYY-MM-DD), which is exactly
 * how Postgres `date` columns are read and written by Drizzle.
 */
import { env } from "../env";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Calendar date (YYYY-MM-DD) of `instant` in the business time zone. */
export function businessDate(instant: Date = new Date(), timeZone: string = env.APP_TIMEZONE): string {
  // The en-CA locale formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/** Today's calendar date (YYYY-MM-DD) in the business time zone. */
export function todayInBusinessTz(): string {
  return businessDate();
}

function toUtcMidnight(isoDate: string): number {
  if (!ISO_DATE.test(isoDate)) {
    throw new RangeError(`Expected a YYYY-MM-DD date, received "${isoDate}"`);
  }
  const [year, month, day] = isoDate.split("-").map(Number) as [number, number, number];
  return Date.UTC(year, month - 1, day);
}

/** Adds (or subtracts) whole days to a YYYY-MM-DD date. */
export function addDays(isoDate: string, days: number): string {
  return new Date(toUtcMidnight(isoDate) + days * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtcMidnight(to) - toUtcMidnight(from)) / MS_PER_DAY);
}

/** Days until `expiryDate` counted from today in the business time zone. */
export function daysUntil(expiryDate: string, today: string = todayInBusinessTz()): number {
  return daysBetween(today, expiryDate);
}

/** True for a well-formed YYYY-MM-DD string that is a real calendar date (e.g. rejects 2026-02-30). */
export function isIsoCalendarDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  const instant = new Date(Date.UTC(year, month - 1, day));
  return (
    instant.getUTCFullYear() === year &&
    instant.getUTCMonth() === month - 1 &&
    instant.getUTCDate() === day
  );
}
