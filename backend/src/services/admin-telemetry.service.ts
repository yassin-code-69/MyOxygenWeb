/**
 * Back-office telemetry (GET /admin/analytics/summary) and the data behind
 * the daily inventory digest job.
 *
 * Definitions (see services/reports/sql.ts and services/reports/range.ts):
 *  - Range: inclusive business dates (APP_TIMEZONE); default = the last 7 days
 *    ending today. Previous period = the same number of days before `from`.
 *  - Revenue = SUM(orders.total) of orders whose status is NOT CANCELLED or
 *    REFUNDED (delivery fee included, coupon discounts already deducted).
 *  - Orders = every order placed in the range (all statuses), as in the
 *    "Total Orders" card and the orders-by-status donut.
 *  - Avg order value = revenue / number of revenue orders.
 *  - Products sold = SUM(order_items.quantity) of revenue orders.
 *  - Customers = CUSTOMER accounts created on or before the end of `to`
 *    (vs the end of previousTo); new customers = created within the period.
 *  - Product / category revenue = net line revenue (line total less its
 *    pro-rata share of the coupon discount; delivery fees not attributed).
 *  - Low stock = active (or auto-hidden because sold out) products whose
 *    sellable stock (unexpired batches) is <= low_stock_threshold.
 *  - Expiring soon = batches with stock expiring within the next 30 days
 *    (same rule as the batch inspector).
 *
 * Every aggregate runs in Postgres; JavaScript only zero-fills and reshapes
 * at most one row per business day / product / category.
 */
import { and, asc, count, desc, eq, gt, isNotNull, lte, or, sql, type SQL } from "drizzle-orm";
import { db as defaultDb } from "../db/client";
import { categories, orderItems, orders, productBatches, products, users } from "../db/schema/tables";
import { addDays, daysUntil, todayInBusinessTz } from "../lib/dates";
import { EXPIRING_SOON_DAYS } from "./batch-inspector.service";
import type { DbExecutor } from "./db-executor";
import type { InventoryDigest, InventoryDigestExpiringBatch, InventoryDigestLowStockItem } from "./notification/notification.interface";
import type { PaymentMethod } from "./order-dto";
import { moneyToNumber, paisaToAmount, toPaisa } from "./order-pricing";
import { ORDER_STATUSES, type OrderStatus } from "./order-state-machine";
import {
  averagePaisa,
  buildSeries,
  DASHBOARD_DEFAULT_DAYS,
  kpi,
  MAX_REPORT_RANGE_DAYS,
  moneyKpi,
  percentOf,
  publicRange,
  resolveReportRange,
  type Kpi,
  type ReportRange,
  type SeriesPoint,
} from "./reports/range";
import { customerCountsByPeriod, orderTotalsByPeriod, outerOrderId } from "./reports/period-queries";
import { firstImageSql, lineNetRevenueSql, revenueOrderCondition, sumMoney, withinBusinessDays } from "./reports/sql";
import { businessDayOf, onOrAfterBusinessDay, onOrBeforeBusinessDay, startOfBusinessDay } from "./sql-time";

/** Window of the legacy `revenueTrendPercent` field (last 30 days vs the 30 before). */
export const DEFAULT_TREND_DAYS = 30;
export const MAX_DAILY_RANGE_DAYS = MAX_REPORT_RANGE_DAYS;
const DASHBOARD_LIST_SIZE = 5;

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
  firstItemImage: string | null;
}

export interface TopProductDTO {
  productId: string;
  title: string;
  slug: string;
  sku: string;
  image: string | null;
  categoryName: string | null;
  unitsSold: number;
  /** Net line revenue (coupon share deducted, delivery fees excluded). */
  revenue: number;
}

export interface DailyRevenueDTO {
  date: string;
  revenue: number;
  /** Revenue orders of the day (not CANCELLED / REFUNDED). */
  orderCount: number;
}

export interface DashboardKpisDTO {
  revenue: Kpi;
  orders: Kpi;
  customers: Kpi;
  newCustomers: Kpi;
  /** Units. */
  productsSold: Kpi;
  avgOrderValue: Kpi;
}

export type RevenueSeriesPointDTO = SeriesPoint & {
  revenue: number;
  /** Orders placed in the bucket (all statuses, like kpis.orders). */
  orders: number;
};

export interface CategorySalesDTO {
  categoryId: string;
  name: string;
  slug: string;
  revenue: number;
  unitsSold: number;
  /** Share of the category revenue total, in %. */
  sharePercent: number;
}

export interface LatestCustomerDTO {
  id: string;
  fullName: string;
  email: string | null;
  phone: string;
  createdAt: string;
}

export interface LowStockProductDTO {
  productId: string;
  title: string;
  slug: string;
  image: string | null;
  totalStock: number;
  lowStockThreshold: number;
}

