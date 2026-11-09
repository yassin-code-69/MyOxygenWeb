/**
 * Nightly expiry scan (02:00 in env.APP_TIMEZONE, Asia/Dhaka by default).
 *
 * Every batch with expiry_date <= today (business calendar) that still holds
 * stock is zeroed with an EXPIRED_SCRAP ledger row (performed_by NULL =
 * system). Products whose sellable stock drops to 0 are auto-deactivated and
 * the public catalog cache is invalidated.
 *
 * Safety:
 * - one transaction per scan, rows locked in the global lock order
 *   (products by id, then batches) so it cannot deadlock with checkouts;
 * - a transaction-scoped advisory lock lets only one scan run at a time across
 *   all API instances (a concurrent scan returns `skipped: true`);
 * - the cron task is registered under a fixed name in node-cron's global
 *   registry, so a hot reload / second `start()` replaces it instead of
 *   scheduling a duplicate.
 */
import cron from "node-cron";
import { and, asc, eq, gt, inArray, lte, sql, type SQL } from "drizzle-orm";
import { db as defaultDb } from "../db/client";
import { productBatches, products, stockHistoryLogs } from "../db/schema/tables";
import { env } from "../env";
import { todayInBusinessTz } from "../lib/dates";
import { invalidateCatalogCache } from "../middleware/cache";
import { type DbExecutor, isTransaction, runInTransaction } from "../services/db-executor";
import { syncProductAvailability } from "../services/inventory.service";

export const EXPIRY_SCAN_CRON = "0 2 * * *";
export const EXPIRY_SCAN_TASK_NAME = "my-oxygen:expiry-scan";
const SCAN_LOCK_KEY = "my-oxygen:expiry-scan";

export interface ExpiredBatchDetail {
  batchId: string;
  productId: string;
  batchNumber: string;
  expiryDate: string;
  unitsScrapped: number;
}

export interface ExpiryScanResult {
  /** Business date the scan used as "today" (YYYY-MM-DD). */
  businessDate: string;
  startedAt: string;
  durationMs: number;
  /** true when another scan held the lock; nothing was changed. */
  skipped: boolean;
  scrappedBatchCount: number;
  totalUnitsScrapped: number;
  deactivatedProductIds: string[];
  details: ExpiredBatchDetail[];
}

export interface ExpiryScanOptions {
  /** Business date override (YYYY-MM-DD); defaults to today in env.APP_TIMEZONE. */
  today?: string;
  /** Restrict the scan to these products (tests / targeted manual runs). */
  productIds?: readonly string[];
  db?: DbExecutor;
}

