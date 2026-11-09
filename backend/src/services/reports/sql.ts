/**
 * SQL building blocks shared by the dashboard and the reports.
 *
 * Definitions (documented once, used everywhere):
 *  - Revenue order: status NOT IN (CANCELLED, REFUNDED).
 *  - Revenue (store level): SUM(orders.total) of revenue orders — what the
 *    customer paid: merchandise at effective prices, minus coupon discount,
 *    plus delivery fee.
 *  - Net line revenue (product / category level): order_items.total_price
 *    minus the line's pro-rata share (by line value) of the order's coupon
 *    discount. Delivery fees are not attributed to products, so the sum over
 *    products = store revenue - delivery fees.
 *  - COGS of a line: order_items.unit_cost * quantity (cost price snapshot
 *    taken at checkout).
 *  - "In range": orders.created_at falls on a business day in [from, to]
 *    (APP_TIMEZONE).
 * The fragments reference `orders` / `order_items` columns, so use them in
 * queries that join both tables (Drizzle then qualifies every column).
 */
import { and, notInArray, sql, type AnyColumn, type SQL } from "drizzle-orm";
import { orderItems, orders } from "../../db/schema/tables";
import { REVENUE_EXCLUDED_STATUSES } from "../order-state-machine";
import { onOrAfterBusinessDay, onOrBeforeBusinessDay } from "../sql-time";

/** Orders whose money counts (not CANCELLED / REFUNDED). */
export function revenueOrderCondition(): SQL {
  return notInArray(orders.status, [...REVENUE_EXCLUDED_STATUSES]);
}

/** `column` falls on a business day within [from, to] (inclusive). */
export function withinBusinessDays(column: AnyColumn, from: string, to: string): SQL {
  const condition = and(onOrAfterBusinessDay(column, from), onOrBeforeBusinessDay(column, to));
  if (condition === undefined) throw new Error("unreachable: and() of two conditions");
  return condition;
}

/** Net merchandise revenue of the order line in scope (see header). */
export const lineNetRevenueSql: SQL = sql`(${orderItems.totalPrice} - CASE WHEN ${orders.subtotal} > 0 THEN ${orders.discountAmount} * ${orderItems.totalPrice} / ${orders.subtotal} ELSE 0 END)`;

/** Cost of goods sold of the order line in scope. */
export const lineCogsSql: SQL = sql`(${orderItems.unitCost} * ${orderItems.quantity})`;

/** SUM of a money expression rounded to cents; '0' when there are no rows. */
export function sumMoney(expression: SQL | AnyColumn, filter?: SQL): SQL<string> {
  return filter === undefined
    ? sql<string>`coalesce(round(sum(${expression}), 2), 0)`
    : sql<string>`coalesce(round(sum(${expression}) FILTER (WHERE ${filter}), 2), 0)`;
}

/** SUM of an integer expression; 0 when there are no rows. */
export function sumInt(expression: SQL | AnyColumn, filter?: SQL): SQL<string> {
  return filter === undefined
    ? sql<string>`coalesce(sum(${expression}), 0)`
    : sql<string>`coalesce(sum(${expression}) FILTER (WHERE ${filter}), 0)`;
}

/** First image of the `products` row in scope (NULL when it has none). */
export function firstImageSql(images: AnyColumn): SQL<string | null> {
  return sql<string | null>`(${images})[1]`;
}
