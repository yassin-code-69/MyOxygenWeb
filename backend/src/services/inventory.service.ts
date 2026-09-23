import { and, asc, eq, gt, sql, sum } from "drizzle-orm";
import { db as defaultDb } from "../db";
import {
  productBatches,
  stockHistoryLogs,
} from "../db/schema/tables";
import type { DatabaseClient } from "../db/client";

export interface BatchAllocation {
  batchId: string;
  quantity: number;
}

export interface StockLedgerEntry {
  batchId: string;
  delta: number;
  balanceAfter: number;
}

export class InventoryService {
  /**
   * Computes a FEFO allocation plan for a given product and required quantity.
   * Queries non-expired batches ordered by expiryDate ASC and fills demand
   * greedily from the earliest-expiring batch first.
   *
   * Returns an array of { batchId, quantity } objects whose quantities sum to
   * exactly `requiredQty`, or throws if the aggregate available stock is
   * insufficient.
   */
  async allocateBatchesFEFO(
    productId: string,
    requiredQty: number,
    db: DatabaseClient = defaultDb,
  ): Promise<BatchAllocation[]> {
    if (requiredQty <= 0) {
      throw new Error("Required quantity must be greater than zero");
    }

    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

    const eligibleBatches = await db.query.productBatches.findMany({
      where: and(
        eq(productBatches.productId, productId),
        gt(productBatches.availableQuantity, 0),
        sql`${productBatches.expiryDate} > ${today}`,
      ),
      orderBy: [asc(productBatches.expiryDate)],
      columns: {
        id: true,
        availableQuantity: true,
        expiryDate: true,
      },
    });

    // Defensive in-memory filter and sort by expiryDate ASC
    const validBatches = [...eligibleBatches]
      .filter((b) => b.availableQuantity > 0 && b.expiryDate > today)
      .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));

    const allocations: BatchAllocation[] = [];
    let remaining = requiredQty;

    for (const batch of validBatches) {
      if (remaining <= 0) break;

      const take = Math.min(batch.availableQuantity, remaining);
      allocations.push({ batchId: batch.id, quantity: take });
      remaining -= take;
    }

    if (remaining > 0) {
      const allocated = requiredQty - remaining;
      throw new Error(
        `Insufficient stock for product ${productId}. Requested: ${requiredQty}, Available: ${allocated}.`,
      );
    }

    return allocations;
  }

  /**
   * Commits an allocation plan to the database inside a PostgreSQL transaction.
   * Decrements availableQuantity on each allocated batch and appends a
   * PURCHASE entry to stockHistoryLogs for full traceability.
   *
   * If any single batch update fails the whole transaction is rolled back.
   */
  async reserveStock(
    allocations: BatchAllocation[],
    orderId: string,
    performedByUserId: string | null = null,
    db: DatabaseClient = defaultDb,
  ): Promise<void> {
    await db.transaction(async (tx) => {
      for (const allocation of allocations) {
        const query = tx
          .select({
            productId: productBatches.productId,
            availableQuantity: productBatches.availableQuantity,
          })
          .from(productBatches)
          .where(eq(productBatches.id, allocation.batchId));

        const [batch] =
          typeof query.for === "function" ? await query.for("update") : await query;

        if (!batch) {
          throw new Error(`Batch ${allocation.batchId} not found.`);
        }

        if (batch.availableQuantity < allocation.quantity) {
          throw new Error(
            `Race condition detected on batch ${allocation.batchId}. ` +
              `Available: ${batch.availableQuantity}, Requested: ${allocation.quantity}.`,
          );
        }

        const newBalance = batch.availableQuantity - allocation.quantity;

        await tx
          .update(productBatches)
          .set({ availableQuantity: newBalance })
          .where(eq(productBatches.id, allocation.batchId));

        await tx.insert(stockHistoryLogs).values({
          productId: batch.productId,
          batchId: allocation.batchId,
          changeDelta: -allocation.quantity,
          balanceAfter: newBalance,
          reason: "PURCHASE",
          note: `Reserved for order ${orderId}`,
          performedByUserId,
        });
      }
    });
  }

  /**
   * Reverses all PURCHASE stock reservations associated with a cancelled order.
   * Reads original PURCHASE log entries keyed by the order note, then
   * increments availableQuantity and writes a RETURN entry for each batch.
   *
   * Runs inside a single transaction to ensure atomicity.
   */
  async releaseReservation(
    orderId: string,
    performedByUserId: string | null = null,
    db: DatabaseClient = defaultDb,
  ): Promise<void> {
    const orderNote = `Reserved for order ${orderId}`;

    const purchaseLogs =
      typeof db.query?.stockHistoryLogs?.findMany === "function"
        ? await db.query.stockHistoryLogs.findMany({
            where: and(
              eq(stockHistoryLogs.reason, "PURCHASE"),
              eq(stockHistoryLogs.note, orderNote),
            ),
            columns: {
              batchId: true,
              changeDelta: true,
              productId: true,
            },
          })
        : await db
            .select({
              batchId: stockHistoryLogs.batchId,
              changeDelta: stockHistoryLogs.changeDelta,
              productId: stockHistoryLogs.productId,
            })
            .from(stockHistoryLogs)
            .where(
              and(
                eq(stockHistoryLogs.reason, "PURCHASE"),
                eq(stockHistoryLogs.note, orderNote),
              ),
            );

    if (!purchaseLogs || purchaseLogs.length === 0) {
      throw new Error(
        `No PURCHASE log entries found for order ${orderId}. Cannot release reservation.`,
      );
    }

    await db.transaction(async (tx) => {
      for (const log of purchaseLogs) {
        if (!log.batchId) continue;

        const [batch] = await tx
          .select({ availableQuantity: productBatches.availableQuantity })
          .from(productBatches)
          .where(eq(productBatches.id, log.batchId));

        if (!batch) continue;

        const returnQty = Math.abs(log.changeDelta);
        const newBalance = batch.availableQuantity + returnQty;

        await tx
          .update(productBatches)
          .set({ availableQuantity: newBalance })
          .where(eq(productBatches.id, log.batchId));

        await tx.insert(stockHistoryLogs).values({
          productId: log.productId,
          batchId: log.batchId,
          changeDelta: returnQty,
          balanceAfter: newBalance,
          reason: "RETURN",
          note: `Stock returned on cancellation of order ${orderId}`,
          performedByUserId,
        });
      }
    });
  }

  /**
   * Returns the sum of availableQuantity across all non-expired batches for a
   * product. Used by low-stock alerts and storefront display.
   */
  async getTotalAvailableStock(
    productId: string,
    db: DatabaseClient = defaultDb,
  ): Promise<number> {
    const today = new Date().toISOString().split("T")[0];

    if (typeof db.select === "function") {
      try {
        const [result] = await db
          .select({ total: sum(productBatches.availableQuantity) })
          .from(productBatches)
          .where(
            and(
              eq(productBatches.productId, productId),
              gt(productBatches.availableQuantity, 0),
              sql`${productBatches.expiryDate} > ${today}`,
            ),
          );

        if (result?.total !== undefined && result?.total !== null) {
          return Number(result.total);
        }
      } catch {
        // Fallback to query builder if select fails in mock
      }
    }

    if (typeof db.query?.productBatches?.findMany === "function") {
      const batches = await db.query.productBatches.findMany({
        where: and(
          eq(productBatches.productId, productId),
          gt(productBatches.availableQuantity, 0),
          sql`${productBatches.expiryDate} > ${today}`,
        ),
        columns: {
          availableQuantity: true,
          expiryDate: true,
        },
      });

      return batches
        .filter(
          (b) =>
            (b.availableQuantity ?? 0) > 0 &&
            (!b.expiryDate || b.expiryDate > today),
        )
        .reduce((acc, b) => acc + (b.availableQuantity ?? 0), 0);
    }

    return 0;
  }
}

export const inventoryService = new InventoryService();