/** Runs one expiry scan now. Safe to call manually; see module docs. */
export async function runExpiryScan(options: ExpiryScanOptions = {}): Promise<ExpiryScanResult> {
  const db = options.db ?? defaultDb;
  const businessDate = options.today ?? todayInBusinessTz();
  const started = new Date();
  const ownsTransaction = !isTransaction(db);

  const outcome = await runInTransaction(db, async (tx) => {
    const lock = await tx.execute<{ acquired: boolean }>(
      sql`SELECT pg_try_advisory_xact_lock(hashtextextended(${SCAN_LOCK_KEY}, 0)) AS acquired`,
    );
    if (lock.rows[0]?.acquired !== true) {
      return { skipped: true, details: [] as ExpiredBatchDetail[], deactivated: [] as string[] };
    }

    const scope: SQL[] = [
      gt(productBatches.availableQuantity, 0),
      lte(productBatches.expiryDate, businessDate),
    ];
    if (options.productIds) {
      if (options.productIds.length === 0) {
        return { skipped: false, details: [] as ExpiredBatchDetail[], deactivated: [] as string[] };
      }
      scope.push(inArray(productBatches.productId, [...options.productIds]));
    }

    const candidates = await tx
      .selectDistinct({ productId: productBatches.productId })
      .from(productBatches)
      .where(and(...scope));
    if (candidates.length === 0) {
      return { skipped: false, details: [] as ExpiredBatchDetail[], deactivated: [] as string[] };
    }

    // Global lock order: products (ascending id) first, then their batches.
    await tx
      .select({ id: products.id })
      .from(products)
      .where(inArray(products.id, candidates.map((c) => c.productId)))
      .orderBy(asc(products.id))
      .for("no key update");

    const expired = await tx
      .select({
        id: productBatches.id,
        productId: productBatches.productId,
        batchNumber: productBatches.batchNumber,
        expiryDate: productBatches.expiryDate,
        availableQuantity: productBatches.availableQuantity,
      })
      .from(productBatches)
      .where(and(...scope))
      .orderBy(asc(productBatches.productId), asc(productBatches.expiryDate), asc(productBatches.id))
      .for("update");

    const details: ExpiredBatchDetail[] = [];
    for (const batch of expired) {
      const [updated] = await tx
        .update(productBatches)
        .set({ availableQuantity: 0 })
        .where(and(eq(productBatches.id, batch.id), gt(productBatches.availableQuantity, 0)))
        .returning({ id: productBatches.id });
      if (!updated) continue;
      details.push({
        batchId: batch.id,
        productId: batch.productId,
        batchNumber: batch.batchNumber,
        expiryDate: batch.expiryDate,
        unitsScrapped: batch.availableQuantity,
      });
    }

    if (details.length > 0) {
      await tx.insert(stockHistoryLogs).values(
        details.map((detail) => ({
          productId: detail.productId,
          batchId: detail.batchId,
          changeDelta: -detail.unitsScrapped,
          balanceAfter: 0,
          reason: "EXPIRED_SCRAP" as const,
          note: `Automated expiry scrap: batch expired on ${detail.expiryDate}`,
          performedByUserId: null,
        })),
      );
    }

    const changes = await syncProductAvailability(
      tx,
      details.map((d) => d.productId),
      businessDate,
    );
    return {
      skipped: false,
      details,
      deactivated: changes.filter((c) => !c.isActive).map((c) => c.productId),
    };
  });

  if (ownsTransaction && outcome.details.length > 0) {
    invalidateCatalogCache();
  }

  const result: ExpiryScanResult = {
    businessDate,
    startedAt: started.toISOString(),
    durationMs: Date.now() - started.getTime(),
    skipped: outcome.skipped,
    scrappedBatchCount: outcome.details.length,
    totalUnitsScrapped: outcome.details.reduce((sum, d) => sum + d.unitsScrapped, 0),
    deactivatedProductIds: outcome.deactivated,
    details: outcome.details,
  };

  console.log(
    JSON.stringify({
      level: "info",
      event: outcome.skipped ? "expiry_scan_skipped" : "expiry_scan_complete",
      businessDate: result.businessDate,
      timeZone: env.APP_TIMEZONE,
      scrappedBatchCount: result.scrappedBatchCount,
      totalUnitsScrapped: result.totalUnitsScrapped,
      deactivatedProductIds: result.deactivatedProductIds,
      durationMs: result.durationMs,
    }),
  );
  return result;
}

export class ExpiryScheduler {
  /** Registers the nightly cron task (replacing any task left by a previous module instance). */
  start(): void {
    const tasks = cron.getTasks();
    const previous = tasks.get(EXPIRY_SCAN_TASK_NAME);
    if (previous) {
      previous.stop();
      tasks.delete(EXPIRY_SCAN_TASK_NAME);
    }

    cron.schedule(
      EXPIRY_SCAN_CRON,
      () => {
        void this.runScheduled();
      },
      { timezone: env.APP_TIMEZONE, name: EXPIRY_SCAN_TASK_NAME },
    );

    console.log(
      JSON.stringify({
        level: "info",
        event: previous ? "expiry_scheduler_replaced" : "expiry_scheduler_started",
        cron: EXPIRY_SCAN_CRON,
        timeZone: env.APP_TIMEZONE,
      }),
    );
  }

  stop(): void {
    const tasks = cron.getTasks();
    const task = tasks.get(EXPIRY_SCAN_TASK_NAME);
    if (!task) return;
    task.stop();
    tasks.delete(EXPIRY_SCAN_TASK_NAME);
    console.log(JSON.stringify({ level: "info", event: "expiry_scheduler_stopped" }));
  }

  isScheduled(): boolean {
    return cron.getTasks().has(EXPIRY_SCAN_TASK_NAME);
  }

  /** Manual trigger (admin tooling, scripts, tests). */
  runScan(options?: ExpiryScanOptions): Promise<ExpiryScanResult> {
    return runExpiryScan(options);
  }

  private async runScheduled(): Promise<void> {
    try {
      await runExpiryScan();
    } catch (error) {
      console.error(
        JSON.stringify({
          level: "error",
          event: "expiry_scan_failed",
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        }),
      );
    }
  }
}

export const expiryScheduler = new ExpiryScheduler();
export const startExpiryScheduler = (): void => expiryScheduler.start();
export const stopExpiryScheduler = (): void => expiryScheduler.stop();
