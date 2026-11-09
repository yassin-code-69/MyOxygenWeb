/**
 * Profit & margin reports (SUPER_ADMIN): GET /admin/reports/profit,
 * /admin/reports/profit/products and /admin/reports/profit/products/:id.
 *
 * Formulas (money in integer paisa, percentages rounded to 2 decimals and 0
 * when the denominator is 0):
 *  - Revenue          = SUM(orders.total) of revenue orders (not CANCELLED /
 *                       REFUNDED) placed in range — includes delivery fees,
 *                       net of coupon discounts.
 *  - COGS             = SUM(order_items.unit_cost * quantity) of those orders
 *                       (unit_cost = cost price snapshot taken at checkout).
 *  - Gross profit     = Revenue - COGS;   gross margin % = gross profit / revenue * 100
 *  - Expenses         = SUM(expenses.amount) with incurred_on in [from, to]
 *  - Net profit       = Gross profit - Expenses;  net margin % = net profit / revenue * 100
 *  - Trend buckets    : revenue, cost = COGS, profit = gross profit,
 *                       marginPercent = gross margin of the bucket.
 *  - Category / product level revenue = net line revenue (line total less its
 *    pro-rata coupon share; delivery fees are not attributed to products),
 *    cost = COGS of those lines, profit = revenue - cost,
 *    marginPercent = profit / revenue * 100.
 *  - Expense breakdown: PRODUCT_COST (= COGS) plus every expense category with
 *    a non-zero amount; percent = amount / (COGS + expenses) * 100.
 *  - Product rows: sellingPrice = revenue / units (avg realised unit price) or
 *    the current effective price when unsold; avgCost = COGS / units or the
 *    current cost price when unsold; profitPerUnit = sellingPrice - avgCost;
 *    marginPercent = profit / revenue (sold) or profitPerUnit / sellingPrice
 *    (unsold).
 *  - Product detail pricing (current unit economics): basePrice = current list
 *    price; netSellingPrice = avg realised unit price (current effective price
 *    when unsold); avgDiscountPerUnit = basePrice - netSellingPrice (automatic
 *    discounts + coupon share; negative if the list price was lowered after
 *    those sales); profitPerUnit = netSellingPrice - current cost price
 *    (= landed cost when itemised); marginPercent = profitPerUnit / netSellingPrice.
 */
import { and, asc, desc, eq, gte, ilike, lte, or, sql, type SQL } from "drizzle-orm";
import { db as defaultDb } from "../../db/client";
import { categories, expenses, orderItems, orders, products, type CostBreakdown } from "../../db/schema/tables";
import { AppError } from "../../lib/errors";
import type { DbExecutor } from "../db-executor";
import type { ExpenseCategory } from "../expense.service";
import { flashSaleService, type Discount, type FlashSaleService } from "../flash-sale.service";
import { paisaToAmount, toPaisa } from "../order-pricing";
import { costBreakdownTotal, normalizeCostBreakdown } from "../product.service";
import { containsPattern } from "../service-utils";
import { businessDayOf } from "../sql-time";
import { orderCogsSql, orderTotalsByPeriod } from "./period-queries";
import {
  averagePaisa,
  buildSeries,
  moneyKpi,
  percentOf,
  publicRange,
  REPORT_DEFAULT_DAYS,
  resolveReportRange,
  kpi,
  type Kpi,
  type RangeQuery,
  type ReportRange,
  type ResolvedRange,
  type SeriesPoint,
} from "./range";
import { firstImageSql, lineCogsSql, lineNetRevenueSql, revenueOrderCondition, sumMoney, withinBusinessDays } from "./sql";

export const EXPENSE_CATEGORY_LABELS: Readonly<Record<ExpenseCategory, string>> = {
  SHIPPING: "Shipping",
  MARKETING: "Marketing",
  DELIVERY_SUBSIDY: "Delivery subsidy",
  PACKAGING: "Packaging",
  SALARIES: "Salaries",
  RENT: "Rent",
  UTILITIES: "Utilities",
  OTHER: "Other",
};

export const PROFIT_PRODUCT_SORTS = ["margin_desc", "margin_asc", "profit_desc", "revenue_desc"] as const;
export type ProfitProductSort = (typeof PROFIT_PRODUCT_SORTS)[number];

const TOP_PROFITABLE = 5;

