/**
 * Inventory report: GET /admin/reports/inventory (a snapshot "as of now").
 *
 * Definitions:
 *  - Stock = sellable stock: SUM(available_quantity) of unexpired batches
 *    (expiry > today in APP_TIMEZONE), the same rule as checkout / FEFO.
 *  - stockValueCost   = SUM(stock * cost_price)  (current cost price)
 *  - stockValueRetail = SUM(stock * base_price)  (list price, before automatic
 *    discounts — flash sales are temporary and would make the figure jumpy)
 *  - productCount counts every product; activeCount those listed (is_active).
 *  - lowStock: listed or auto-hidden (sold-out) products whose stock is
 *    <= low_stock_threshold (same rule as the dashboard), lowest first.
 *  - expiringSoon: batches with stock expiring within 30 days (batch inspector).
 *  - deadStock: products with stock > 0 and no revenue sale in the last 60
 *    days (last sale on or before today - 60, or never sold), oldest first.
 */
import { and, asc, desc, eq, gt, isNotNull, or, sql } from "drizzle-orm";
import { db as defaultDb } from "../../db/client";
import { categories, productBatches, products } from "../../db/schema/tables";
import { env } from "../../env";
import { addDays, todayInBusinessTz } from "../../lib/dates";
import { batchInspectorService, EXPIRING_SOON_DAYS, type BatchDTO } from "../batch-inspector.service";
import type { DbExecutor } from "../db-executor";
import { listingStatusOf, type ListingStatus } from "../inventory.service";
import { moneyToNumber } from "../order-pricing";
import { toNullableIso } from "../service-utils";
import { firstImageSql } from "./sql";

export const DEAD_STOCK_DAYS = 60;
const REPORT_LIST_LIMIT = 100;

export interface InventoryReportDTO {
  totals: {
    productCount: number;
    activeCount: number;
    stockUnits: number;
    stockValueCost: number;
    stockValueRetail: number;
  };
  byCategory: Array<{ categoryId: string; name: string; stockUnits: number; valueCost: number; valueRetail: number }>;
  lowStock: Array<{
    productId: string;
    title: string;
    image: string | null;
    totalStock: number;
    lowStockThreshold: number;
    listingStatus: ListingStatus;
  }>;
  expiringSoon: BatchDTO[];
  deadStock: Array<{
    productId: string;
    title: string;
    image: string | null;
    totalStock: number;
    lastSoldAt: string | null;
    daysSinceLastSale: number | null;
  }>;
}

export class InventoryReportService {
  constructor(private readonly db: DbExecutor = defaultDb) {}

  /** Sellable stock per product as a derived table. */
  private sellableStock(today: string) {
    return this.db
      .select({
        productId: productBatches.productId,
        units: sql<string>`sum(${productBatches.availableQuantity})`.as("units"),
      })
      .from(productBatches)
      .where(and(gt(productBatches.availableQuantity, 0), sql`${productBatches.expiryDate} > ${today}::date`))
      .groupBy(productBatches.productId)
      .as("stock");
  }

