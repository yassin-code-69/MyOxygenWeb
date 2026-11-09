/**
 * Admin activity feed (GET /admin/analytics/activity), built only from real
 * rows, newest first:
 *  - ORDER_PLACED          orders.created_at
 *  - ORDER_STATUS_CHANGED  order_status_history rows with a from_status
 *                          (the initial null → PENDING row is ORDER_PLACED)
 *  - PAYMENT_RECEIVED      the DELIVERED history row of a COD order whose
 *                          payment was collected (payment_status PAID, or
 *                          REFUNDED afterwards) — COD is paid on delivery
 *  - CUSTOMER_REGISTERED   users with role CUSTOMER
 *  - STOCK_IMPORTED        stock_history_logs reason IMPORT
 *  - STOCK_SCRAPPED        stock_history_logs reason EXPIRED_SCRAP
 *  - DISCOUNT_CREATED      discounts.created_at
 * One UNION ALL query: each branch is index-ordered and limited to `limit`
 * rows before the merge, so the cost does not grow with table size.
 */
import { sql } from "drizzle-orm";
import { db as defaultDb } from "../../db/client";
import type { DbExecutor } from "../db-executor";
import { moneyToNumber } from "../order-pricing";
import { toIso } from "../service-utils";

export const ACTIVITY_TYPES = [
  "ORDER_PLACED",
  "ORDER_STATUS_CHANGED",
  "PAYMENT_RECEIVED",
  "CUSTOMER_REGISTERED",
  "STOCK_IMPORTED",
  "STOCK_SCRAPPED",
  "DISCOUNT_CREATED",
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const DEFAULT_ACTIVITY_LIMIT = 10;
export const MAX_ACTIVITY_LIMIT = 50;

export interface ActivityItemDTO {
  id: string;
  type: ActivityType;
  title: string;
  description: string | null;
  at: string;
  /** Admin route to open, when there is one. */
  href: string | null;
}

/** Uniform row of every UNION branch (unused columns are NULL). */
type ActivityRow = {
  type: ActivityType;
  source_id: string;
  at: Date | string;
  order_id: string | null;
  order_number: string | null;
  customer_name: string | null;
  amount: string | null;
  payment_method: string | null;
  from_status: string | null;
  to_status: string | null;
  note: string | null;
  product_id: string | null;
  product_title: string | null;
  quantity: number | null;
  batch_number: string | null;
  user_id: string | null;
  discount_code: string | null;
  discount_name: string | null;
  discount_type: string | null;
};

const takaFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 0 });

function taka(amount: string | null): string {
  return `৳${takaFormat.format(moneyToNumber(amount))}`;
}

function titleCase(status: string | null): string {
  if (!status) return "";
  return status.charAt(0) + status.slice(1).toLowerCase();
}

const orderHref = (id: string | null): string | null => (id ? `/admin/orders?orderId=${id}` : null);
const productHref = (id: string | null): string | null => (id ? `/admin/products?productId=${id}` : null);

export function toActivityItem(row: ActivityRow): ActivityItemDTO {
  const base = { id: `${row.type}:${row.source_id}`, type: row.type, at: toIso(row.at) };
  switch (row.type) {
    case "ORDER_PLACED":
      return {
        ...base,
        title: `New order ${row.order_number ?? ""}`.trim(),
        description: [row.customer_name, row.amount === null ? null : taka(row.amount)].filter(Boolean).join(" · ") || null,
        href: orderHref(row.order_id),
      };
    case "ORDER_STATUS_CHANGED":
      return {
        ...base,
        title: `Order ${row.order_number ?? ""} ${titleCase(row.from_status)} → ${titleCase(row.to_status)}`.replace(/\s+/g, " "),
        description: row.note,
        href: orderHref(row.order_id),
      };
    case "PAYMENT_RECEIVED":
      return {
        ...base,
        title: `Payment received for ${row.order_number ?? "order"}`,
        description: `${taka(row.amount)} · ${row.payment_method === "COD" ? "Cash on delivery" : "Online payment"}`,
        href: orderHref(row.order_id),
      };
    case "CUSTOMER_REGISTERED":
      return {
        ...base,
        title: "New customer registered",
        description: row.customer_name,
        href: row.user_id ? `/admin/customers?customerId=${row.user_id}` : null,
      };
    case "STOCK_IMPORTED":
      return {
        ...base,
        title: `Stock imported: ${row.product_title ?? "product"}`,
        description: `+${Math.abs(Number(row.quantity ?? 0))} units${row.batch_number ? ` · batch ${row.batch_number}` : ""}`,
        href: productHref(row.product_id),
      };
    case "STOCK_SCRAPPED":
      return {
        ...base,
        title: `Expired stock scrapped: ${row.product_title ?? "product"}`,
        description: `${Math.abs(Number(row.quantity ?? 0))} units removed${row.batch_number ? ` · batch ${row.batch_number}` : ""}`,
        href: productHref(row.product_id),
      };
    case "DISCOUNT_CREATED": {
      const value =
        row.discount_type === "PERCENTAGE" ? `${moneyToNumber(row.amount)}% off` : `${taka(row.amount)} off`;
      return {
        ...base,
        title: row.discount_code ? `Coupon ${row.discount_code} created` : `Discount "${row.discount_name ?? "Untitled"}" created`,
        description: row.discount_code && row.discount_name ? `${row.discount_name} · ${value}` : value,
        href: row.source_id ? `/admin/discounts?discountId=${row.source_id}` : null,
      };
    }
  }
}