export interface ProfitSummaryDTO {
  range: ReportRange;
  kpis: {
    revenue: Kpi;
    cogs: Kpi;
    grossProfit: Kpi;
    grossMarginPercent: Kpi;
    expenses: Kpi;
    netProfit: Kpi;
    netMarginPercent: Kpi;
  };
  trend: Array<SeriesPoint & { revenue: number; cost: number; profit: number; marginPercent: number }>;
  byCategory: Array<{ categoryId: string; name: string; revenue: number; cost: number; profit: number; marginPercent: number }>;
  topProfitable: Array<{ productId: string; title: string; image: string | null; profit: number; marginPercent: number }>;
  expenseBreakdown: Array<{ key: "PRODUCT_COST" | ExpenseCategory; label: string; amount: number; percent: number }>;
}

export interface ProfitProductsQuery extends RangeQuery {
  q?: string;
  categoryId?: string;
  sort: ProfitProductSort;
  page: number;
  limit: number;
}

export interface ProfitProductRowDTO {
  productId: string;
  title: string;
  sku: string;
  image: string | null;
  category: { id: string; name: string } | null;
  sellingPrice: number;
  avgCost: number;
  profitPerUnit: number;
  marginPercent: number;
  unitsSold: number;
  revenue: number;
  cogs: number;
  profit: number;
  isActive: boolean;
}

export interface ProfitProductDetailDTO {
  product: {
    id: string;
    title: string;
    sku: string;
    image: string | null;
    category: { id: string; name: string } | null;
    isActive: boolean;
  };
  range: ReportRange;
  unitsSold: number;
  revenue: number;
  cogs: number;
  grossProfit: number;
  marginPercent: number;
  costBreakdown: (CostBreakdown & { landedCost: number }) | null;
  pricing: {
    basePrice: number;
    avgDiscountPerUnit: number;
    netSellingPrice: number;
    profitPerUnit: number;
    marginPercent: number;
  };
}

/** Per-product sales aggregate of revenue orders in range. */
interface ProductSalesRow {
  productId: string;
  title: string;
  sku: string;
  image: string | null;
  categoryId: string | null;
  categoryName: string | null;
  isActive: boolean;
  basePrice: string;
  costPrice: string;
  unitsSold: number;
  revenuePaisa: number;
  cogsPaisa: number;
}

interface ProductEconomics {
  sellingPricePaisa: number;
  avgCostPaisa: number;
  profitPaisa: number;
  marginPercent: number;
}

export class ProfitReportService {
  constructor(
    private readonly db: DbExecutor = defaultDb,
    private readonly flashSales: FlashSaleService = flashSaleService,
  ) {}

