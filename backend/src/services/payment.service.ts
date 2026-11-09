/**
 * Payments overview (GET /admin/payments/summary) for orders placed in a
 * business-date range (default: the last 30 days).
 *
 *  - collected  = SUM(total) of orders with payment_status PAID
 *  - pendingCod = SUM(total) of COD orders still UNPAID whose status is not
 *                 CANCELLED / REFUNDED (cash the couriers still have to collect)
 *  - refunded   = SUM(total) of orders with payment_status REFUNDED
 *  - failed     = SUM(total) of orders with payment_status FAILED
 *  - byMethod: every payment method (zeros included) over the range's orders
 *    EXCLUDING cancelled ones (a cancelled order never moved money).
 *  - byStatus: every payment status (zeros included) over the range's orders
 *    EXCLUDING cancelled orders that are still UNPAID (no money moved and no
 *    payment was attempted). Cancelled orders whose payment FAILED, was PAID or
 *    REFUNDED are kept, so the PAID / REFUNDED / FAILED rows equal the
 *    collected / refunded / failed totals above.
 *    Both breakdowns carry order counts and SUM(total).
 * One grouped query; the rest is reshaping at most 2 x 4 x 2 rows.
 */
import { sql } from "drizzle-orm";
import { db as defaultDb } from "../db/client";
import { paymentMethodEnum, paymentStatusEnum } from "../db/schema/enums";
import { orders } from "../db/schema/tables";
import type { DbExecutor } from "./db-executor";
import type { PaymentMethod, PaymentStatus } from "./order-dto";
import { paisaToAmount, toPaisa } from "./order-pricing";
import { REPORT_DEFAULT_DAYS, resolveReportRange, type RangeQuery } from "./reports/range";
import { sumMoney, withinBusinessDays } from "./reports/sql";

export interface PaymentSummaryDTO {
  collected: number;
  pendingCod: number;
  refunded: number;
  failed: number;
  byMethod: Array<{ method: PaymentMethod; orders: number; amount: number }>;
  byStatus: Array<{ status: PaymentStatus; orders: number; amount: number }>;
}

export class PaymentService {
  constructor(private readonly db: DbExecutor = defaultDb) {}

  async summary(query: RangeQuery): Promise<PaymentSummaryDTO> {
    const range = resolveReportRange(query, REPORT_DEFAULT_DAYS);
    const rows = await this.db
      .select({
        method: orders.paymentMethod,
        status: orders.paymentStatus,
        orderStatus: sql<string>`(CASE WHEN ${orders.status} = 'CANCELLED' THEN 'CANCELLED' WHEN ${orders.status} = 'REFUNDED' THEN 'REFUNDED' ELSE 'OPEN' END)`,
        orders: sql<string>`count(*)`,
        amount: sumMoney(orders.total),
      })
      .from(orders)
      .where(withinBusinessDays(orders.createdAt, range.from, range.to))
      .groupBy(orders.paymentMethod, orders.paymentStatus, sql`3`);

    const byMethod = new Map<PaymentMethod, { orders: number; paisa: number }>(
      paymentMethodEnum.enumValues.map((method) => [method, { orders: 0, paisa: 0 }]),
    );
    const byStatus = new Map<PaymentStatus, { orders: number; paisa: number }>(
      paymentStatusEnum.enumValues.map((status) => [status, { orders: 0, paisa: 0 }]),
    );
    let collected = 0;
    let pendingCod = 0;
    let refunded = 0;
    let failed = 0;

    for (const row of rows) {
      const paisa = toPaisa(row.amount);
      const count = Number(row.orders);
      if (row.status === "PAID") collected += paisa;
      if (row.status === "REFUNDED") refunded += paisa;
      if (row.status === "FAILED") failed += paisa;
      if (row.method === "COD" && row.status === "UNPAID" && row.orderStatus === "OPEN") pendingCod += paisa;
      const cancelled = row.orderStatus === "CANCELLED";
      if (!cancelled) {
        const method = byMethod.get(row.method);
        if (method) {
          method.orders += count;
          method.paisa += paisa;
        }
      }
      if (!cancelled || row.status !== "UNPAID") {
        const status = byStatus.get(row.status);
        if (status) {
          status.orders += count;
          status.paisa += paisa;
        }
      }
    }

    return {
      collected: paisaToAmount(collected),
      pendingCod: paisaToAmount(pendingCod),
      refunded: paisaToAmount(refunded),
      failed: paisaToAmount(failed),
      byMethod: [...byMethod.entries()].map(([method, value]) => ({
        method,
        orders: value.orders,
        amount: paisaToAmount(value.paisa),
      })),
      byStatus: [...byStatus.entries()].map(([status, value]) => ({
        status,
        orders: value.orders,
        amount: paisaToAmount(value.paisa),
      })),
    };
  }
}

export const paymentService = new PaymentService();
