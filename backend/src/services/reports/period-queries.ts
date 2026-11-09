/**
 * Period aggregates shared by the dashboard and the reports. Each function is
 * ONE query that returns the current range and its previous period together
 * (FILTER clauses over the window [previousFrom, to]).
 */
import { and, eq, sql, type SQL } from "drizzle-orm";
import { orderItems, orders, users } from "../../db/schema/tables";
import { env } from "../../env";
import type { DbExecutor } from "../db-executor";
import { toPaisa } from "../order-pricing";
import { businessDayOf, startOfBusinessDay } from "../sql-time";
import type { ReportRange } from "./range";
import { revenueOrderCondition, sumInt, sumMoney, withinBusinessDays } from "./sql";

export interface OrderPeriodTotals {
  /** Every order placed in the period (all statuses). */
  orders: number;
  /** Orders that count as revenue (not CANCELLED / REFUNDED). */
  revenueOrders: number;
  revenuePaisa: number;
  /** SUM(order_items.unit_cost * quantity) of revenue orders. */
  cogsPaisa: number;
  /** SUM(order_items.quantity) of revenue orders. */
  unitsSold: number;
}

export interface PeriodPair<T> {
  current: T;
  previous: T;
}

/** `"orders"."id"` of the outer query, for correlated subqueries (never re-bound by Drizzle). */
export const outerOrderId: SQL = sql.raw(`"orders"."id"`);

/** COGS of the order in scope (correlated subquery, uses order_items_order_idx). */
export const orderCogsSql: SQL = sql`(SELECT coalesce(sum(oi.unit_cost * oi.quantity), 0) FROM order_items oi WHERE oi.order_id = ${outerOrderId})`;

/** End of the business day `to` (exclusive upper bound) as timestamptz. */
export function endOfBusinessDay(to: string): SQL {
  return sql`(((${to})::date + 1)::timestamp AT TIME ZONE ${env.APP_TIMEZONE})`;
}

/** Orders, revenue, COGS and units of the range and of the previous period (2 queries). */
export async function orderTotalsByPeriod(db: DbExecutor, range: ReportRange): Promise<PeriodPair<OrderPeriodTotals>> {
  const window = withinBusinessDays(orders.createdAt, range.previousFrom, range.to);
  const isCurrent = sql`${orders.createdAt} >= ${startOfBusinessDay(range.from)}`;
  const isPrevious = sql`${orders.createdAt} < ${startOfBusinessDay(range.from)}`;
  const revenue = revenueOrderCondition();
  const currentRevenue = sql`${isCurrent} AND ${revenue}`;
  const previousRevenue = sql`${isPrevious} AND ${revenue}`;

  const [orderRow] = await db
    .select({
      orders: sql<string>`count(*) FILTER (WHERE ${isCurrent})`,
      revenueOrders: sql<string>`count(*) FILTER (WHERE ${currentRevenue})`,
      revenue: sumMoney(orders.total, currentRevenue),
      cogs: sumMoney(orderCogsSql, currentRevenue),
      previousOrders: sql<string>`count(*) FILTER (WHERE ${isPrevious})`,
      previousRevenueOrders: sql<string>`count(*) FILTER (WHERE ${previousRevenue})`,
      previousRevenue: sumMoney(orders.total, previousRevenue),
      previousCogs: sumMoney(orderCogsSql, previousRevenue),
    })
    .from(orders)
    .where(window);

  const [unitRow] = await db
    .select({
      current: sumInt(orderItems.quantity, isCurrent),
      previous: sumInt(orderItems.quantity, isPrevious),
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(and(window, revenue));

  return {
    current: {
      orders: Number(orderRow?.orders ?? 0),
      revenueOrders: Number(orderRow?.revenueOrders ?? 0),
      revenuePaisa: toPaisa(orderRow?.revenue ?? "0"),
      cogsPaisa: toPaisa(orderRow?.cogs ?? "0"),
      unitsSold: Number(unitRow?.current ?? 0),
    },
    previous: {
      orders: Number(orderRow?.previousOrders ?? 0),
      revenueOrders: Number(orderRow?.previousRevenueOrders ?? 0),
      revenuePaisa: toPaisa(orderRow?.previousRevenue ?? "0"),
      cogsPaisa: toPaisa(orderRow?.previousCogs ?? "0"),
      unitsSold: Number(unitRow?.previous ?? 0),
    },
  };
}

export interface CustomerAccountCounts {
  /** CUSTOMER accounts created on or before the end of the period. */
  total: number;
  /** CUSTOMER accounts created within the period. */
  created: number;
}

/** CUSTOMER account totals and sign-ups for the range and the previous period (1 query). */
export async function customerCountsByPeriod(
  db: DbExecutor,
  range: ReportRange,
): Promise<PeriodPair<CustomerAccountCounts>> {
  const endOfRange = endOfBusinessDay(range.to);
  const startOfRange = startOfBusinessDay(range.from);
  const startOfPrevious = startOfBusinessDay(range.previousFrom);
  const [row] = await db
    .select({
      total: sql<string>`count(*) FILTER (WHERE ${users.createdAt} < ${endOfRange})`,
      previousTotal: sql<string>`count(*) FILTER (WHERE ${users.createdAt} < ${startOfRange})`,
      created: sql<string>`count(*) FILTER (WHERE ${users.createdAt} >= ${startOfRange} AND ${users.createdAt} < ${endOfRange})`,
      previousCreated: sql<string>`count(*) FILTER (WHERE ${users.createdAt} >= ${startOfPrevious} AND ${users.createdAt} < ${startOfRange})`,
    })
    .from(users)
    .where(eq(users.role, "CUSTOMER"));
  return {
    current: { total: Number(row?.total ?? 0), created: Number(row?.created ?? 0) },
    previous: { total: Number(row?.previousTotal ?? 0), created: Number(row?.previousCreated ?? 0) },
  };
}

/** CUSTOMER sign-ups per business day of the range (days without sign-ups are absent). */
export async function dailySignups(db: DbExecutor, range: ReportRange): Promise<Array<{ date: string; count: number }>> {
  const rows = await db
    .select({ date: businessDayOf(users.createdAt), count: sql<string>`count(*)` })
    .from(users)
    .where(and(eq(users.role, "CUSTOMER"), withinBusinessDays(users.createdAt, range.from, range.to)))
    .groupBy(sql`1`);
  return rows.map((row) => ({ date: row.date, count: Number(row.count) }));
}
