import { and, count, desc, eq } from "drizzle-orm";
import { db as defaultDb } from "../db";
import {
  stockHistoryLogs,
  productBatches,
  products,
  users,
} from "../db/schema/tables";
import type { DatabaseClient } from "../db/client";

export type StockHistoryReason =
  | "IMPORT"
  | "PURCHASE"
  | "RETURN"
  | "MANUAL_ADJUSTMENT"
  | "EXPIRED_SCRAP"
  | "ADJUSTMENT";

export interface LedgerOptions {
  page?: number;
  limit?: number;
  productId?: string;
  batchId?: string;
  reason?: StockHistoryReason;
}

export interface LedgerEntry {
  id: string;
  productId: string;
  batchId: string | null;
  changeDelta: number;
  balanceAfter: number;
  reason: string;
  note: string | null;
  createdAt: Date;
  product?: {
    id: string;
    title: string;
    sku: string;
  } | null;
  batch: {
    batchNumber: string;
    expiryDate: string;
  } | null;
  performedBy: {
    id: string;
    fullName: string;
    role: string;
  } | null;
}

export interface LedgerPage {
  entries: LedgerEntry[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export class AuditService {
  /**
   * Returns a paginated stock audit ledger, joining batch metadata
   * and performer identity for each entry.
   */
  async getStockLedger(
    options: LedgerOptions,
    db: DatabaseClient = defaultDb,
  ): Promise<LedgerPage> {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.max(1, Math.min(100, options.limit ?? 20));
    const offset = (page - 1) * limit;

    const whereConditions = [];
    if (options.productId) {
      whereConditions.push(eq(stockHistoryLogs.productId, options.productId));
    }
    if (options.batchId) {
      whereConditions.push(eq(stockHistoryLogs.batchId, options.batchId));
    }
    if (options.reason) {
      const normalizedReason =
        options.reason === "ADJUSTMENT" ? "MANUAL_ADJUSTMENT" : options.reason;
      whereConditions.push(eq(stockHistoryLogs.reason, normalizedReason));
    }

    const where = whereConditions.length > 0 ? and(...whereConditions) : undefined;

    // Total count for pagination
    const [{ value: total }] = await db
      .select({ value: count() })
      .from(stockHistoryLogs)
      .where(where);

    const totalCount = Number(total ?? 0);

    // Paginated entries with joined relations
    const rawEntries = await db
      .select({
        id: stockHistoryLogs.id,
        productId: stockHistoryLogs.productId,
        batchId: stockHistoryLogs.batchId,
        changeDelta: stockHistoryLogs.changeDelta,
        balanceAfter: stockHistoryLogs.balanceAfter,
        reason: stockHistoryLogs.reason,
        note: stockHistoryLogs.note,
        createdAt: stockHistoryLogs.createdAt,
        // Product fields
        productTitle: products.title,
        productSku: products.sku,
        // Batch fields
        batchNumber: productBatches.batchNumber,
        expiryDate: productBatches.expiryDate,
        // Performer fields
        performedById: users.id,
        performedByFullName: users.fullName,
        performedByRole: users.role,
      })
      .from(stockHistoryLogs)
      .leftJoin(productBatches, eq(stockHistoryLogs.batchId, productBatches.id))
      .leftJoin(products, eq(stockHistoryLogs.productId, products.id))
      .leftJoin(users, eq(stockHistoryLogs.performedByUserId, users.id))
      .where(where)
      .orderBy(desc(stockHistoryLogs.createdAt))
      .limit(limit)
      .offset(offset);

    const entries: LedgerEntry[] = rawEntries.map((row) => ({
      id: row.id,
      productId: row.productId,
      batchId: row.batchId,
      changeDelta: row.changeDelta,
      balanceAfter: row.balanceAfter,
      reason: row.reason,
      note: row.note,
      createdAt: row.createdAt,
      product: row.productId
        ? {
            id: row.productId,
            title: row.productTitle ?? "Product",
            sku: row.productSku ?? "—",
          }
        : null,
      batch:
        row.batchNumber && row.expiryDate
          ? { batchNumber: row.batchNumber, expiryDate: row.expiryDate }
          : null,
      performedBy: row.performedById
        ? {
            id: row.performedById,
            fullName: row.performedByFullName ?? "",
            role: row.performedByRole ?? "",
          }
        : null,
    }));

    return {
      entries,
      total: totalCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit),
    };
  }
}

export const auditService = new AuditService();
