/**
 * Sales reports: GET /admin/reports/products and GET /admin/reports/customers.
 *
 * Definitions (see ./sql.ts and ./range.ts):
 *  - Default range: the last 30 days ending today.
 *  - Product revenue = net line revenue of revenue orders in range (line total
 *    less its pro-rata coupon share; delivery fees are not attributed).
 *  - avgSellingPrice = revenue / unitsSold (0 when nothing sold).
 *  - ordersCount = distinct revenue orders containing the product.
 *  - currentStock = sellable stock now (unexpired batches).
 *  - lastSoldAt = the product's most recent revenue order, all time (so slow
 *    movers show their last sale even when it predates the range).
 *  - Customers report: customer metrics consider CUSTOMER accounts only.
 *    Returning customer = >= 2 revenue orders in the period; repeat rate =
 *    returning / customers with >= 1 revenue order in the range * 100.
 *    Avg order value = revenue / revenue orders (all revenue orders).
 *    byDistrict groups revenue orders by shipping district (trimmed,
 *    case-normalised), top 10 by revenue.
 */
import { and, asc, count, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db as defaultDb } from "../../db/client";
import { categories, orderItems, orders, products, users } from "../../db/schema/tables";
import { todayInBusinessTz } from "../../lib/dates";
import { pageOffset } from "../../lib/http";
import type { DbExecutor } from "../db-executor";
import { sellableStockSql } from "../inventory.service";
import { moneyToNumber, paisaToAmount, toPaisa } from "../order-pricing";
import { containsPattern, toNullableIso } from "../service-utils";
import { startOfBusinessDay } from "../sql-time";
import { customerCountsByPeriod, dailySignups, orderTotalsByPeriod } from "./period-queries";
import {
  averagePaisa,
  buildSeries,
  kpi,
  moneyKpi,
  percentOf,
  REPORT_DEFAULT_DAYS,
  resolveReportRange,
  type Kpi,
  type RangeQuery,
  type SeriesPoint,
} from "./range";
import { firstImageSql, lineNetRevenueSql, revenueOrderCondition, sumMoney, withinBusinessDays } from "./sql";

// ---------------------------------------------------------------------------
// Products report
// ---------------------------------------------------------------------------

export const PRODUCT_REPORT_SORTS = ["revenue_desc", "units_desc", "title_asc", "stock_asc"] as const;
export type ProductReportSort = (typeof PRODUCT_REPORT_SORTS)[number];

export interface ProductReportQuery extends RangeQuery {
  q?: string;
  categoryId?: string;
  sort: ProductReportSort;
  page: number;
  limit: number;
}

export interface ProductReportRowDTO {
  productId: string;
  title: string;
  sku: string;
  slug: string;
  image: string | null;
  category: { id: string; name: string } | null;
  unitsSold: number;
  revenue: number;
  ordersCount: number;
  avgSellingPrice: number;
  currentStock: number;
  lastSoldAt: string | null;
  isActive: boolean;
}

export interface ProductReportResult {
  items: ProductReportRowDTO[];
  total: number;
  totals: { unitsSold: number; revenue: number };
}

// ---------------------------------------------------------------------------
// Customers report
// ---------------------------------------------------------------------------

export interface CustomerReportQuery extends RangeQuery {
  page: number;
  limit: number;
}

export interface CustomerReportDTO {
  kpis: {
    totalCustomers: Kpi;
    newCustomers: Kpi;
    returningCustomers: Kpi;
    repeatRatePercent: number;
    avgOrderValue: Kpi;
  };
  signupSeries: Array<SeriesPoint & { count: number }>;
  byDistrict: Array<{ district: string; orders: number; revenue: number }>;
  topCustomers: Array<{
    id: string;
    fullName: string;
    phone: string;
    email: string | null;
    orders: number;
    totalSpent: number;
    lastOrderAt: string | null;
  }>;
}

export interface CustomerReportResult {
  report: CustomerReportDTO;
  /** Customers with at least one revenue order in range (pagination total of topCustomers). */
  total: number;
}

const TOP_DISTRICTS = 10;

