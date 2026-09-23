import { and, asc, count, desc, eq, sql, type SQL } from "drizzle-orm";
import { db as defaultDb } from "../db";
import {
  products,
  productBatches,
  stockHistoryLogs,
  users,
} from "../db/schema/tables";
import type { DatabaseClient } from "../db/client";

export type BatchHealthStatus = "EXPIRED" | "EXPIRING_SOON" | "HEALTHY";

export interface BatchInspectionItem {
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
  createdAt: Date;
  product: {
    id: string;
    title: string;
    sku: string;
  };
}

export interface GetAllBatchesOptions {
  productId?: string;
  healthStatus?: BatchHealthStatus;
  referenceDate?: Date;
}

export interface AuditLedgerParams {
  page?: number;
  limit?: number;
  reason?: string;
  productId?: string;
  batchId?: string;
}

export interface AuditLedgerEntry {
  id: string;
  productId: string;
  productTitle: string;
  sku: string;
  batchId: string | null;
  batchNumber: string | null;
  expiryDate: string | null;
  changeDelta: number;
  balanceAfter: number;
  reason: string;
  note: string | null;
  performedByUserId: string | null;
  performedBy: {
    id: string;
    fullName: string;
    role: string;
  } | null;
  createdAt: Date;
  product: {
    id: string;
    title: string;
    sku: string;
  };
  batch: {
    id: string;
    batchNumber: string;
    expiryDate: string;
  } | null;
}

