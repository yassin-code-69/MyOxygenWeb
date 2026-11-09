/**
 * Inventory engine integration tests — real local test database, no mocks.
 * Fixtures are run-unique and removed in afterAll (shared DB, never truncated).
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import cron from "node-cron";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { productBatches, products, stockHistoryLogs } from "../db/schema/tables";
import { EXPIRY_SCAN_TASK_NAME, ExpiryScheduler, runExpiryScan } from "../jobs/expiry-scheduler";
import { addDays, businessDate, todayInBusinessTz } from "../lib/dates";
import { AppError } from "../lib/errors";
import { importBatchSchema, stockAdjustmentSchema, stockLedgerQuerySchema } from "../routes/inventory.schema";
import { FixtureRegistry, type TestUser } from "../tests/inventory-fixtures";
import { inventoryService } from "./inventory.service";
import { productService } from "./product.service";

const fixtures = new FixtureRegistry();
const today = todayInBusinessTz();

let staff: TestUser;
let categoryId: string;

class Rollback extends Error {}

async function captureAppError(work: () => Promise<unknown>): Promise<AppError> {
  try {
    await work();
  } catch (error) {
    if (error instanceof AppError) return error;
    throw error;
  }
  throw new Error("Expected an AppError to be thrown");
}

async function productState(productId: string) {
  const [row] = await db
    .select({ isActive: products.isActive, autoDeactivatedAt: products.autoDeactivatedAt })
    .from(products)
    .where(eq(products.id, productId));
  if (!row) throw new Error("product not found");
  return row;
}

async function batchQuantity(batchId: string): Promise<number> {
  const [row] = await db
    .select({ availableQuantity: productBatches.availableQuantity })
    .from(productBatches)
    .where(eq(productBatches.id, batchId));
  if (!row) throw new Error("batch not found");
  return row.availableQuantity;
}

async function ledger(productId: string, reason: "PURCHASE" | "RETURN" | "IMPORT" | "EXPIRED_SCRAP" | "MANUAL_ADJUSTMENT") {
  return db
    .select()
    .from(stockHistoryLogs)
    .where(and(eq(stockHistoryLogs.productId, productId), eq(stockHistoryLogs.reason, reason)));
}

beforeAll(async () => {
  staff = await fixtures.user("INVENTORY_MANAGER");
  categoryId = (await fixtures.category("Inventory Tests")).id;
});

afterAll(async () => {
  await fixtures.cleanup();
});

describe("FEFO allocation", () => {
  it("allocates the earliest-expiring sellable batches first and spills into the next one", async () => {
    const product = await fixtures.product({ categoryId });
    await fixtures.batch(product.id, today, 50); // expires today → not sellable
    await fixtures.batch(product.id, addDays(today, 10), 0); // empty
    const first = await fixtures.batch(product.id, addDays(today, 20), 3);
    const second = await fixtures.batch(product.id, addDays(today, 40), 5);

    const allocations = await inventoryService.allocateBatchesFEFO(product.id, 5);

    expect(allocations.map((a) => [a.batchId, a.quantity])).toEqual([
      [first.id, 3],
      [second.id, 2],
    ]);
    expect(allocations[0]?.expiryDate).toBe(addDays(today, 20));
  });

  it("throws INSUFFICIENT_STOCK with { productId, requested, available }", async () => {
    const product = await fixtures.product({ categoryId });
    await fixtures.batch(product.id, addDays(today, 30), 4);
    await fixtures.batch(product.id, addDays(today, 60), 4);

    const error = await captureAppError(() => inventoryService.allocateBatchesFEFO(product.id, 9));
    expect(error.code).toBe("INSUFFICIENT_STOCK");
    expect(error.httpStatus).toBe(409);
    expect(error.details).toEqual({ productId: product.id, requested: 9, available: 8 });
  });

  it("validates its input and reports unknown products", async () => {
    const product = await fixtures.product({ categoryId });
    expect((await captureAppError(() => inventoryService.allocateBatchesFEFO(product.id, 0))).code).toBe(
      "VALIDATION_ERROR",
    );
    expect((await captureAppError(() => inventoryService.allocateBatchesFEFO(product.id, 1.5))).code).toBe(
      "VALIDATION_ERROR",
    );
    const missing = await captureAppError(() =>
      inventoryService.allocateBatchesFEFO("00000000-0000-4000-8000-000000000000", 1),
    );
    expect(missing.code).toBe("NOT_FOUND");
  });
});

describe("reserveStock / releaseReservation", () => {
  it("runs inside the caller's transaction: rolled back together with it", async () => {
    const product = await fixtures.product({ categoryId });
    const batch = await fixtures.batch(product.id, addDays(today, 30), 5);
    const orderId = await fixtures.order(staff.id);

    await expect(
      db.transaction(async (tx) => {
        const allocations = await inventoryService.allocateBatchesFEFO(product.id, 2, tx);
        await inventoryService.reserveStock(allocations, orderId, staff.id, tx);
        throw new Rollback();
      }),
    ).rejects.toBeInstanceOf(Rollback);

    expect(await batchQuantity(batch.id)).toBe(5);
    expect(await ledger(product.id, "PURCHASE")).toHaveLength(0);
  });

  it("links PURCHASE rows to the order and leaves no partial writes when a later batch fails", async () => {
    const product = await fixtures.product({ categoryId });
    const a = await fixtures.batch(product.id, addDays(today, 30), 5);
    const b = await fixtures.batch(product.id, addDays(today, 60), 2);
    const orderId = await fixtures.order(staff.id);

    const failure = await captureAppError(() =>
      inventoryService.reserveStock(
        [
          { batchId: a.id, quantity: 1 },
          { batchId: b.id, quantity: 3 },
        ],
        orderId,
        staff.id,
      ),
    );
    expect(failure.code).toBe("INSUFFICIENT_STOCK");
    expect(failure.details).toMatchObject({ batchId: b.id, requested: 3, available: 2 });
    expect(await batchQuantity(a.id)).toBe(5);

    const result = await inventoryService.reserveStock([{ batchId: a.id, quantity: 2 }], orderId, staff.id);
    expect(result.reservedUnits).toBe(2);
    const purchases = await ledger(product.id, "PURCHASE");
    expect(purchases).toHaveLength(1);
    expect(purchases[0]).toMatchObject({ orderId, batchId: a.id, changeDelta: -2, balanceAfter: 3 });
    expect(purchases[0]?.performedByUserId).toBe(staff.id);
  });

  it("auto-deactivates at zero stock, re-activates on release, and release is idempotent", async () => {
    const product = await fixtures.product({ categoryId });
    const batch = await fixtures.batch(product.id, addDays(today, 30), 3);
    const orderId = await fixtures.order(staff.id);

    await db.transaction(async (tx) => {
      const allocations = await inventoryService.allocateBatchesFEFO(product.id, 3, tx);
      const reservation = await inventoryService.reserveStock(allocations, orderId, staff.id, tx);
      expect(reservation.availabilityChanges).toEqual([
        { productId: product.id, isActive: false, change: "AUTO_DEACTIVATED" },
      ]);
    });
    const hidden = await productState(product.id);
    expect(hidden.isActive).toBe(false);
    expect(hidden.autoDeactivatedAt).not.toBeNull();

    const first = await inventoryService.releaseReservation(orderId, staff.id);
    expect(first).toMatchObject({ restoredUnits: 3, alreadyReleased: false, skippedUnits: 0 });
    expect(await batchQuantity(batch.id)).toBe(3);
    const visible = await productState(product.id);
    expect(visible.isActive).toBe(true);
    expect(visible.autoDeactivatedAt).toBeNull();

    const second = await inventoryService.releaseReservation(orderId, staff.id);
    expect(second).toMatchObject({ restoredUnits: 0, alreadyReleased: true });
    expect(await batchQuantity(batch.id)).toBe(3);
    const returns = await ledger(product.id, "RETURN");
    expect(returns).toHaveLength(1);
    expect(returns[0]).toMatchObject({ orderId, changeDelta: 3, balanceAfter: 3 });
  });

  it("serializes concurrent releases of the same order (restocks once)", async () => {
    const product = await fixtures.product({ categoryId });
    const batch = await fixtures.batch(product.id, addDays(today, 30), 10);
    const orderId = await fixtures.order(staff.id);
    await inventoryService.reserveStock([{ batchId: batch.id, quantity: 4 }], orderId, staff.id);

    const results = await Promise.all(
      Array.from({ length: 5 }, () => inventoryService.releaseReservation(orderId, staff.id)),
    );
    expect(results.filter((r) => !r.alreadyReleased)).toHaveLength(1);
    expect(await batchQuantity(batch.id)).toBe(10);
  });
});

describe("batch import, adjustments and auto-(de)activation", () => {
  it("re-activates an auto-deactivated product when a batch is imported", async () => {
    const product = await fixtures.product({ categoryId });
    const batch = await fixtures.batch(product.id, addDays(today, 30), 2);
    const drained = await inventoryService.adjustStock(
      { productId: product.id, batchId: batch.id, delta: -2, reason: "MANUAL_ADJUSTMENT", note: "count" },
      staff.id,
    );
    expect(drained.product.listingStatus).toBe("AWAITING_STOCK");
    expect(drained.newQuantity).toBe(0);

    const imported = await inventoryService.importBatch(
      { productId: product.id, batchNumber: "RESTOCK-1", expiryDate: addDays(today, 90), initialQuantity: 12 },
      staff.id,
    );
    expect(imported.product).toMatchObject({ isActive: true, listingStatus: "ACTIVE", totalStock: 12 });
    expect(imported.batch).toMatchObject({ batchNumber: "RESTOCK-1", availableQuantity: 12, healthStatus: "HEALTHY" });
    const imports = await ledger(product.id, "IMPORT");
    expect(imports).toHaveLength(1);
    expect(imports[0]).toMatchObject({ changeDelta: 12, balanceAfter: 12, performedByUserId: staff.id });
  });

  it("never re-activates a product the owner deactivated manually", async () => {
    const product = await fixtures.product({ categoryId });
    await fixtures.batch(product.id, addDays(today, 30), 0);
    // Zero stock + manual deactivation (also converts an auto-hidden product).
    await productService.deactivateProduct(product.id);

    const imported = await inventoryService.importBatch(
      { productId: product.id, batchNumber: "AFTER-MANUAL", expiryDate: addDays(today, 60), initialQuantity: 5 },
      staff.id,
    );
    expect(imported.product).toMatchObject({ isActive: false, listingStatus: "INACTIVE", totalStock: 5 });
  });

  it("rejects adjustments below zero, additions to expired batches and duplicate batch numbers", async () => {
    const product = await fixtures.product({ categoryId });
    const live = await fixtures.batch(product.id, addDays(today, 30), 3, "LIVE-1");
    const expired = await fixtures.batch(product.id, addDays(today, -1), 2);

    const negative = await captureAppError(() =>
      inventoryService.adjustStock(
        { productId: product.id, batchId: live.id, delta: -4, reason: "MANUAL_ADJUSTMENT" },
        staff.id,
      ),
    );
    expect(negative.code).toBe("INSUFFICIENT_STOCK");
    expect(negative.details).toMatchObject({ available: 3, delta: -4 });
    expect(await batchQuantity(live.id)).toBe(3);

    const toExpired = await captureAppError(() =>
      inventoryService.adjustStock(
        { productId: product.id, batchId: expired.id, delta: 1, reason: "MANUAL_ADJUSTMENT" },
        staff.id,
      ),
    );
    expect(toExpired.code).toBe("VALIDATION_ERROR");

    const duplicate = await captureAppError(() =>
      inventoryService.importBatch(
        { productId: product.id, batchNumber: "LIVE-1", expiryDate: addDays(today, 30), initialQuantity: 1 },
        staff.id,
      ),
    );
    expect(duplicate.code).toBe("CONFLICT");

    const pastExpiry = await captureAppError(() =>
      inventoryService.importBatch(
        { productId: product.id, batchNumber: "OLD-1", expiryDate: today, initialQuantity: 1 },
        staff.id,
      ),
    );
    expect(pastExpiry.code).toBe("VALIDATION_ERROR");
  });

  it("reports low stock including auto-hidden products", async () => {
    const product = await fixtures.product({ categoryId, lowStockThreshold: 1_000_000 });
    await fixtures.batch(product.id, addDays(today, 30), 4);
    const { items } = await inventoryService.listLowStock({ page: 1, limit: 100 });
    const match = items.find((item) => item.productId === product.id);
    expect(match).toMatchObject({ totalStock: 4, isOutOfStock: false, listingStatus: "ACTIVE" });
  });
});

describe("expiry scan (business time zone)", () => {
  it("uses the business calendar, not UTC, around midnight in Asia/Dhaka", () => {
    // 18:00 UTC is 00:00 the next day in Dhaka (UTC+6).
    expect(businessDate(new Date("2026-03-01T17:59:59Z"), "Asia/Dhaka")).toBe("2026-03-01");
    expect(businessDate(new Date("2026-03-01T18:00:00Z"), "Asia/Dhaka")).toBe("2026-03-02");
    expect(new Date("2026-03-01T18:00:00Z").toISOString().slice(0, 10)).toBe("2026-03-01");
  });

  it("scraps batches expiring on or before the business date and deactivates emptied products", async () => {
    const mixed = await fixtures.product({ categoryId });
    const expiresToday = await fixtures.batch(mixed.id, today, 4);
    const expiresTomorrow = await fixtures.batch(mixed.id, addDays(today, 1), 2);
    const onlyExpired = await fixtures.product({ categoryId });
    const stale = await fixtures.batch(onlyExpired.id, addDays(today, -3), 6);

    const result = await runExpiryScan({ productIds: [mixed.id, onlyExpired.id] });
    expect(result.skipped).toBe(false);
    expect(result.businessDate).toBe(today);
    expect(result.scrappedBatchCount).toBe(2);
    expect(result.totalUnitsScrapped).toBe(10);
    expect(result.deactivatedProductIds).toEqual([onlyExpired.id]);

    expect(await batchQuantity(expiresToday.id)).toBe(0);
    expect(await batchQuantity(expiresTomorrow.id)).toBe(2);
    expect(await batchQuantity(stale.id)).toBe(0);
    expect((await productState(mixed.id)).isActive).toBe(true);
    expect((await productState(onlyExpired.id)).isActive).toBe(false);

    const scraps = await ledger(mixed.id, "EXPIRED_SCRAP");
    expect(scraps).toHaveLength(1);
    expect(scraps[0]).toMatchObject({ changeDelta: -4, balanceAfter: 0, performedByUserId: null });

    // Next business day: the remaining batch expires too.
    const nextDay = await runExpiryScan({ productIds: [mixed.id], today: addDays(today, 1) });
    expect(nextDay.totalUnitsScrapped).toBe(2);
    expect(nextDay.deactivatedProductIds).toEqual([mixed.id]);

    const rerun = await runExpiryScan({ productIds: [mixed.id, onlyExpired.id] });
    expect(rerun.scrappedBatchCount).toBe(0);
  });

  it("registers the nightly task once even when started repeatedly (hot reload)", () => {
    const scheduler = new ExpiryScheduler();
    scheduler.start();
    scheduler.start();
    const registered = [...cron.getTasks().keys()].filter((name) => name === EXPIRY_SCAN_TASK_NAME);
    expect(registered).toHaveLength(1);
    expect(scheduler.isScheduled()).toBe(true);
    scheduler.stop();
    expect(scheduler.isScheduled()).toBe(false);
  });
});

describe("inventory request schemas", () => {
  const productId = "3f1c2b8e-7a4d-4e2b-9c1a-2b3c4d5e6f70";

  it("accepts a valid future batch and rejects expired / inconsistent dates", () => {
    expect(
      importBatchSchema.safeParse({
        productId,
        batchNumber: "BATCH-2026-C",
        manufactureDate: addDays(today, -30),
        expiryDate: addDays(today, 365),
        initialQuantity: 75,
      }).success,
    ).toBe(true);

    const expired = importBatchSchema.safeParse({ productId, batchNumber: "B-1", expiryDate: today, initialQuantity: 1 });
    expect(expired.success).toBe(false);
    if (!expired.success) expect(expired.error.flatten().fieldErrors.expiryDate).toBeDefined();

    const invalidDate = importBatchSchema.safeParse({
      productId,
      batchNumber: "B-1",
      expiryDate: "2099-02-30",
      initialQuantity: 1,
    });
    expect(invalidDate.success).toBe(false);

    const inverted = importBatchSchema.safeParse({
      productId,
      batchNumber: "B-1",
      manufactureDate: addDays(today, -1),
      expiryDate: addDays(today, -2),
      initialQuantity: 1,
    });
    expect(inverted.success).toBe(false);

    expect(
      importBatchSchema.safeParse({ productId, batchNumber: "B-1", expiryDate: addDays(today, 9), initialQuantity: 0 })
        .success,
    ).toBe(false);
    expect(
      importBatchSchema.safeParse({ productId: "nope", batchNumber: "B-1", expiryDate: addDays(today, 9), initialQuantity: 1 })
        .success,
    ).toBe(false);
  });

  it("validates stock adjustments", () => {
    const batchId = "4f1c2b8e-7a4d-4e2b-9c1a-2b3c4d5e6f71";
    const parsed = stockAdjustmentSchema.safeParse({ productId, batchId, delta: -3 });
    expect(parsed.success && parsed.data.reason).toBe("MANUAL_ADJUSTMENT");
    expect(stockAdjustmentSchema.safeParse({ productId, batchId, delta: 0 }).success).toBe(false);
    expect(stockAdjustmentSchema.safeParse({ productId, batchId, delta: 2, reason: "PURCHASE" }).success).toBe(false);
    expect(stockAdjustmentSchema.safeParse({ productId, batchId, delta: 2, reason: "EXPIRED_SCRAP" }).success).toBe(false);
    expect(stockAdjustmentSchema.safeParse({ productId, delta: -1 }).success).toBe(false);
  });

  it("normalises ledger filters", () => {
    const parsed = stockLedgerQuerySchema.safeParse({ reason: "ADJUSTMENT", from: "2026-01-01", to: "2026-01-31" });
    expect(parsed.success && parsed.data.reason).toBe("MANUAL_ADJUSTMENT");
    expect(stockLedgerQuerySchema.safeParse({ from: "2026-02-01", to: "2026-01-01" }).success).toBe(false);
    expect(stockLedgerQuerySchema.safeParse({ reason: "STOLEN" }).success).toBe(false);
  });
});