  async profitSummary(query: RangeQuery): Promise<ProfitSummaryDTO> {
    const range = resolveReportRange(query, REPORT_DEFAULT_DAYS);
    const inRange = withinBusinessDays(orders.createdAt, range.from, range.to);
    const revenueOrders = revenueOrderCondition();

    const { current, previous } = await orderTotalsByPeriod(this.db, range);
    const expenseTotals = await this.expenseTotals(range);

    // Daily revenue and COGS (per order, correlated COGS subquery), bucketed in JS.
    const dailyRows = await this.db
      .select({
        date: businessDayOf(orders.createdAt),
        revenue: sumMoney(orders.total),
        cogs: sumMoney(orderCogsSql),
      })
      .from(orders)
      .where(and(revenueOrders, inRange))
      .groupBy(sql`1`);

    const lineRevenue = sumMoney(lineNetRevenueSql);
    const lineCogs = sumMoney(lineCogsSql);
    const categoryRows = await this.db
      .select({ categoryId: categories.id, name: categories.name, revenue: lineRevenue, cost: lineCogs })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .innerJoin(products, eq(products.id, orderItems.productId))
      .innerJoin(categories, eq(categories.id, products.categoryId))
      .where(and(revenueOrders, inRange))
      .groupBy(categories.id)
      .orderBy(desc(lineRevenue), asc(categories.name));

    const profitExpr = sql<string>`(round(sum(${lineNetRevenueSql}), 2) - round(sum(${lineCogsSql}), 2))`;
    const topRows = await this.db
      .select({
        productId: products.id,
        title: products.title,
        image: firstImageSql(products.images),
        revenue: lineRevenue,
        cost: lineCogs,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .innerJoin(products, eq(products.id, orderItems.productId))
      .where(and(revenueOrders, inRange))
      .groupBy(products.id)
      .orderBy(desc(profitExpr), asc(products.title))
      .limit(TOP_PROFITABLE);

    const grossCurrent = current.revenuePaisa - current.cogsPaisa;
    const grossPrevious = previous.revenuePaisa - previous.cogsPaisa;
    const netCurrent = grossCurrent - expenseTotals.current;
    const netPrevious = grossPrevious - expenseTotals.previous;
    const grossMarginCurrent = percentOf(grossCurrent, current.revenuePaisa);
    const grossMarginPrevious = percentOf(grossPrevious, previous.revenuePaisa);
    const netMarginCurrent = percentOf(netCurrent, current.revenuePaisa);
    const netMarginPrevious = percentOf(netPrevious, previous.revenuePaisa);

    const trend = buildSeries(
      range,
      dailyRows.map((row) => ({ date: row.date, values: { revenuePaisa: toPaisa(row.revenue), costPaisa: toPaisa(row.cogs) } })),
      () => ({ revenuePaisa: 0, costPaisa: 0 }),
    ).map((point) => ({
      period: point.period,
      label: point.label,
      revenue: paisaToAmount(point.revenuePaisa),
      cost: paisaToAmount(point.costPaisa),
      profit: paisaToAmount(point.revenuePaisa - point.costPaisa),
      marginPercent: percentOf(point.revenuePaisa - point.costPaisa, point.revenuePaisa),
    }));

    const costTotal = current.cogsPaisa + expenseTotals.byCategory.reduce((sum, row) => sum + row.amountPaisa, 0);
    const expenseBreakdown: ProfitSummaryDTO["expenseBreakdown"] = [
      { key: "PRODUCT_COST" as const, label: "Product cost", amountPaisa: current.cogsPaisa },
      ...expenseTotals.byCategory.map((row) => ({
        key: row.category,
        label: EXPENSE_CATEGORY_LABELS[row.category],
        amountPaisa: row.amountPaisa,
      })),
    ]
      .sort((a, b) => b.amountPaisa - a.amountPaisa)
      .map((row) => ({
        key: row.key,
        label: row.label,
        amount: paisaToAmount(row.amountPaisa),
        percent: percentOf(row.amountPaisa, costTotal),
      }));

    return {
      range: publicRange(range),
      kpis: {
        revenue: moneyKpi(current.revenuePaisa, previous.revenuePaisa),
        cogs: moneyKpi(current.cogsPaisa, previous.cogsPaisa),
        grossProfit: moneyKpi(grossCurrent, grossPrevious),
        grossMarginPercent: kpi(grossMarginCurrent, grossMarginPrevious),
        expenses: moneyKpi(expenseTotals.current, expenseTotals.previous),
        netProfit: moneyKpi(netCurrent, netPrevious),
        netMarginPercent: kpi(netMarginCurrent, netMarginPrevious),
      },
      trend,
      byCategory: categoryRows.map((row) => {
        const revenuePaisa = toPaisa(row.revenue);
        const costPaisa = toPaisa(row.cost);
        return {
          categoryId: row.categoryId,
          name: row.name,
          revenue: paisaToAmount(revenuePaisa),
          cost: paisaToAmount(costPaisa),
          profit: paisaToAmount(revenuePaisa - costPaisa),
          marginPercent: percentOf(revenuePaisa - costPaisa, revenuePaisa),
        };
      }),
      topProfitable: topRows.map((row) => {
        const revenuePaisa = toPaisa(row.revenue);
        const profitPaisa = revenuePaisa - toPaisa(row.cost);
        return {
          productId: row.productId,
          title: row.title,
          image: row.image,
          profit: paisaToAmount(profitPaisa),
          marginPercent: percentOf(profitPaisa, revenuePaisa),
        };
      }),
      expenseBreakdown,
    };
  }

  /**
   * Product profitability table. Sales are aggregated in Postgres (one row per
   * product); the derived per-unit metrics need the current effective price
   * of unsold products (TypeScript pricing engine), so sorting and paging
   * happen on that per-product list — bounded by the catalog size, never by
   * the number of orders.
   */
  async profitProducts(query: ProfitProductsQuery): Promise<{ items: ProfitProductRowDTO[]; total: number }> {
    const range = resolveReportRange(query, REPORT_DEFAULT_DAYS);
    const filters: SQL[] = [];
    if (query.q) {
      const pattern = containsPattern(query.q);
      const match = or(ilike(products.title, pattern), ilike(products.sku, pattern));
      if (match) filters.push(match);
    }
    if (query.categoryId) filters.push(eq(products.categoryId, query.categoryId));

    const rows = await this.productSales(range, filters);
    const discounts = await this.flashSales.getActiveDiscounts(undefined, undefined, this.db);
    const now = new Date();

    const computed = rows.map((row) => {
      const economics = this.economics(row, discounts, now);
      return { row, economics };
    });

    const byTitle = (a: ProductSalesRow, b: ProductSalesRow): number =>
      a.title.localeCompare(b.title) || (a.productId < b.productId ? -1 : a.productId > b.productId ? 1 : 0);
    computed.sort((a, b) => {
      switch (query.sort) {
        case "margin_asc":
          return a.economics.marginPercent - b.economics.marginPercent || byTitle(a.row, b.row);
        case "profit_desc":
          return b.economics.profitPaisa - a.economics.profitPaisa || byTitle(a.row, b.row);
        case "revenue_desc":
          return b.row.revenuePaisa - a.row.revenuePaisa || byTitle(a.row, b.row);
        case "margin_desc":
          return b.economics.marginPercent - a.economics.marginPercent || byTitle(a.row, b.row);
      }
    });

    const offset = (query.page - 1) * query.limit;
    const items = computed.slice(offset, offset + query.limit).map(({ row, economics }) => ({
      productId: row.productId,
      title: row.title,
      sku: row.sku,
      image: row.image,
      category: row.categoryId !== null && row.categoryName !== null ? { id: row.categoryId, name: row.categoryName } : null,
      sellingPrice: paisaToAmount(economics.sellingPricePaisa),
      avgCost: paisaToAmount(economics.avgCostPaisa),
      profitPerUnit: paisaToAmount(economics.sellingPricePaisa - economics.avgCostPaisa),
      marginPercent: economics.marginPercent,
      unitsSold: row.unitsSold,
      revenue: paisaToAmount(row.revenuePaisa),
      cogs: paisaToAmount(row.cogsPaisa),
      profit: paisaToAmount(economics.profitPaisa),
      isActive: row.isActive,
    }));
    return { items, total: computed.length };
  }

  async profitProductDetail(productId: string, query: RangeQuery): Promise<ProfitProductDetailDTO> {
    const range = resolveReportRange(query, REPORT_DEFAULT_DAYS);
    const [row] = await this.productSales(range, [eq(products.id, productId)]);
    if (!row) throw AppError.notFound("Product", { id: productId });

    const [stored] = await this.db
      .select({ costBreakdown: products.costBreakdown })
      .from(products)
      .where(eq(products.id, productId));
    const breakdown = normalizeCostBreakdown(stored?.costBreakdown);

    const discounts = await this.flashSales.getActiveDiscounts(productId, row.categoryId ?? undefined, this.db);
    const effectivePaisa = this.effectivePricePaisa(row, discounts, new Date());
    const basePricePaisa = toPaisa(row.basePrice);
    const costPricePaisa = toPaisa(row.costPrice);
    const netSellingPaisa = row.unitsSold > 0 ? averagePaisa(row.revenuePaisa, row.unitsSold) : effectivePaisa;
    const profitPerUnitPaisa = netSellingPaisa - costPricePaisa;
    const grossProfitPaisa = row.revenuePaisa - row.cogsPaisa;

    return {
      product: {
        id: row.productId,
        title: row.title,
        sku: row.sku,
        image: row.image,
        category: row.categoryId !== null && row.categoryName !== null ? { id: row.categoryId, name: row.categoryName } : null,
        isActive: row.isActive,
      },
      range: publicRange(range),
      unitsSold: row.unitsSold,
      revenue: paisaToAmount(row.revenuePaisa),
      cogs: paisaToAmount(row.cogsPaisa),
      grossProfit: paisaToAmount(grossProfitPaisa),
      marginPercent: percentOf(grossProfitPaisa, row.revenuePaisa),
      costBreakdown: breakdown === null ? null : { ...breakdown, landedCost: costBreakdownTotal(breakdown) },
      pricing: {
        basePrice: paisaToAmount(basePricePaisa),
        avgDiscountPerUnit: paisaToAmount(basePricePaisa - netSellingPaisa),
        netSellingPrice: paisaToAmount(netSellingPaisa),
        profitPerUnit: paisaToAmount(profitPerUnitPaisa),
        marginPercent: percentOf(profitPerUnitPaisa, netSellingPaisa),
      },
    };
  }

  /** Expenses of the range and previous period, plus the range per category (2 queries). */
  private async expenseTotals(
    range: ResolvedRange,
  ): Promise<{ current: number; previous: number; byCategory: Array<{ category: ExpenseCategory; amountPaisa: number }> }> {
    const isCurrent = gte(expenses.incurredOn, range.from);
    const [totals] = await this.db
      .select({
        current: sumMoney(expenses.amount, isCurrent),
        previous: sumMoney(expenses.amount, sql`${expenses.incurredOn} < ${range.from}::date`),
      })
      .from(expenses)
      .where(and(gte(expenses.incurredOn, range.previousFrom), lte(expenses.incurredOn, range.to)));
    const amount = sumMoney(expenses.amount);
    const rows = await this.db
      .select({ category: expenses.category, amount })
      .from(expenses)
      .where(and(gte(expenses.incurredOn, range.from), lte(expenses.incurredOn, range.to)))
      .groupBy(expenses.category)
      .orderBy(desc(amount));
    return {
      current: toPaisa(totals?.current ?? "0"),
      previous: toPaisa(totals?.previous ?? "0"),
      byCategory: rows
        .map((row) => ({ category: row.category, amountPaisa: toPaisa(row.amount) }))
        .filter((row) => row.amountPaisa > 0),
    };
  }

  /** Every product matching `filters` with its revenue-order sales in range (one row per product). */
  private async productSales(range: ResolvedRange, filters: SQL[]): Promise<ProductSalesRow[]> {
    const sales = this.db
      .select({
        productId: orderItems.productId,
        unitsSold: sql<string>`sum(${orderItems.quantity})`.as("units_sold"),
        revenue: sql<string>`round(sum(${lineNetRevenueSql}), 2)`.as("revenue"),
        cogs: sql<string>`round(sum(${lineCogsSql}), 2)`.as("cogs"),
      })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(and(revenueOrderCondition(), withinBusinessDays(orders.createdAt, range.from, range.to)))
      .groupBy(orderItems.productId)
      .as("sales");

    const rows = await this.db
      .select({
        productId: products.id,
        title: products.title,
        sku: products.sku,
        image: firstImageSql(products.images),
        categoryId: categories.id,
        categoryName: categories.name,
        isActive: products.isActive,
        basePrice: products.basePrice,
        costPrice: products.costPrice,
        unitsSold: sql<string>`coalesce(${sales.unitsSold}, 0)`,
        revenue: sql<string>`coalesce(${sales.revenue}, 0)`,
        cogs: sql<string>`coalesce(${sales.cogs}, 0)`,
      })
      .from(products)
      .leftJoin(categories, eq(categories.id, products.categoryId))
      .leftJoin(sales, eq(sales.productId, products.id))
      .where(filters.length > 0 ? and(...filters) : undefined);

    return rows.map((row) => ({
      productId: row.productId,
      title: row.title,
      sku: row.sku,
      image: row.image,
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      isActive: row.isActive,
      basePrice: row.basePrice,
      costPrice: row.costPrice,
      unitsSold: Number(row.unitsSold),
      revenuePaisa: toPaisa(row.revenue),
      cogsPaisa: toPaisa(row.cogs),
    }));
  }

  /** Current effective (storefront) unit price, from the shared TypeScript pricing engine. */
  private effectivePricePaisa(row: ProductSalesRow, discounts: readonly Discount[], now: Date): number {
    const pricing = this.flashSales.calculateEffectivePrice(
      { id: row.productId, categoryId: row.categoryId ?? "", basePrice: row.basePrice },
      discounts,
      now,
    );
    return toPaisa(pricing.effectivePrice);
  }

  private economics(row: ProductSalesRow, discounts: readonly Discount[], now: Date): ProductEconomics {
    if (row.unitsSold > 0) {
      const profitPaisa = row.revenuePaisa - row.cogsPaisa;
      return {
        sellingPricePaisa: averagePaisa(row.revenuePaisa, row.unitsSold),
        avgCostPaisa: averagePaisa(row.cogsPaisa, row.unitsSold),
        profitPaisa,
        marginPercent: percentOf(profitPaisa, row.revenuePaisa),
      };
    }
    const sellingPricePaisa = this.effectivePricePaisa(row, discounts, now);
    const avgCostPaisa = toPaisa(row.costPrice);
    return {
      sellingPricePaisa,
      avgCostPaisa,
      profitPaisa: 0,
      marginPercent: percentOf(sellingPricePaisa - avgCostPaisa, sellingPricePaisa),
    };
  }
}

export const profitReportService = new ProfitReportService();