export interface TelemetrySummaryDTO {
  range: ReportRange;
  totalRevenue: number;
  totalOrders: number;
  /** Orders counted in revenue (not CANCELLED / REFUNDED). */
  revenueOrderCount: number;
  avgOrderValue: number;
  /** Revenue of the last 30 days vs the 30 days before, in %; null without a baseline. */
  revenueTrendPercent: number | null;
  /** Orders placed within the range, per status. */
  ordersByStatus: Record<OrderStatus, number>;
  /** Latest 5 orders overall. */
  recentOrders: RecentOrderDTO[];
  /** Top 5 products of the range by revenue. */
  topProducts: TopProductDTO[];
  /** One entry per business day of the range. */
  dailyRevenue: DailyRevenueDTO[];
  lowStockCount: number;
  expiringSoonCount: number;
  kpis: DashboardKpisDTO;
  revenueSeries: RevenueSeriesPointDTO[];
  salesByCategory: CategorySalesDTO[];
  latestCustomers: LatestCustomerDTO[];
  lowStockProducts: LowStockProductDTO[];
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
    const range = resolveReportRange(query, DASHBOARD_DEFAULT_DAYS, today);
    const inRange = withinBusinessDays(orders.createdAt, range.from, range.to);

    // Sequential on purpose: one pooled connection per dashboard request.
    const { current, previous } = await orderTotalsByPeriod(this.db, range);
    const customers = await customerCountsByPeriod(this.db, range);
    const statusRows = await this.db
      .select({ status: orders.status, value: count() })
      .from(orders)
      .where(inRange)
      .groupBy(orders.status);
    const daily = await this.dailyRows(range);
    const topProducts = await this.topProducts(inRange);
    const salesByCategory = await this.salesByCategory(inRange);
    const recentOrders = await this.recentOrders();
    const latestCustomers = await this.latestCustomers();
    const lowStock = await this.lowStockProducts(today);
    const expiringSoonCount = await this.countExpiringSoon(today);
    const trend = await this.revenueTrendPercent(today);

    const ordersByStatus = emptyStatusCounts();
    for (const row of statusRows) ordersByStatus[row.status] = Number(row.value);

    const dailyRevenue: DailyRevenueDTO[] = buildSeries(
      { from: range.from, to: range.to, granularity: "day" },
      daily.map((row) => ({ date: row.date, values: { revenuePaisa: row.revenuePaisa, orderCount: row.revenueOrders } })),
      () => ({ revenuePaisa: 0, orderCount: 0 }),
    ).map((point) => ({ date: point.period, revenue: paisaToAmount(point.revenuePaisa), orderCount: point.orderCount }));

    const revenueSeries: RevenueSeriesPointDTO[] = buildSeries(
      range,
      daily.map((row) => ({ date: row.date, values: { revenuePaisa: row.revenuePaisa, orders: row.orders } })),
      () => ({ revenuePaisa: 0, orders: 0 }),
    ).map((point) => ({
      period: point.period,
      label: point.label,
      revenue: paisaToAmount(point.revenuePaisa),
      orders: point.orders,
    }));

    const avgCurrent = averagePaisa(current.revenuePaisa, current.revenueOrders);
    const avgPrevious = averagePaisa(previous.revenuePaisa, previous.revenueOrders);

