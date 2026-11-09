/**
 * Stock audit ledger (`stock_history_logs`) queries — the single
 * implementation behind GET /admin/inventory/ledger.
 */
import { and, count, desc, eq, sql, type SQL } from "drizzle-orm";
import { db as defaultDb } from "../db/client";
import { orders, productBatches, products, stockHistoryLogs, users } from "../db/schema/tables";
import { env } from "../env";
import { pageOffset } from "../lib/http";
import type { StockHistoryReason, UserRole } from "../types";
import { type DbExecutor, queryAll } from "./db-executor";
import { toIso } from "./service-utils";

export interface LedgerFilters {
  page: number;
  limit: number;
  productId?: string;
  batchId?: string;
  orderId?: string;
  reason?: StockHistoryReason;
  /**
   * Inclusive lower bound. `YYYY-MM-DD` = start of that day in the business
   * time zone; any other value is an ISO-8601 instant.
   */
  from?: string;
  /** Inclusive upper bound. `YYYY-MM-DD` = end of that day in the business time zone. */
  to?: string;
}

export interface LedgerEntryDTO {
  id: string;
  productId: string;
  productTitle: string;
  sku: string;
  batchId: string | null;
  batchNumber: string | null;
  expiryDate: string | null;
  orderId: string | null;
  orderNumber: string | null;
  changeDelta: number;
  balanceAfter: number;
  reason: StockHistoryReason;
  note: string | null;
  performedBy: { id: string; fullName: string; role: UserRole } | null;
  createdAt: string;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function lowerBound(value: string): SQL {
  return DATE_ONLY.test(value)
    ? sql`${stockHistoryLogs.createdAt} >= (${value}::date::timestamp AT TIME ZONE ${env.APP_TIMEZONE})`
    : sql`${stockHistoryLogs.createdAt} >= ${new Date(value)}`;
}

function upperBound(value: string): SQL {
  return DATE_ONLY.test(value)
    ? sql`${stockHistoryLogs.createdAt} < ((${value}::date + 1)::timestamp AT TIME ZONE ${env.APP_TIMEZONE})`
    : sql`${stockHistoryLogs.createdAt} <= ${new Date(value)}`;
}

export class AuditService {
  async getStockLedger(
    filters: LedgerFilters,
    db: DbExecutor = defaultDb,
  ): Promise<{ items: LedgerEntryDTO[]; total: number }> {
    const conditions: SQL[] = [];
    if (filters.productId) conditions.push(eq(stockHistoryLogs.productId, filters.productId));
    if (filters.batchId) conditions.push(eq(stockHistoryLogs.batchId, filters.batchId));
    if (filters.orderId) conditions.push(eq(stockHistoryLogs.orderId, filters.orderId));
    if (filters.reason) conditions.push(eq(stockHistoryLogs.reason, filters.reason));
    if (filters.from) conditions.push(lowerBound(filters.from));
    if (filters.to) conditions.push(upperBound(filters.to));
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, totals] = await queryAll(
      db,
      () =>
        db
        .select({
          id: stockHistoryLogs.id,
          productId: stockHistoryLogs.productId,
          productTitle: products.title,
          sku: products.sku,
          batchId: stockHistoryLogs.batchId,
          batchNumber: productBatches.batchNumber,
          expiryDate: productBatches.expiryDate,
          orderId: stockHistoryLogs.orderId,
          orderNumber: orders.orderNumber,
          changeDelta: stockHistoryLogs.changeDelta,
          balanceAfter: stockHistoryLogs.balanceAfter,
          reason: stockHistoryLogs.reason,
          note: stockHistoryLogs.note,
          performerId: users.id,
          performerName: users.fullName,
          performerRole: users.role,
          createdAt: stockHistoryLogs.createdAt,
        })
        .from(stockHistoryLogs)
        .innerJoin(products, eq(stockHistoryLogs.productId, products.id))
        .leftJoin(productBatches, eq(stockHistoryLogs.batchId, productBatches.id))
        .leftJoin(orders, eq(stockHistoryLogs.orderId, orders.id))
        .leftJoin(users, eq(stockHistoryLogs.performedByUserId, users.id))
        .where(where)
        .orderBy(desc(stockHistoryLogs.createdAt), desc(stockHistoryLogs.id))
        .limit(filters.limit)
        .offset(pageOffset(filters.page, filters.limit)),
      () => db.select({ total: count() }).from(stockHistoryLogs).where(where),
    );

    return {
      items: rows.map((row) => ({
        id: row.id,
        productId: row.productId,
        productTitle: row.productTitle,
        sku: row.sku,
        batchId: row.batchId,
        batchNumber: row.batchNumber,
        expiryDate: row.expiryDate,
        orderId: row.orderId,
        orderNumber: row.orderNumber,
        changeDelta: row.changeDelta,
        balanceAfter: row.balanceAfter,
        reason: row.reason,
        note: row.note,
        performedBy:
          row.performerId !== null && row.performerName !== null && row.performerRole !== null
            ? { id: row.performerId, fullName: row.performerName, role: row.performerRole }
            : null,
        createdAt: toIso(row.createdAt),
      })),
      total: Number(totals[0]?.total ?? 0),
    };
  }
}

export const auditService = new AuditService();