/** All-time last revenue sale of the `products` row in scope (correlated subquery). */
function lastSoldAtSql(): SQL<Date | null> {
  return sql<Date | null>`(
    SELECT max(o2.created_at) FROM order_items oi2 JOIN orders o2 ON o2.id = oi2.order_id
    WHERE oi2.product_id = "products"."id" AND o2.status NOT IN ('CANCELLED', 'REFUNDED')
  )`.mapWith(orders.createdAt);
}

export class SalesReportService {
  constructor(private readonly db: DbExecutor = defaultDb) {}

  async productReport(query: ProductReportQuery): Promise<ProductReportResult> {
    const range = resolveReportRange(query, REPORT_DEFAULT_DAYS);
    const today = todayInBusinessTz();

    const sales = this.db
      .select({
        productId: orderItems.productId,
        unitsSold: sql<string>`sum(${orderItems.quantity})`.as("units_sold"),
        revenue: sql<string>`round(sum(${lineNetRevenueSql}), 2)`.as("revenue"),
        ordersCount: sql<string>`count(DISTINCT ${orderItems.orderId})`.as("orders_count"),
      })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(and(revenueOrderCondition(), withinBusinessDays(orders.createdAt, range.from, range.to)))
      .groupBy(orderItems.productId)
      .as("sales");

    const filters: SQL[] = [];
    if (query.q) {
      const pattern = containsPattern(query.q);
      const match = or(ilike(products.title, pattern), ilike(products.sku, pattern));
      if (match) filters.push(match);
    }
    if (query.categoryId) filters.push(eq(products.categoryId, query.categoryId));
    const where = filters.length > 0 ? and(...filters) : undefined;

    const units = sql<string>`coalesce(${sales.unitsSold}, 0)`;
    const revenue = sql<string>`coalesce(${sales.revenue}, 0)`;
    const stock = sellableStockSql(today);
    const orderBy: SQL[] = (() => {
      switch (query.sort) {
        case "units_desc":
          return [desc(units), desc(revenue), asc(products.title), asc(products.id)];
        case "title_asc":
          return [asc(products.title), asc(products.id)];
        case "stock_asc":
          return [asc(stock), asc(products.title), asc(products.id)];
        case "revenue_desc":
          return [desc(revenue), desc(units), asc(products.title), asc(products.id)];
      }
    })();

    const rows = await this.db
      .select({
        productId: products.id,
        title: products.title,
        sku: products.sku,
        slug: products.slug,
        image: firstImageSql(products.images),
        categoryId: categories.id,
        categoryName: categories.name,
        isActive: products.isActive,
        unitsSold: units,
        revenue,
        ordersCount: sql<string>`coalesce(${sales.ordersCount}, 0)`,
        currentStock: stock,
        lastSoldAt: lastSoldAtSql(),
      })
      .from(products)
      .leftJoin(categories, eq(categories.id, products.categoryId))
      .leftJoin(sales, eq(sales.productId, products.id))
      .where(where)
      .orderBy(...orderBy)
      .limit(query.limit)
      .offset(pageOffset(query.page, query.limit));

    const [totals] = await this.db
      .select({
        total: count(),
        unitsSold: sql<string>`coalesce(sum(${sales.unitsSold}), 0)`,
        revenue: sql<string>`coalesce(sum(${sales.revenue}), 0)`,
      })
      .from(products)
      .leftJoin(sales, eq(sales.productId, products.id))
      .where(where);

    return {
      items: rows.map((row) => {
        const revenuePaisa = toPaisa(row.revenue);
        const unitsSold = Number(row.unitsSold);
        return {
          productId: row.productId,
          title: row.title,
          sku: row.sku,
          slug: row.slug,
          image: row.image,
          category: row.categoryId !== null && row.categoryName !== null ? { id: row.categoryId, name: row.categoryName } : null,
          unitsSold,
          revenue: paisaToAmount(revenuePaisa),
          ordersCount: Number(row.ordersCount),
          avgSellingPrice: paisaToAmount(averagePaisa(revenuePaisa, unitsSold)),
          currentStock: Number(row.currentStock),
          lastSoldAt: toNullableIso(row.lastSoldAt),
          isActive: row.isActive,
        };
      }),
      total: Number(totals?.total ?? 0),
      totals: { unitsSold: Number(totals?.unitsSold ?? 0), revenue: moneyToNumber(totals?.revenue ?? "0") },
    };
  }

