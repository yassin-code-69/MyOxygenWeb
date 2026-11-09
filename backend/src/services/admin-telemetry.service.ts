/**
 * Back-office telemetry (GET /admin/analytics/summary) and the data behind
 * the daily inventory digest job.
 *
 * Definitions:
 *  - Revenue = SUM(orders.total) of orders whose status is NOT CANCELLED or
 *    REFUNDED (delivery fee included, coupon discounts already deducted).
 *  - Day buckets and date filters use the business time zone (APP_TIMEZONE).
 *  - Low stock = active (or auto-hidden because sold out) products whose
 *    sellable stock (unexpired batches) is <= low_stock_threshold.
 *  - Expiring soon = batches with stock expiring within the next 30 days
 *    (same rule as the batch inspector).
 */
import { and, count, desc, eq, gt, isNotNull, lte, notInArray, or, sql, type SQL } from "drizzle-orm";
import { db as defaultDb } from "../db/client";
import { orderItems, orders, productBatches, products, users } from "../db/schema/tables";
import { env } from "../env";
import { addDays, daysUntil, todayInBusinessTz } from "../lib/dates";
import { EXPIRING_SOON_DAYS } from "./batch-inspector.service";
import type { DbExecutor } from "./db-executor";
import type { InventoryDigest, InventoryDigestExpiringBatch, InventoryDigestLowStockItem } from "./notification/notification.interface";
import type { PaymentMethod } from "./order-dto";
import { moneyToNumber, paisaToAmount, toPaisa } from "./order-pricing";
import { ORDER_STATUSES, REVENUE_EXCLUDED_STATUSES, type OrderStatus } from "./order-state-machine";
import { businessDayOf, onOrAfterBusinessDay, onOrBeforeBusinessDay, startOfBusinessDay } from "./sql-time";

export const DEFAULT_TREND_DAYS = 30;
export const MAX_DAILY_RANGE_DAYS = 366;

export interface TelemetryQuery {
  /** Inclusive business date YYYY-MM-DD. */
  from?: string;
  /** Inclusive business date YYYY-MM-DD. */
  to?: string;
}

export interface RecentOrderDTO {
  id: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  total: number;
  itemCount: number;
  createdAt: string;
}

export interface TopProductDTO {
  productId: string;
  title: string;
  sku: string;
  unitsSold: number;
  /** Sum of line totals (before coupon discounts). */
  revenue: number;
}

export interface DailyRevenueDTO {
  date: string;
  revenue: number;
  orderCount: number;
}

export interface TelemetrySummaryDTO {
  range: { from: string | null; to: string | null; timezone: string };
  totalRevenue: number;
  totalOrders: number;
  /** Orders counted in revenue (not CANCELLED / REFUNDED). */
  revenueOrderCount: number;
  avgOrderValue: number;
  /** Revenue of the last 30 days vs the 30 days before, in %; null without a baseline. */
  revenueTrendPercent: number | null;
  ordersByStatus: Record<OrderStatus, number>;
  recentOrders: RecentOrderDTO[];
  topProducts: TopProductDTO[];
  dailyRevenue: DailyRevenueDTO[];
  lowStockCount: number;
  expiringSoonCount: number;
}

const revenueStatuses = (): SQL => notInArray(orders.status, [...REVENUE_EXCLUDED_STATUSES]);

function rangeConditions(query: TelemetryQuery): SQL[] {
  const conditions: SQL[] = [];
  if (query.from) conditions.push(onOrAfterBusinessDay(orders.createdAt, query.from));
  if (query.to) conditions.push(onOrBeforeBusinessDay(orders.createdAt, query.to));
  return conditions;
}

function emptyStatusCounts(): Record<OrderStatus, number> {
  const counts = {} as Record<OrderStatus, number>;
  for (const status of ORDER_STATUSES) counts[status] = 0;
  return counts;
}

export class AdminTelemetryService {
  constructor(private readonly db: DbExecutor = defaultDb) {}

  async getSummary(query: TelemetryQuery = {}): Promise<TelemetrySummaryDTO> {
    const today = todayInBusinessTz();
    const inRange = rangeConditions(query);

    // Sequential on purpose: one pooled connection per dashboard request.
    const aggregate = await this.aggregate(inRange);
    const statusRows = await this.db
      .select({ status: orders.status, value: count() })
      .from(orders)
      .where(and(...inRange))
      .groupBy(orders.status);
    const trend = await this.revenueTrendPercent(today);
    const dailyRevenue = await this.dailyRevenue(query, today);
    const topProducts = await this.topProducts(inRange);
    const recentOrders = await this.recentOrders();
    const lowStockCount = await this.countLowStock(today);
    const expiringSoonCount = await this.countExpiringSoon(today);

    const ordersByStatus = emptyStatusCounts();
    for (const row of statusRows) ordersByStatus[row.status] = Number(row.value);

    return {
      range: { from: query.from ?? null, to: query.to ?? null, timezone: env.APP_TIMEZONE },
      totalRevenue: paisaToAmount(aggregate.revenuePaisa),
      totalOrders: aggregate.totalOrders,
      revenueOrderCount: aggregate.revenueOrders,
      avgOrderValue: aggregate.revenueOrders === 0 ? 0 : paisaToAmount(aggregate.revenuePaisa / aggregate.revenueOrders),
      revenueTrendPercent: trend,
      ordersByStatus,
      recentOrders,
      topProducts,
      dailyRevenue,
      lowStockCount,
      expiringSoonCount,
    };
  }

