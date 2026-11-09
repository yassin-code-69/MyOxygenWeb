/**
 * Batch inspector: every product batch with its shelf-life health computed in
 * the business time zone (env.APP_TIMEZONE).
 *
 * Health rules (shared by SQL filters and the TypeScript helper):
 *   EXPIRED        expiry_date <= today            (not sellable any more)
 *   EXPIRING_SOON  expiry_date <= today + 30 days and the batch still holds stock
 *   HEALTHY        everything else (including depleted batches near expiry)
 */
import { and, asc, count, eq, gt, ilike, lte, or, sql, type SQL } from "drizzle-orm";
import { db as defaultDb } from "../db/client";
import { productBatches, products } from "../db/schema/tables";
import { pageOffset } from "../lib/http";
import { addDays, daysUntil, todayInBusinessTz } from "../lib/dates";
import { type DbExecutor, queryAll } from "./db-executor";
import { containsPattern, toIso } from "./service-utils";

export const EXPIRING_SOON_DAYS = 30;

export const BATCH_HEALTH_STATUSES = ["EXPIRED", "EXPIRING_SOON", "HEALTHY"] as const;
export type BatchHealthStatus = (typeof BATCH_HEALTH_STATUSES)[number];

/** Batch as returned by every inventory endpoint. Dates are YYYY-MM-DD, timestamps ISO-8601. */
export interface BatchDTO {
  id: string;
  productId: string;
  productTitle: string;
  sku: string;
  batchNumber: string;
  manufactureDate: string | null;
  expiryDate: string;
  initialQuantity: number;
  availableQuantity: number;
  daysUntilExpiry: number;
  healthStatus: BatchHealthStatus;
  createdAt: string;
  updatedAt: string;
}

export interface BatchHealth {
  daysUntilExpiry: number;
  healthStatus: BatchHealthStatus;
}

export function calculateBatchHealth(
  expiryDate: string,
  availableQuantity: number,
  today: string = todayInBusinessTz(),
): BatchHealth {
  const daysUntilExpiry = daysUntil(expiryDate, today);
  if (daysUntilExpiry <= 0) {
    return { daysUntilExpiry, healthStatus: "EXPIRED" };
  }
  if (daysUntilExpiry <= EXPIRING_SOON_DAYS && availableQuantity > 0) {
    return { daysUntilExpiry, healthStatus: "EXPIRING_SOON" };
  }
  return { daysUntilExpiry, healthStatus: "HEALTHY" };
}

/** Row shape needed to build a `BatchDTO`. */
export interface BatchRowWithProduct {
  id: string;
  productId: string;
  productTitle: string;
  productSku: string;
  batchNumber: string;
  manufactureDate: string | null;
  expiryDate: string;
  initialQuantity: number;
  availableQuantity: number;
  createdAt: Date;
  updatedAt: Date;
}

