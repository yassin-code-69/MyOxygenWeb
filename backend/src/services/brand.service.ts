/**
 * Brand administration (/admin/catalog/brands). Brands are the distinct
 * `products.brand` values (exact spelling, so inconsistent spellings show up
 * separately and can be merged with a rename).
 *
 * - unitsSold30d: units on orders that are not CANCELLED/REFUNDED, placed in
 *   the last 30 business days (APP_TIMEZONE, today included).
 * - Rename: one UPDATE statement over every product whose brand matches `from`
 *   case-insensitively; 404 when none match, 422 when `from` equals `to`.
 */
import { and, asc, eq, isNotNull, notInArray, sql } from "drizzle-orm";
import { db as defaultDb } from "../db/client";
import { orderItems, orders, products } from "../db/schema/tables";
import { addDays, todayInBusinessTz } from "../lib/dates";
import { AppError } from "../lib/errors";
import { invalidateCatalogCache } from "../middleware/cache";
import type { DbExecutor } from "./db-executor";
import { REVENUE_EXCLUDED_STATUSES } from "./order-state-machine";
import { fieldValidationError } from "./service-utils";
import { onOrAfterBusinessDay } from "./sql-time";

export const BRAND_SALES_WINDOW_DAYS = 30;

export interface BrandDTO {
  name: string;
  productCount: number;
  activeProductCount: number;
  unitsSold30d: number;
}

export interface RenameBrandInput {
  from: string;
  to: string;
}

export class BrandService {
  constructor(private readonly db: DbExecutor = defaultDb) {}

  async listBrands(today: string = todayInBusinessTz()): Promise<BrandDTO[]> {
    const windowStart = addDays(today, -(BRAND_SALES_WINDOW_DAYS - 1));

    const sales = this.db
      .select({
        brand: products.brand,
        units: sql<number>`sum(${orderItems.quantity})::int`.as("units"),
      })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .innerJoin(products, eq(products.id, orderItems.productId))
      .where(
        and(
          isNotNull(products.brand),
          notInArray(orders.status, [...REVENUE_EXCLUDED_STATUSES]),
          onOrAfterBusinessDay(orders.createdAt, windowStart),
        ),
      )
      .groupBy(products.brand)
      .as("brand_sales");

    const rows = await this.db
      .select({
        name: sql<string>`${products.brand}`,
        productCount: sql<number>`count(*)::int`.mapWith(Number),
        activeProductCount: sql<number>`(count(*) filter (where ${products.isActive}))::int`.mapWith(Number),
        unitsSold30d: sql<number>`coalesce(max(${sales.units}), 0)::int`.mapWith(Number),
      })
      .from(products)
      .leftJoin(sales, eq(sales.brand, products.brand))
      .where(isNotNull(products.brand))
      .groupBy(products.brand)
      .orderBy(asc(sql`lower(${products.brand})`), asc(products.brand));

    return rows.map((row) => ({
      name: row.name,
      productCount: row.productCount,
      activeProductCount: row.activeProductCount,
      unitsSold30d: row.unitsSold30d,
    }));
  }

  /** Renames the brand on every matching product in one statement. */
  async renameBrand(input: RenameBrandInput): Promise<{ updated: number }> {
    if (input.from === input.to) {
      throw fieldValidationError({ to: ["The new brand name must differ from the current one"] });
    }
    const updated = await this.db
      .update(products)
      .set({ brand: input.to })
      .where(sql`lower(${products.brand}) = lower(${input.from})`)
      .returning({ id: products.id });
    if (updated.length === 0) {
      throw AppError.notFound("Brand", { brand: input.from });
    }
    invalidateCatalogCache();
    return { updated: updated.length };
  }
}

export const brandService = new BrandService();
