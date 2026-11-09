/**
 * Fulfilment overview for the admin "Delivery" page (GET /admin/delivery/summary).
 *
 * - readyToShip / inTransit are live counts (current PROCESSING / SHIPPED orders).
 * - Range metrics use inclusive business dates (APP_TIMEZONE): orders DELIVERED
 *   in the range (delivered_at; later refunds still count as deliveries), orders
 *   CANCELLED in the range after they had shipped, and the mean shipped →
 *   delivered time of those deliveries in hours (1 decimal, null when none).
 * - byCourier groups by orders.courier_provider; shipments recorded without a
 *   courier are reported under "unknown".
 */
import { and, eq, inArray, isNotNull, or, sql, type SQL } from "drizzle-orm";
import { db as defaultDb } from "../db/client";
import { orders } from "../db/schema/tables";
import { addDays, daysBetween, todayInBusinessTz } from "../lib/dates";
import { MAX_DAILY_RANGE_DAYS } from "./admin-telemetry.service";
import { type DbExecutor, queryAll } from "./db-executor";
import { fieldValidationError } from "./service-utils";
import { onOrAfterBusinessDay, onOrBeforeBusinessDay } from "./sql-time";

export const DEFAULT_DELIVERY_RANGE_DAYS = 30;
export const UNKNOWN_COURIER = "unknown";

export interface DeliveryRangeQuery {
  from?: string;
  to?: string;
}

export interface CourierDeliveryDTO {
  provider: string;
  inTransit: number;
  delivered: number;
}

export interface DeliverySummaryDTO {
  readyToShip: number;
  inTransit: number;
  deliveredInRange: number;
  cancelledAfterShipping: number;
  avgDeliveryHours: number | null;
  byCourier: CourierDeliveryDTO[];
}

/** Inclusive business-date range; defaults to the 30 days ending today. */
export function resolveDeliveryRange(query: DeliveryRangeQuery, today: string = todayInBusinessTz()): {
  from: string;
  to: string;
} {
  const to = query.to ?? today;
  const from = query.from ?? addDays(to, -(DEFAULT_DELIVERY_RANGE_DAYS - 1));
  if (from > to) {
    throw fieldValidationError({ from: ["from must be on or before to"] });
  }
  if (daysBetween(from, to) + 1 > MAX_DAILY_RANGE_DAYS) {
    throw fieldValidationError({ to: [`The range must not exceed ${MAX_DAILY_RANGE_DAYS} days`] });
  }
  return { from, to };
}

function within(column: typeof orders.deliveredAt | typeof orders.cancelledAt, from: string, to: string): SQL {
  return and(onOrAfterBusinessDay(column, from), onOrBeforeBusinessDay(column, to)) ?? sql`false`;
}

export class DeliveryService {
  constructor(private readonly db: DbExecutor = defaultDb) {}

  async getSummary(query: DeliveryRangeQuery): Promise<DeliverySummaryDTO> {
    const { from, to } = resolveDeliveryRange(query);
    const deliveredInRange = within(orders.deliveredAt, from, to);
    const cancelledAfterShipping =
      and(eq(orders.status, "CANCELLED"), isNotNull(orders.shippedAt), within(orders.cancelledAt, from, to)) ??
      sql`false`;
    const timedDelivery = sql`${deliveredInRange} AND ${orders.shippedAt} IS NOT NULL AND ${orders.deliveredAt} >= ${orders.shippedAt}`;
    // Inline literal (not a bind parameter) so GROUP BY matches the selected expression.
    const provider = sql<string>`coalesce(${orders.courierProvider}, ${sql.raw(`'${UNKNOWN_COURIER}'`)})`;

    const [liveRows, rangeRows, courierRows] = await queryAll(
      this.db,
      () =>
        this.db
          .select({
            readyToShip: sql<number>`(count(*) filter (where ${orders.status} = 'PROCESSING'))::int`.mapWith(Number),
            inTransit: sql<number>`(count(*) filter (where ${orders.status} = 'SHIPPED'))::int`.mapWith(Number),
          })
          .from(orders)
          .where(inArray(orders.status, ["PROCESSING", "SHIPPED"])),
      () =>
        this.db
          .select({
            delivered: sql<number>`(count(*) filter (where ${deliveredInRange}))::int`.mapWith(Number),
            cancelledAfterShipping: sql<number>`(count(*) filter (where ${cancelledAfterShipping}))::int`.mapWith(
              Number,
            ),
            avgDeliveryHours: sql<string | null>`round(
              (avg(extract(epoch from (${orders.deliveredAt} - ${orders.shippedAt}))) filter (where ${timedDelivery}) / 3600)::numeric,
              1
            )`,
          })
          .from(orders)
          .where(or(deliveredInRange, cancelledAfterShipping)),
      () =>
        this.db
          .select({
            provider,
            inTransit: sql<number>`(count(*) filter (where ${orders.status} = 'SHIPPED'))::int`.mapWith(Number),
            delivered: sql<number>`(count(*) filter (where ${deliveredInRange}))::int`.mapWith(Number),
          })
          .from(orders)
          .where(or(eq(orders.status, "SHIPPED"), deliveredInRange))
          .groupBy(provider),
    );

    const live = liveRows[0];
    const range = rangeRows[0];
    const avg = range?.avgDeliveryHours ?? null;

    const byCourier = courierRows
      .map((row): CourierDeliveryDTO => ({ provider: row.provider, inTransit: row.inTransit, delivered: row.delivered }))
      .sort(
        (a, b) => b.inTransit + b.delivered - (a.inTransit + a.delivered) || a.provider.localeCompare(b.provider),
      );

    return {
      readyToShip: live?.readyToShip ?? 0,
      inTransit: live?.inTransit ?? 0,
      deliveredInRange: range?.delivered ?? 0,
      cancelledAfterShipping: range?.cancelledAfterShipping ?? 0,
      avgDeliveryHours: avg === null ? null : Number(avg),
      byCourier,
    };
  }
}

export const deliveryService = new DeliveryService();