export class ActivityService {
  constructor(private readonly db: DbExecutor = defaultDb) {}

  async recentActivity(limit: number = DEFAULT_ACTIVITY_LIMIT): Promise<ActivityItemDTO[]> {
    const n = Math.min(Math.max(Math.trunc(limit), 1), MAX_ACTIVITY_LIMIT);
    const result = await this.db.execute<ActivityRow>(sql`
      SELECT * FROM (
        (SELECT 'ORDER_PLACED' AS type, o.id::text AS source_id, o.created_at AS at,
                o.id::text AS order_id, o.order_number, u.full_name AS customer_name, o.total::text AS amount,
                o.payment_method::text AS payment_method, NULL::text AS from_status, NULL::text AS to_status,
                NULL::text AS note, NULL::text AS product_id, NULL::text AS product_title, NULL::int AS quantity,
                NULL::text AS batch_number, NULL::text AS user_id, NULL::text AS discount_code,
                NULL::text AS discount_name, NULL::text AS discount_type
           FROM orders o JOIN users u ON u.id = o.user_id
          ORDER BY o.created_at DESC LIMIT ${n})
        UNION ALL
        (SELECT 'ORDER_STATUS_CHANGED', h.id::text, h.created_at,
                o.id::text, o.order_number, NULL, NULL, NULL, h.from_status::text, h.to_status::text,
                h.note, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
           FROM order_status_history h JOIN orders o ON o.id = h.order_id
          WHERE h.from_status IS NOT NULL
          ORDER BY h.created_at DESC LIMIT ${n})
        UNION ALL
        (SELECT 'PAYMENT_RECEIVED', h.id::text, h.created_at,
                o.id::text, o.order_number, NULL, o.total::text, o.payment_method::text, NULL, NULL,
                NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
           FROM order_status_history h JOIN orders o ON o.id = h.order_id
          WHERE h.to_status = 'DELIVERED' AND o.payment_method = 'COD' AND o.payment_status IN ('PAID', 'REFUNDED')
          ORDER BY h.created_at DESC LIMIT ${n})
        UNION ALL
        (SELECT 'CUSTOMER_REGISTERED', u.id::text, u.created_at,
                NULL, NULL, u.full_name, NULL, NULL, NULL, NULL,
                NULL, NULL, NULL, NULL, NULL, u.id::text, NULL, NULL, NULL
           FROM users u
          WHERE u.role = 'CUSTOMER'
          ORDER BY u.created_at DESC LIMIT ${n})
        UNION ALL
        (SELECT CASE WHEN l.reason = 'IMPORT' THEN 'STOCK_IMPORTED' ELSE 'STOCK_SCRAPPED' END, l.id::text, l.created_at,
                NULL, NULL, NULL, NULL, NULL, NULL, NULL,
                l.note, p.id::text, p.title, l.change_delta, b.batch_number, NULL, NULL, NULL, NULL
           FROM stock_history_logs l
           JOIN products p ON p.id = l.product_id
           LEFT JOIN product_batches b ON b.id = l.batch_id
          WHERE l.reason IN ('IMPORT', 'EXPIRED_SCRAP')
          ORDER BY l.created_at DESC LIMIT ${n})
        UNION ALL
        (SELECT 'DISCOUNT_CREATED', d.id::text, d.created_at,
                NULL, NULL, NULL, d.value::text, NULL, NULL, NULL,
                NULL, NULL, NULL, NULL, NULL, NULL, d.code, d.name, d.type::text
           FROM discounts d
          ORDER BY d.created_at DESC LIMIT ${n})
      ) AS activity
      ORDER BY at DESC, type, source_id
      LIMIT ${n}
    `);
    return result.rows.map(toActivityItem);
  }
}

export const activityService = new ActivityService();