  /** Low-stock products and batches expiring within 30 days (daily digest). */
  async getInventoryDigest(limit = 200): Promise<InventoryDigest> {
    const today = todayInBusinessTz();
    const lowStock = await this.listLowStock(today, limit);
    const expiringSoon = await this.listExpiringSoon(today, limit);
    return { generatedFor: today, lowStock, expiringSoon };
  }

  private async aggregate(
    inRange: SQL[],
  ): Promise<{ totalOrders: number; revenueOrders: number; revenuePaisa: number }> {
    const revenueFilter = revenueStatuses();
    const [row] = await this.db
      .select({
        totalOrders: count(),
        revenueOrders: sql<string>`count(*) FILTER (WHERE ${revenueFilter})`,
        revenue: sql<string>`COALESCE(SUM(${orders.total}) FILTER (WHERE ${revenueFilter}), 0)`,
      })
      .from(orders)
      .where(and(...inRange));
    return {
      totalOrders: Number(row?.totalOrders ?? 0),
      revenueOrders: Number(row?.revenueOrders ?? 0),
      revenuePaisa: toPaisa(row?.revenue ?? "0"),
    };
  }

  private async revenueTrendPercent(today: string): Promise<number | null> {
    const currentStart = addDays(today, -(DEFAULT_TREND_DAYS - 1));
    const previousStart = addDays(today, -(2 * DEFAULT_TREND_DAYS - 1));
    const [row] = await this.db
      .select({
        current: sql<string>`COALESCE(SUM(${orders.total}) FILTER (WHERE ${orders.createdAt} >= ${startOfBusinessDay(currentStart)}), 0)`,
        previous: sql<string>`COALESCE(SUM(${orders.total}) FILTER (WHERE ${orders.createdAt} < ${startOfBusinessDay(currentStart)}), 0)`,
      })
      .from(orders)
      .where(
        and(
          revenueStatuses(),
          onOrAfterBusinessDay(orders.createdAt, previousStart),
          onOrBeforeBusinessDay(orders.createdAt, today),
        ),
      );
    const current = toPaisa(row?.current ?? "0");
    const previous = toPaisa(row?.previous ?? "0");
    if (previous <= 0) return null;
    return Math.round(((current - previous) / previous) * 1000) / 10;
  }

  /** One entry per business day: the requested range, or the last 30 days. */
  private async dailyRevenue(query: TelemetryQuery, today: string): Promise<DailyRevenueDTO[]> {
    const end = query.from && query.to ? query.to : today;
    const start = query.from && query.to ? query.from : addDays(today, -(DEFAULT_TREND_DAYS - 1));

    const rows = await this.db
      .select({
        date: businessDayOf(orders.createdAt),
        revenue: sql<string>`COALESCE(SUM(${orders.total}), 0)`,
        orderCount: count(),
      })
      .from(orders)
      .where(
        and(revenueStatuses(), onOrAfterBusinessDay(orders.createdAt, start), onOrBeforeBusinessDay(orders.createdAt, end)),
      )
      // Ordinal grouping: the date expression carries a bound parameter (time zone).
      .groupBy(sql`1`);
    const byDate = new Map(rows.map((row) => [row.date, row]));

    const days: DailyRevenueDTO[] = [];
    for (let date = start; date <= end; date = addDays(date, 1)) {
      const row = byDate.get(date);
      days.push({
        date,
        revenue: row ? moneyToNumber(row.revenue) : 0,
        orderCount: row ? Number(row.orderCount) : 0,
      });
    }
    return days;
  }

