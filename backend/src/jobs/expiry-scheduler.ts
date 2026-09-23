import cron from "node-cron";
import { and, gt, sql } from "drizzle-orm";
import { db as defaultDb, productBatches, stockHistoryLogs } from "../db";
import type { DatabaseClient } from "../db/client";

export interface ExpiredBatchDetail {
  batchId: string;
  productId: string;
  batchNumber: string;
  expiryDate: string;
  unitsScrapped: number;
}

export interface ExpiryScanResult {
  scannedAt: string;
  scrappedBatchCount: number;
  totalUnitsScrapped: number;
  details: ExpiredBatchDetail[];
}

/**
 * Scans all product batches where:
 *   - expiryDate <= CURRENT_DATE (batch has expired)
 *   - availableQuantity > 0 (stock has not already been zeroed)
 *
 * For each expired batch:
 *   1. Zeroes out availableQuantity atomically
 *   2. Inserts an EXPIRED_SCRAP entry into stockHistoryLogs
 */
export async function runExpiryCheck(
  db: DatabaseClient = defaultDb,
): Promise<ExpiryScanResult> {
  // Format YYYY-MM-DD in Bangladesh Standard Time (UTC+6)
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const scannedAt = new Date().toISOString();

  // Phase 1: Collect expired batches with remaining available stock
  const expiredBatches = await db.query.productBatches.findMany({
    where: and(
      gt(productBatches.availableQuantity, 0),
      sql`${productBatches.expiryDate} <= ${today}`,
    ),
    columns: {
      id: true,
      productId: true,
      batchNumber: true,
      expiryDate: true,
      availableQuantity: true,
    },
  });

  if (expiredBatches.length === 0) {
    const result: ExpiryScanResult = {
      scannedAt,
      scrappedBatchCount: 0,
      totalUnitsScrapped: 0,
      details: [],
    };
    console.log(JSON.stringify({ event: "expiry_scan_complete", ...result }));
    return result;
  }

  const details: ExpiredBatchDetail[] = [];
  let totalUnitsScrapped = 0;

  // Phase 2: Zero out and ledger each expired batch inside a transaction
  await db.transaction(async (tx) => {
    for (const batch of expiredBatches) {
      const unitsScrapped = batch.availableQuantity;

      await tx
        .update(productBatches)
        .set({ availableQuantity: 0 })
        .where(sql`${productBatches.id} = ${batch.id}`);

      await tx.insert(stockHistoryLogs).values({
        productId: batch.productId,
        batchId: batch.id,
        changeDelta: -unitsScrapped,
        balanceAfter: 0,
        reason: "EXPIRED_SCRAP",
        note: `Automated expiry scrap — batch expired on ${batch.expiryDate}`,
        performedByUserId: null, // System-initiated action
      });

      details.push({
        batchId: batch.id,
        productId: batch.productId,
        batchNumber: batch.batchNumber,
        expiryDate: batch.expiryDate,
        unitsScrapped,
      });

      totalUnitsScrapped += unitsScrapped;
    }
  });

  const result: ExpiryScanResult = {
    scannedAt,
    scrappedBatchCount: expiredBatches.length,
    totalUnitsScrapped,
    details,
  };

  console.log(JSON.stringify({ event: "expiry_scan_complete", ...result }));
  return result;
}

export class ExpiryScheduler {
  private task: cron.ScheduledTask | null = null;

  /**
   * Registers the cron schedule.
   * Schedule: "0 2 * * *" fires nightly at 02:00.
   */
  start(): void {
    if (this.task) {
      console.warn("[ExpiryScheduler] Already running — ignoring duplicate start()");
      return;
    }

    this.task = cron.schedule("0 2 * * *", async () => {
      console.log("[ExpiryScheduler] Nightly expiry check triggered");
      try {
        await runExpiryCheck();
      } catch (err) {
        console.error(
          JSON.stringify({
            event: "expiry_scan_error",
            error: (err as Error).message,
            stack: (err as Error).stack,
          }),
        );
      }
    });

    console.log("[ExpiryScheduler] Scheduled — runs daily at 02:00");
  }

  /**
   * Gracefully stops the cron task.
   */
  stop(): void {
    if (this.task) {
      this.task.stop();
      this.task = null;
      console.log("[ExpiryScheduler] Stopped");
    }
  }

  /**
   * Direct trigger for programmatic invocation.
   */
  async runScan(db?: DatabaseClient): Promise<ExpiryScanResult> {
    return runExpiryCheck(db);
  }
}

export const expiryScheduler = new ExpiryScheduler();
export const startExpiryScheduler = () => expiryScheduler.start();
export const stopExpiryScheduler = () => expiryScheduler.stop();