  async customerReport(query: CustomerReportQuery): Promise<CustomerReportResult> {
    const range = resolveReportRange(query, REPORT_DEFAULT_DAYS);
    const inRange = withinBusinessDays(orders.createdAt, range.from, range.to);
    const revenue = revenueOrderCondition();

    const accounts = await customerCountsByPeriod(this.db, range);
    const totals = await orderTotalsByPeriod(this.db, range);

    // Revenue orders per CUSTOMER account in the current and previous period.
    const startOfRange = startOfBusinessDay(range.from);
    const perCustomer = this.db
      .select({
        userId: orders.userId,
        current: sql<string>`count(*) FILTER (WHERE ${orders.createdAt} >= ${startOfRange})`.as("current_orders"),
        previous: sql<string>`count(*) FILTER (WHERE ${orders.createdAt} < ${startOfRange})`.as("previous_orders"),
      })
      .from(orders)
      .innerJoin(users, eq(users.id, orders.userId))
      .where(and(revenue, eq(users.role, "CUSTOMER"), withinBusinessDays(orders.createdAt, range.previousFrom, range.to)))
      .groupBy(orders.userId)
      .as("per_customer");
    const [repeat] = await this.db
      .select({
        buyers: sql<string>`count(*) FILTER (WHERE ${perCustomer.current} >= 1)`,
        returning: sql<string>`count(*) FILTER (WHERE ${perCustomer.current} >= 2)`,
        previousReturning: sql<string>`count(*) FILTER (WHERE ${perCustomer.previous} >= 2)`,
      })
      .from(perCustomer);
    const buyers = Number(repeat?.buyers ?? 0);
    const returning = Number(repeat?.returning ?? 0);

    const signups = await dailySignups(this.db, range);

    const district = sql<string>`coalesce(nullif(initcap(trim(${orders.shippingAddress}->>'district')), ''), 'Unknown')`;
    const districtRevenue = sumMoney(orders.total);
    const districtRows = await this.db
      .select({ district, orders: count(), revenue: districtRevenue })
      .from(orders)
      .where(and(revenue, inRange))
      .groupBy(sql`1`)
      .orderBy(desc(districtRevenue), desc(count()), asc(sql`1`))
      .limit(TOP_DISTRICTS);

    const spent = sumMoney(orders.total);
    const topRows = await this.db
      .select({
        id: users.id,
        fullName: users.fullName,
        phone: users.phone,
        email: users.email,
        orders: count(),
        totalSpent: spent,
        lastOrderAt: sql<Date | null>`max(${orders.createdAt})`.mapWith(orders.createdAt),
      })
      .from(orders)
      .innerJoin(users, eq(users.id, orders.userId))
      .where(and(revenue, inRange, eq(users.role, "CUSTOMER")))
      .groupBy(users.id)
      .orderBy(desc(spent), desc(count()), asc(users.id))
      .limit(query.limit)
      .offset(pageOffset(query.page, query.limit));

    const aovCurrent = averagePaisa(totals.current.revenuePaisa, totals.current.revenueOrders);
    const aovPrevious = averagePaisa(totals.previous.revenuePaisa, totals.previous.revenueOrders);

    return {
      report: {
        kpis: {
          totalCustomers: kpi(accounts.current.total, accounts.previous.total),
          newCustomers: kpi(accounts.current.created, accounts.previous.created),
          returningCustomers: kpi(returning, Number(repeat?.previousReturning ?? 0)),
          repeatRatePercent: percentOf(returning, buyers),
          avgOrderValue: moneyKpi(aovCurrent, aovPrevious),
        },
        signupSeries: buildSeries(
          range,
          signups.map((row) => ({ date: row.date, values: { count: row.count } })),
          () => ({ count: 0 }),
        ),
        byDistrict: districtRows.map((row) => ({
          district: row.district,
          orders: Number(row.orders),
          revenue: moneyToNumber(row.revenue),
        })),
        topCustomers: topRows.map((row) => ({
          id: row.id,
          fullName: row.fullName,
          phone: row.phone,
          email: row.email,
          orders: Number(row.orders),
          totalSpent: moneyToNumber(row.totalSpent),
          lastOrderAt: toNullableIso(row.lastOrderAt),
        })),
      },
      total: buyers,
    };
  }
}

export const salesReportService = new SalesReportService();