export function toBatchDto(row: BatchRowWithProduct, today: string = todayInBusinessTz()): BatchDTO {
  const health = calculateBatchHealth(row.expiryDate, row.availableQuantity, today);
  return {
    id: row.id,
    productId: row.productId,
    productTitle: row.productTitle,
    sku: row.productSku,
    batchNumber: row.batchNumber,
    manufactureDate: row.manufactureDate,
    expiryDate: row.expiryDate,
    initialQuantity: row.initialQuantity,
    availableQuantity: row.availableQuantity,
    daysUntilExpiry: health.daysUntilExpiry,
    healthStatus: health.healthStatus,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

/** Column selection matching `BatchRowWithProduct` (join `products` on the batch's product). */
export const batchRowSelection = {
  id: productBatches.id,
  productId: productBatches.productId,
  productTitle: products.title,
  productSku: products.sku,
  batchNumber: productBatches.batchNumber,
  manufactureDate: productBatches.manufactureDate,
  expiryDate: productBatches.expiryDate,
  initialQuantity: productBatches.initialQuantity,
  availableQuantity: productBatches.availableQuantity,
  createdAt: productBatches.createdAt,
  updatedAt: productBatches.updatedAt,
} as const;

/** SQL twin of `calculateBatchHealth` for filtering / aggregation. */
function healthSql(today: string): SQL<BatchHealthStatus> {
  const soon = addDays(today, EXPIRING_SOON_DAYS);
  return sql<BatchHealthStatus>`(CASE
    WHEN ${productBatches.expiryDate} <= ${today}::date THEN 'EXPIRED'
    WHEN ${productBatches.expiryDate} <= ${soon}::date AND ${productBatches.availableQuantity} > 0 THEN 'EXPIRING_SOON'
    ELSE 'HEALTHY' END)`;
}

export interface BatchListFilters {
  page: number;
  limit: number;
  status?: BatchHealthStatus;
  /** Case-insensitive match on batch number, product title or SKU. */
  q?: string;
  productId?: string;
  /** Only batches that are still sellable and expire within N days (today excluded). */
  expiringWithinDays?: number;
  /** Only batches with available stock. */
  inStockOnly?: boolean;
  /** Business date override (tests). */
  today?: string;
}

export type BatchHealthSummary = Record<BatchHealthStatus, number>;

export interface BatchListResult {
  items: BatchDTO[];
  total: number;
  /** Counts per health status for the filters EXCLUDING `status`. */
  summary: BatchHealthSummary;
}

export class BatchInspectorService {
  async listBatches(filters: BatchListFilters, db: DbExecutor = defaultDb): Promise<BatchListResult> {
    const today = filters.today ?? todayInBusinessTz();
    const health = healthSql(today);

    const base: SQL[] = [];
    if (filters.productId) base.push(eq(productBatches.productId, filters.productId));
    if (filters.inStockOnly) base.push(gt(productBatches.availableQuantity, 0));
    if (filters.expiringWithinDays !== undefined) {
      base.push(gt(productBatches.expiryDate, today));
      base.push(lte(productBatches.expiryDate, addDays(today, filters.expiringWithinDays)));
    }
    if (filters.q) {
      const pattern = containsPattern(filters.q);
      const match = or(
        ilike(productBatches.batchNumber, pattern),
        ilike(products.title, pattern),
        ilike(products.sku, pattern),
      );
      if (match) base.push(match);
    }

    const filtered = filters.status ? [...base, sql`${health} = ${filters.status}`] : base;
    const where = filtered.length > 0 ? and(...filtered) : undefined;
    const baseWhere = base.length > 0 ? and(...base) : undefined;

    const [rows, totals, groups] = await queryAll(
      db,
      () =>
        db
          .select(batchRowSelection)
          .from(productBatches)
          .innerJoin(products, eq(productBatches.productId, products.id))
          .where(where)
          .orderBy(
            asc(productBatches.expiryDate),
            asc(products.title),
            asc(productBatches.batchNumber),
            asc(productBatches.id),
          )
          .limit(filters.limit)
          .offset(pageOffset(filters.page, filters.limit)),
      () =>
        db
          .select({ total: count() })
          .from(productBatches)
          .innerJoin(products, eq(productBatches.productId, products.id))
          .where(where),
      () =>
        db
          .select({ status: health, total: count() })
          .from(productBatches)
          .innerJoin(products, eq(productBatches.productId, products.id))
          .where(baseWhere)
          // Group by ordinal: repeating the CASE would bind new parameters and not match the select list.
          .groupBy(sql.raw("1")),
    );

    const summary: BatchHealthSummary = { EXPIRED: 0, EXPIRING_SOON: 0, HEALTHY: 0 };
    for (const group of groups) {
      summary[group.status] = Number(group.total);
    }

    return {
      items: rows.map((row) => toBatchDto(row, today)),
      total: Number(totals[0]?.total ?? 0),
      summary,
    };
  }

  /** All batches of one product in FEFO order (admin product detail). */
  async listProductBatches(productId: string, db: DbExecutor = defaultDb): Promise<BatchDTO[]> {
    const today = todayInBusinessTz();
    const rows = await db
      .select(batchRowSelection)
      .from(productBatches)
      .innerJoin(products, eq(productBatches.productId, products.id))
      .where(eq(productBatches.productId, productId))
      .orderBy(asc(productBatches.expiryDate), asc(productBatches.id));
    return rows.map((row) => toBatchDto(row, today));
  }
}

export const batchInspectorService = new BatchInspectorService();
