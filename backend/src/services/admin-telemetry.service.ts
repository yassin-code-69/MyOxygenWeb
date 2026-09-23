import { and, count, eq, gt, ne, sql } from "drizzle-orm";
import { db as defaultDb, orders, productBatches, products } from "../db";
import type { DatabaseClient } from "../db/client";

export interface DailyRevenueItem {
  date: string;
  revenue: number;
  orderCount: number;
}

export interface OrdersByStatus {
  PENDING: number;
  PROCESSING: number;
  SHIPPED: number;
  DELIVERED: number;
  CANCELLED: number;
  [key: string]: number;
}

export interface TelemetrySummary {
  totalRevenue: number;
  totalOrders: number;
  ordersByStatus: OrdersByStatus;
  lowStockCount: number;
  expiringSoonCount: number;
  dailyRevenue: DailyRevenueItem[];
}

export class AdminTelemetryService {
  async getTelemetrySummary(
    db: DatabaseClient = defaultDb,
  ): Promise<TelemetrySummary> {
    const today = new Date().toISOString().split("T")[0];

    // 1. Total Revenue (sum of non-cancelled orders)
    const [revResult] = await db
      .select({
        total: sql<string>`COALESCE(SUM(${orders.total}), 0)`,
      })
      .from(orders)
      .where(ne(orders.status, "CANCELLED"));

    const totalRevenue = parseFloat(Number(revResult?.total ?? 0).toFixed(2));

    // 2. Total Orders (count of all orders)
    const [ordersResult] = await db
      .select({
        count: count(),
      })
      .from(orders);

    const totalOrders = Number(ordersResult?.count ?? 0);

    // 3. Orders by Status (PENDING, PROCESSING, SHIPPED, DELIVERED, CANCELLED)
    const statusResults = await db
      .select({
        status: orders.status,
        count: count(),
      })
      .from(orders)
      .groupBy(orders.status);

    const ordersByStatus: OrdersByStatus = {
      PENDING: 0,
      PROCESSING: 0,
      SHIPPED: 0,
      DELIVERED: 0,
      CANCELLED: 0,
    };

    for (const row of statusResults) {
      if (row.status) {
        ordersByStatus[row.status] = Number(row.count ?? 0);
      }
    }

    // 4. Low Stock Count: products where sum of available qty across non-expired batches <= lowStockThreshold
    const stockTotals = await db
      .select({
        productId: productBatches.productId,
        totalAvailable: sql<number>`COALESCE(SUM(${productBatches.availableQuantity}), 0)`,
      })
      .from(productBatches)
      .where(
        and(
          gt(productBatches.availableQuantity, 0),
          sql`${productBatches.expiryDate} > ${today}`,
        ),
      )
      .groupBy(productBatches.productId);

    const activeProducts = await db.query.products.findMany({
      where: eq(products.isActive, true),
      columns: {
        id: true,
        lowStockThreshold: true,
      },
    });

    const stockMap = new Map<string, number>(
      stockTotals.map((s) => [s.productId, Number(s.totalAvailable)]),
    );

    const lowStockCount = activeProducts.filter(
      (p) => (stockMap.get(p.id) ?? 0) <= p.lowStockThreshold,
    ).length;

    // 5. Expiring Soon Count: productBatches where availableQuantity > 0 and expiryDate between CURRENT_DATE and CURRENT_DATE + 30 days
    const [expiringResult] = await db
      .select({
        count: count(),
      })
      .from(productBatches)
      .where(
        and(
          gt(productBatches.availableQuantity, 0),
          sql`${productBatches.expiryDate} >= CURRENT_DATE`,
          sql`${productBatches.expiryDate} <= (CURRENT_DATE + INTERVAL '30 days')`,
        ),
      );

    const expiringSoonCount = Number(expiringResult?.count ?? 0);

    // 6. Daily Revenue: last 7 days daily revenue aggregation
    const dailyRows = await db
      .select({
        date: sql<string>`DATE(${orders.createdAt})`,
        revenue: sql<string>`COALESCE(SUM(${orders.total}), 0)`,
        orderCount: sql<number>`COUNT(${orders.id})`,
      })
      .from(orders)
      .where(
        and(
          ne(orders.status, "CANCELLED"),
          sql`${orders.createdAt} >= CURRENT_DATE - INTERVAL '6 days'`,
        ),
      )
      .groupBy(sql`DATE(${orders.createdAt})`);

    const dayMap = new Map<
      string,
      { date: string; revenue: number; orderCount: number }
    >();

    // Prepopulate last 7 days (today and preceding 6 days)
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const dateStr = d.toISOString().split("T")[0];
      dayMap.set(dateStr, { date: dateStr, revenue: 0, orderCount: 0 });
    }

    for (const row of dailyRows) {
      const dateStr = String(row.date ?? "").slice(0, 10);
      if (dateStr) {
        dayMap.set(dateStr, {
          date: dateStr,
          revenue: parseFloat(Number(row.revenue).toFixed(2)),
          orderCount: Number(row.orderCount || 0),
        });
      }
    }

    const dailyRevenue = Array.from(dayMap.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-7);

    return {
      totalRevenue,
      totalOrders,
      ordersByStatus,
      lowStockCount,
      expiringSoonCount,
      dailyRevenue,
    };
  }
}

export const adminTelemetryService = new AdminTelemetryService();