    return {
      range: publicRange(range),
      totalRevenue: paisaToAmount(current.revenuePaisa),
      totalOrders: current.orders,
      revenueOrderCount: current.revenueOrders,
      avgOrderValue: paisaToAmount(avgCurrent),
      revenueTrendPercent: trend,
      ordersByStatus,
      recentOrders,
      topProducts,
      dailyRevenue,
      lowStockCount: lowStock.total,
      expiringSoonCount,
      kpis: {
        revenue: moneyKpi(current.revenuePaisa, previous.revenuePaisa),
        orders: kpi(current.orders, previous.orders),
        customers: kpi(customers.current.total, customers.previous.total),
        newCustomers: kpi(customers.current.created, customers.previous.created),
        productsSold: kpi(current.unitsSold, previous.unitsSold),
        avgOrderValue: moneyKpi(avgCurrent, avgPrevious),
      },
      revenueSeries,
      salesByCategory,
      latestCustomers,
      lowStockProducts: lowStock.items,
    };
  }

  /** Low-stock products and batches expiring within 30 days (daily digest). */
  async getInventoryDigest(limit = 200): Promise<InventoryDigest> {
    const today = todayInBusinessTz();
    const lowStock = await this.listLowStock(today, limit);
    const expiringSoon = await this.listExpiringSoon(today, limit);
    return { generatedFor: today, lowStock, expiringSoon };
  }

  /** One row per business day that has orders: revenue, revenue orders, all orders. */
  private async dailyRows(
    range: ReportRange,
  ): Promise<Array<{ date: string; revenuePaisa: number; revenueOrders: number; orders: number }>> {
    const revenue = revenueOrderCondition();
    const rows = await this.db
      .select({
        date: businessDayOf(orders.createdAt),
        revenue: sumMoney(orders.total, revenue),
        revenueOrders: sql<string>`count(*) FILTER (WHERE ${revenue})`,
        orders: count(),
      })
      .from(orders)
      .where(withinBusinessDays(orders.createdAt, range.from, range.to))
      // Ordinal grouping: the date expression carries a bound parameter (time zone).
      .groupBy(sql`1`);
    return rows.map((row) => ({
      date: row.date,
      revenuePaisa: toPaisa(row.revenue),
      revenueOrders: Number(row.revenueOrders),
      orders: Number(row.orders),
    }));
  }

  private async topProducts(inRange: SQL): Promise<TopProductDTO[]> {
    const revenue = sumMoney(lineNetRevenueSql);
    const units = sql<string>`SUM(${orderItems.quantity})`;
    const rows = await this.db
      .select({
        productId: orderItems.productId,
        title: products.title,
        slug: products.slug,
        sku: products.sku,
        image: firstImageSql(products.images),
        categoryName: categories.name,
        unitsSold: units,
        revenue,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .innerJoin(products, eq(orderItems.productId, products.id))
      .leftJoin(categories, eq(categories.id, products.categoryId))
      .where(and(revenueOrderCondition(), inRange))
      .groupBy(orderItems.productId, products.id, categories.id)
      .orderBy(desc(revenue), desc(units), asc(products.title))
      .limit(DASHBOARD_LIST_SIZE);
    return rows.map((row) => ({
      productId: row.productId,
      title: row.title,
      slug: row.slug,
      sku: row.sku,
      image: row.image,
      categoryName: row.categoryName,
      unitsSold: Number(row.unitsSold),
      revenue: moneyToNumber(row.revenue),
    }));
  }

  private async salesByCategory(inRange: SQL): Promise<CategorySalesDTO[]> {
    const revenue = sumMoney(lineNetRevenueSql);
    const rows = await this.db
      .select({
        categoryId: categories.id,
        name: categories.name,
        slug: categories.slug,
        revenue,
        unitsSold: sql<string>`SUM(${orderItems.quantity})`,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .innerJoin(products, eq(orderItems.productId, products.id))
      .innerJoin(categories, eq(categories.id, products.categoryId))
      .where(and(revenueOrderCondition(), inRange))
      .groupBy(categories.id)
      .orderBy(desc(revenue), asc(categories.name));
    const totalPaisa = rows.reduce((sum, row) => sum + toPaisa(row.revenue), 0);
    return rows.map((row) => ({
      categoryId: row.categoryId,
      name: row.name,
      slug: row.slug,
      revenue: moneyToNumber(row.revenue),
      unitsSold: Number(row.unitsSold),
      sharePercent: percentOf(toPaisa(row.revenue), totalPaisa),
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
        itemCount: sql<string>`(SELECT COALESCE(SUM(oi.quantity), 0) FROM order_items oi WHERE oi.order_id = ${outerOrderId})`,
        firstItemImage: sql<string | null>`(
          SELECT p.images[1] FROM order_items oi JOIN products p ON p.id = oi.product_id
          WHERE oi.order_id = ${outerOrderId}
          ORDER BY oi.created_at, oi.id
          LIMIT 1
        )`,
      })
      .from(orders)
      .innerJoin(users, eq(users.id, orders.userId))
      .orderBy(desc(orders.createdAt), desc(orders.id))
      .limit(DASHBOARD_LIST_SIZE);
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
      firstItemImage: row.firstItemImage,
    }));
  }

  private async latestCustomers(): Promise<LatestCustomerDTO[]> {
    const rows = await this.db
      .select({
        id: users.id,
        fullName: users.fullName,
        email: users.email,
        phone: users.phone,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.role, "CUSTOMER"))
      .orderBy(desc(users.createdAt), desc(users.id))
      .limit(DASHBOARD_LIST_SIZE);
    return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
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
          revenueOrderCondition(),
          onOrAfterBusinessDay(orders.createdAt, previousStart),
          onOrBeforeBusinessDay(orders.createdAt, today),
        ),
      );
    const current = toPaisa(row?.current ?? "0");
    const previous = toPaisa(row?.previous ?? "0");
    if (previous <= 0) return null;
    return Math.round(((current - previous) / previous) * 1000) / 10;
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

  /** The 5 lowest-stock products plus the total number of low-stock products (one query). */
  private async lowStockProducts(today: string): Promise<{ total: number; items: LowStockProductDTO[] }> {
    const stock = this.sellableStock(today);
    const available = sql<string>`COALESCE(${stock.available}, 0)`;
    const rows = await this.db
      .select({
        productId: products.id,
        title: products.title,
        slug: products.slug,
        image: firstImageSql(products.images),
        lowStockThreshold: products.lowStockThreshold,
        available,
        total: sql<string>`count(*) OVER ()`,
      })
      .from(products)
      .leftJoin(stock, eq(stock.productId, products.id))
      .where(this.lowStockCondition(stock))
      .orderBy(asc(available), asc(products.title), asc(products.id))
      .limit(DASHBOARD_LIST_SIZE);
    return {
      total: Number(rows[0]?.total ?? 0),
      items: rows.map((row) => ({
        productId: row.productId,
        title: row.title,
        slug: row.slug,
        image: row.image,
        totalStock: Number(row.available),
        lowStockThreshold: row.lowStockThreshold,
      })),
    };
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