  async inventoryReport(): Promise<InventoryReportDTO> {
    const today = todayInBusinessTz();

    const stock = this.sellableStock(today);
    const units = sql<string>`coalesce(${stock.units}, 0)`;
    const valueCost = sql<string>`coalesce(round(sum(coalesce(${stock.units}, 0) * ${products.costPrice}), 2), 0)`;
    const valueRetail = sql<string>`coalesce(round(sum(coalesce(${stock.units}, 0) * ${products.basePrice}), 2), 0)`;

    const [totals] = await this.db
      .select({
        productCount: sql<string>`count(*)`,
        activeCount: sql<string>`count(*) FILTER (WHERE ${products.isActive})`,
        stockUnits: sql<string>`coalesce(sum(${stock.units}), 0)`,
        valueCost,
        valueRetail,
      })
      .from(products)
      .leftJoin(stock, eq(stock.productId, products.id));

    const categoryStock = this.sellableStock(today);
    const categoryUnits = sql<string>`coalesce(sum(${categoryStock.units}), 0)`;
    const categoryRows = await this.db
      .select({
        categoryId: categories.id,
        name: categories.name,
        stockUnits: categoryUnits,
        valueCost: sql<string>`coalesce(round(sum(coalesce(${categoryStock.units}, 0) * ${products.costPrice}), 2), 0)`,
        valueRetail: sql<string>`coalesce(round(sum(coalesce(${categoryStock.units}, 0) * ${products.basePrice}), 2), 0)`,
      })
      .from(categories)
      .innerJoin(products, eq(products.categoryId, categories.id))
      .leftJoin(categoryStock, eq(categoryStock.productId, products.id))
      .groupBy(categories.id)
      .orderBy(desc(categoryUnits), asc(categories.name));

    const lowStock = this.sellableStock(today);
    const lowUnits = sql<string>`coalesce(${lowStock.units}, 0)`;
    const lowRows = await this.db
      .select({
        productId: products.id,
        title: products.title,
        image: firstImageSql(products.images),
        totalStock: lowUnits,
        lowStockThreshold: products.lowStockThreshold,
        isActive: products.isActive,
        autoDeactivatedAt: products.autoDeactivatedAt,
      })
      .from(products)
      .leftJoin(lowStock, eq(lowStock.productId, products.id))
      .where(
        and(
          or(eq(products.isActive, true), isNotNull(products.autoDeactivatedAt)),
          sql`${lowUnits} <= ${products.lowStockThreshold}`,
        ),
      )
      .orderBy(asc(lowUnits), asc(products.title), asc(products.id))
      .limit(REPORT_LIST_LIMIT);

    const expiring = await batchInspectorService.listBatches(
      { page: 1, limit: REPORT_LIST_LIMIT, expiringWithinDays: EXPIRING_SOON_DAYS, inStockOnly: true, today },
      this.db,
    );

    const deadStock = this.sellableStock(today);
    const lastSale = sql<Date | null>`(
      SELECT max(o.created_at) FROM order_items oi JOIN orders o ON o.id = oi.order_id
      WHERE oi.product_id = "products"."id" AND o.status NOT IN ('CANCELLED', 'REFUNDED')
    )`;
    const daysSince = sql<number | null>`(${today}::date - ((${lastSale}) AT TIME ZONE ${env.APP_TIMEZONE})::date)`;
    const cutoff = addDays(today, -DEAD_STOCK_DAYS);
    const deadRows = await this.db
      .select({
        productId: products.id,
        title: products.title,
        image: firstImageSql(products.images),
        totalStock: sql<string>`${deadStock.units}`,
        lastSoldAt: sql<Date | null>`${lastSale}`.mapWith(products.createdAt),
        daysSinceLastSale: daysSince,
      })
      .from(products)
      .innerJoin(deadStock, eq(deadStock.productId, products.id))
      .where(
        sql`(${lastSale} IS NULL OR ((${lastSale}) AT TIME ZONE ${env.APP_TIMEZONE})::date <= ${cutoff}::date)`,
      )
      .orderBy(sql`${daysSince} DESC NULLS FIRST`, desc(deadStock.units), asc(products.title))
      .limit(REPORT_LIST_LIMIT);

    return {
      totals: {
        productCount: Number(totals?.productCount ?? 0),
        activeCount: Number(totals?.activeCount ?? 0),
        stockUnits: Number(totals?.stockUnits ?? 0),
        stockValueCost: moneyToNumber(totals?.valueCost ?? "0"),
        stockValueRetail: moneyToNumber(totals?.valueRetail ?? "0"),
      },
      byCategory: categoryRows.map((row) => ({
        categoryId: row.categoryId,
        name: row.name,
        stockUnits: Number(row.stockUnits),
        valueCost: moneyToNumber(row.valueCost),
        valueRetail: moneyToNumber(row.valueRetail),
      })),
      lowStock: lowRows.map((row) => ({
        productId: row.productId,
        title: row.title,
        image: row.image,
        totalStock: Number(row.totalStock),
        lowStockThreshold: row.lowStockThreshold,
        listingStatus: listingStatusOf(row),
      })),
      expiringSoon: expiring.items,
      deadStock: deadRows.map((row) => ({
        productId: row.productId,
        title: row.title,
        image: row.image,
        totalStock: Number(row.totalStock),
        lastSoldAt: toNullableIso(row.lastSoldAt),
        daysSinceLastSale: row.daysSinceLastSale === null ? null : Number(row.daysSinceLastSale),
      })),
    };
  }
}

export const inventoryReportService = new InventoryReportService();