  private async topProducts(inRange: SQL[]): Promise<TopProductDTO[]> {
    const revenue = sql<string>`SUM(${orderItems.totalPrice})`;
    const rows = await this.db
      .select({
        productId: orderItems.productId,
        title: products.title,
        sku: products.sku,
        unitsSold: sql<string>`SUM(${orderItems.quantity})`,
        revenue,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .innerJoin(products, eq(orderItems.productId, products.id))
      .where(and(revenueStatuses(), ...inRange))
      .groupBy(orderItems.productId, products.title, products.sku)
      .orderBy(desc(revenue), desc(sql`SUM(${orderItems.quantity})`))
      .limit(5);
    return rows.map((row) => ({
      productId: row.productId,
      title: row.title,
      sku: row.sku,
      unitsSold: Number(row.unitsSold),
      revenue: moneyToNumber(row.revenue),
    }));
  }

  private async recentOrders(): Promise<RecentOrderDTO[]> {
    const rows = await this.db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        status: orders.status,
        paymentMethod: orders.paymentMethod,
        total: orders.total,
        createdAt: orders.createdAt,
        customerName: users.fullName,
        customerPhone: users.phone,
        itemCount: sql<string>`(SELECT COALESCE(SUM(${orderItems.quantity}), 0) FROM ${orderItems} WHERE ${orderItems.orderId} = ${orders.id})`,
      })
      .from(orders)
      .innerJoin(users, eq(users.id, orders.userId))
      .orderBy(desc(orders.createdAt), desc(orders.id))
      .limit(5);
    return rows.map((row) => ({
      id: row.id,
      orderNumber: row.orderNumber,
      customerName: row.customerName,
      customerPhone: row.customerPhone,
      status: row.status,
      paymentMethod: row.paymentMethod,
      total: moneyToNumber(row.total),
      itemCount: Number(row.itemCount),
      createdAt: row.createdAt.toISOString(),
    }));
  }

  /** Sellable stock per product (unexpired batches) as a subquery. */
  private sellableStock(today: string) {
    return this.db
      .select({
        productId: productBatches.productId,
        available: sql<string>`SUM(${productBatches.availableQuantity})`.as("available"),
      })
      .from(productBatches)
      .where(and(gt(productBatches.availableQuantity, 0), sql`${productBatches.expiryDate} > ${today}::date`))
      .groupBy(productBatches.productId)
      .as("sellable_stock");
  }

  private lowStockCondition(stock: ReturnType<AdminTelemetryService["sellableStock"]>): SQL | undefined {
    return and(
      or(eq(products.isActive, true), isNotNull(products.autoDeactivatedAt)),
      sql`COALESCE(${stock.available}, 0) <= ${products.lowStockThreshold}`,
    );
  }

  private async countLowStock(today: string): Promise<number> {
    const stock = this.sellableStock(today);
    const [row] = await this.db
      .select({ value: count() })
      .from(products)
      .leftJoin(stock, eq(stock.productId, products.id))
      .where(this.lowStockCondition(stock));
    return Number(row?.value ?? 0);
  }

  private async listLowStock(today: string, limit: number): Promise<InventoryDigestLowStockItem[]> {
    const stock = this.sellableStock(today);
    const rows = await this.db
      .select({
        productId: products.id,
        title: products.title,
        sku: products.sku,
        lowStockThreshold: products.lowStockThreshold,
        available: sql<string>`COALESCE(${stock.available}, 0)`,
      })
      .from(products)
      .leftJoin(stock, eq(stock.productId, products.id))
      .where(this.lowStockCondition(stock))
      .orderBy(sql`COALESCE(${stock.available}, 0)`, products.title)
      .limit(limit);
    return rows.map((row) => ({
      productId: row.productId,
      title: row.title,
      sku: row.sku,
      availableStock: Number(row.available),
      lowStockThreshold: row.lowStockThreshold,
    }));
  }

  private expiringCondition(today: string): SQL | undefined {
    return and(
      gt(productBatches.availableQuantity, 0),
      sql`${productBatches.expiryDate} > ${today}::date`,
      lte(productBatches.expiryDate, addDays(today, EXPIRING_SOON_DAYS)),
    );
  }

  private async countExpiringSoon(today: string): Promise<number> {
    const [row] = await this.db.select({ value: count() }).from(productBatches).where(this.expiringCondition(today));
    return Number(row?.value ?? 0);
  }

  private async listExpiringSoon(today: string, limit: number): Promise<InventoryDigestExpiringBatch[]> {
    const rows = await this.db
      .select({
        batchId: productBatches.id,
        productTitle: products.title,
        sku: products.sku,
        batchNumber: productBatches.batchNumber,
        expiryDate: productBatches.expiryDate,
        availableQuantity: productBatches.availableQuantity,
      })
      .from(productBatches)
      .innerJoin(products, eq(products.id, productBatches.productId))
      .where(this.expiringCondition(today))
      .orderBy(productBatches.expiryDate, products.title)
      .limit(limit);
    return rows.map((row) => ({
      batchId: row.batchId,
      productTitle: row.productTitle,
      sku: row.sku,
      batchNumber: row.batchNumber,
      expiryDate: row.expiryDate,
      daysUntilExpiry: daysUntil(row.expiryDate, today),
      availableQuantity: row.availableQuantity,
    }));
  }
}

export const adminTelemetryService = new AdminTelemetryService();
