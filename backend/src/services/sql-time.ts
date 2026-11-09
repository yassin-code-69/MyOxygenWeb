/**
 * SQL fragments for business-calendar reporting. Calendar dates (YYYY-MM-DD)
 * are interpreted in env.APP_TIMEZONE (default Asia/Dhaka), never in UTC.
 */
import { sql, type AnyColumn, type SQL } from "drizzle-orm";
import { env } from "../env";

/** timestamptz of 00:00 on `isoDate` in the business time zone. */
export function startOfBusinessDay(isoDate: string): SQL {
  return sql`((${isoDate})::date::timestamp AT TIME ZONE ${env.APP_TIMEZONE})`;
}

/** Business calendar date (YYYY-MM-DD text) of a timestamptz column. */
export function businessDayOf(column: AnyColumn): SQL<string> {
  return sql<string>`to_char((${column} AT TIME ZONE ${env.APP_TIMEZONE})::date, 'YYYY-MM-DD')`;
}

/** `column` falls on or after the business day `from` (inclusive). */
export function onOrAfterBusinessDay(column: AnyColumn, from: string): SQL {
  return sql`${column} >= ${startOfBusinessDay(from)}`;
}

/** `column` falls on or before the business day `to` (inclusive). */
export function onOrBeforeBusinessDay(column: AnyColumn, to: string): SQL {
  return sql`${column} < (((${to})::date + 1)::timestamp AT TIME ZONE ${env.APP_TIMEZONE})`;
}