export interface AuditLedgerPage {
  entries: AuditLedgerEntry[];
  data: AuditLedgerEntry[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ImportBatchInput {
  productId: string;
  batchNumber: string;
  manufactureDate?: string | null;
  expiryDate: string;
  initialQuantity: number;
  performedByUserId?: string | null;
}

/**
 * Calculates daysUntilExpiry and healthStatus for a perishable batch.
 * - EXPIRED if expiryDate <= today
 * - EXPIRING_SOON if daysUntilExpiry <= 30 and availableQuantity > 0
 * - HEALTHY otherwise
 */
export function calculateBatchHealth(
  expiryDate: string | Date,
  availableQuantity: number,
  referenceDate: Date = new Date(),
): {
  daysUntilExpiry: number;
  healthStatus: BatchHealthStatus;
} {
  const todayStr = referenceDate.toISOString().split("T")[0];
  const [todayY, todayM, todayD] = todayStr.split("-").map(Number);
  const todayUtc = Date.UTC(todayY, todayM - 1, todayD);

  const expDateStr =
    typeof expiryDate === "string"
      ? expiryDate
      : expiryDate.toISOString().split("T")[0];
  const [expY, expM, expD] = expDateStr.split("-").map(Number);
  const expUtc = Date.UTC(expY, expM - 1, expD);

  const diffMs = expUtc - todayUtc;
  const daysUntilExpiry = Math.round(diffMs / (1000 * 60 * 60 * 24));

  let healthStatus: BatchHealthStatus;
  if (expDateStr <= todayStr || daysUntilExpiry <= 0) {
    healthStatus = "EXPIRED";
  } else if (daysUntilExpiry <= 30 && availableQuantity > 0) {
    healthStatus = "EXPIRING_SOON";
  } else {
    healthStatus = "HEALTHY";
  }

  return { daysUntilExpiry, healthStatus };
}

export class BatchInspectorService {
  /**
   * Queries productBatches joined with products.
   * Calculates daysUntilExpiry and healthStatus for FEFO inspection.
   * Returns batch list with product title, SKU, batchNumber, dates, quantities, and healthStatus.
   */
  async getAllBatchesWithStatus(
    options?: GetAllBatchesOptions,
    dbClient: DatabaseClient = defaultDb,
  ): Promise<BatchInspectionItem[]> {
    const whereConditions: SQL[] = [];

    if (options?.productId) {
      whereConditions.push(eq(productBatches.productId, options.productId));
    }

    const where =
      whereConditions.length > 0 ? and(...whereConditions) : undefined;

    const rows = await dbClient
      .select({
        id: productBatches.id,
        productId: productBatches.productId,
        batchNumber: productBatches.batchNumber,
        manufactureDate: productBatches.manufactureDate,
        expiryDate: productBatches.expiryDate,
        initialQuantity: productBatches.initialQuantity,
        availableQuantity: productBatches.availableQuantity,
        createdAt: productBatches.createdAt,
        productTitle: products.title,
        productSku: products.sku,
      })
      .from(productBatches)
      .innerJoin(products, eq(productBatches.productId, products.id))
      .where(where)
      .orderBy(asc(productBatches.expiryDate));

    const items: BatchInspectionItem[] = rows.map((row) => {
      const { daysUntilExpiry, healthStatus } = calculateBatchHealth(
        row.expiryDate,
        row.availableQuantity,
        options?.referenceDate,
      );

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
        daysUntilExpiry,
        healthStatus,
        createdAt: row.createdAt,
        product: {
          id: row.productId,
          title: row.productTitle,
          sku: row.productSku,
        },
      };
    });

    if (options?.healthStatus) {
      return items.filter((item) => item.healthStatus === options.healthStatus);
    }

    return items;
  }

  /**
   * Queries stockHistoryLogs joined with products, productBatches, and users.
   * Supports filtering by reason (IMPORT, PURCHASE, RETURN, EXPIRED_SCRAP, ADJUSTMENT) and productId.
   * Paginated with total count.
   */
  async getAuditLedger(
    params: AuditLedgerParams = {},
    dbClient: DatabaseClient = defaultDb,
  ): Promise<AuditLedgerPage> {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.max(1, Math.min(100, params.limit ?? 20));
    const offset = (page - 1) * limit;

    const whereConditions: SQL[] = [];

    if (params.productId) {
      whereConditions.push(eq(stockHistoryLogs.productId, params.productId));
    }

    if (params.batchId) {
      whereConditions.push(eq(stockHistoryLogs.batchId, params.batchId));
    }

    if (params.reason) {
      const normalizedReason =
        params.reason === "ADJUSTMENT" ? "MANUAL_ADJUSTMENT" : params.reason;
      const validReasons = [
        "IMPORT",
        "PURCHASE",
        "RETURN",
        "MANUAL_ADJUSTMENT",
        "EXPIRED_SCRAP",
      ];
      if (validReasons.includes(normalizedReason)) {
        whereConditions.push(
          eq(stockHistoryLogs.reason, normalizedReason as any),
        );
      } else {
        whereConditions.push(sql`1 = 0`);
      }
    }

    const where =
      whereConditions.length > 0 ? and(...whereConditions) : undefined;

    const [{ value: total }] = await dbClient
      .select({ value: count() })
      .from(stockHistoryLogs)
      .where(where);

    const totalCount = Number(total ?? 0);

    const rawEntries = await dbClient
      .select({
        id: stockHistoryLogs.id,
        productId: stockHistoryLogs.productId,
        batchId: stockHistoryLogs.batchId,
        changeDelta: stockHistoryLogs.changeDelta,
        balanceAfter: stockHistoryLogs.balanceAfter,
        reason: stockHistoryLogs.reason,
        note: stockHistoryLogs.note,
        performedByUserId: stockHistoryLogs.performedByUserId,
        createdAt: stockHistoryLogs.createdAt,
        productTitle: products.title,
        productSku: products.sku,
        batchNumber: productBatches.batchNumber,
        batchExpiryDate: productBatches.expiryDate,
        performerFullName: users.fullName,
        performerRole: users.role,
      })
      .from(stockHistoryLogs)
      .innerJoin(products, eq(stockHistoryLogs.productId, products.id))
      .leftJoin(productBatches, eq(stockHistoryLogs.batchId, productBatches.id))
      .leftJoin(users, eq(stockHistoryLogs.performedByUserId, users.id))
      .where(where)
      .orderBy(desc(stockHistoryLogs.createdAt))
      .limit(limit)
      .offset(offset);

    const entries: AuditLedgerEntry[] = rawEntries.map((row) => ({
      id: row.id,
      productId: row.productId,
      productTitle: row.productTitle,
      sku: row.productSku,
      batchId: row.batchId,
      batchNumber: row.batchNumber ?? null,
      expiryDate: row.batchExpiryDate ?? null,
      changeDelta: row.changeDelta,
      balanceAfter: row.balanceAfter,
      reason: row.reason,
      note: row.note,
      performedByUserId: row.performedByUserId,
      performedBy: row.performedByUserId
        ? {
            id: row.performedByUserId,
            fullName: row.performerFullName ?? "",
            role: row.performerRole ?? "",
          }
        : null,
      createdAt: row.createdAt,
      product: {
        id: row.productId,
        title: row.productTitle,
        sku: row.productSku,
      },
      batch:
        row.batchId && row.batchNumber
          ? {
              id: row.batchId,
              batchNumber: row.batchNumber,
              expiryDate: row.batchExpiryDate ?? "",
            }
          : null,
    }));

    return {
      entries,
      data: entries,
      total: totalCount,
      page,
      limit,
      totalPages: Math.ceil(totalCount / limit),
    };
  }

  /**
   * Imports a new product batch, ensuring uniqueness and inserting an audit ledger entry.
   */
  async importBatch(
    data: ImportBatchInput,
    dbClient: DatabaseClient = defaultDb,
  ) {
    const product = await dbClient.query.products.findFirst({
      where: eq(products.id, data.productId),
      columns: { id: true, title: true, sku: true },
    });

    if (!product) {
      throw new Error(`Product ${data.productId} not found`);
    }

    const existingBatch = await dbClient.query.productBatches.findFirst({
      where: and(
        eq(productBatches.productId, data.productId),
        eq(productBatches.batchNumber, data.batchNumber),
      ),
    });

    if (existingBatch) {
      throw new Error(
        `Batch number "${data.batchNumber}" already exists for this product`,
      );
    }

    const [newBatch] = await dbClient
      .insert(productBatches)
      .values({
        productId: data.productId,
        batchNumber: data.batchNumber,
        manufactureDate: data.manufactureDate ?? null,
        expiryDate: data.expiryDate,
        initialQuantity: data.initialQuantity,
        availableQuantity: data.initialQuantity,
      })
      .returning();

    await dbClient.insert(stockHistoryLogs).values({
      productId: data.productId,
      batchId: newBatch.id,
      changeDelta: data.initialQuantity,
      balanceAfter: data.initialQuantity,
      reason: "IMPORT",
      note: `Batch ${data.batchNumber} imported`,
      performedByUserId: data.performedByUserId ?? null,
    });

    return newBatch;
  }
}

export const batchInspectorService = new BatchInspectorService();
export const getAllBatchesWithStatus = (
  options?: GetAllBatchesOptions,
  dbClient?: DatabaseClient,
) => batchInspectorService.getAllBatchesWithStatus(options, dbClient);
export const getAuditLedger = (
  params?: AuditLedgerParams,
  dbClient?: DatabaseClient,
) => batchInspectorService.getAuditLedger(params, dbClient);
export const importBatch = (
  data: ImportBatchInput,
  dbClient?: DatabaseClient,
) => batchInspectorService.importBatch(data, dbClient);
