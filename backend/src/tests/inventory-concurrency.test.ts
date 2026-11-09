/**
 * FEFO under concurrency (real local test database).
 *
 * Each "checkout" mirrors the order flow: one transaction that inserts the
 * order row, allocates FEFO (row locks) and reserves the stock. Concurrent
 * checkouts must serialize on the product's rows, drain the earliest-expiring
 * batch first, spill into the next batch, never oversell and fail cleanly
 * with INSUFFICIENT_STOCK once stock is gone.
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db/client";
import { orders, productBatches, products, stockHistoryLogs } from "../db/schema/tables";
import { addDays, todayInBusinessTz } from "../lib/dates";
import { AppError } from "../lib/errors";
import { inventoryService, type BatchAllocation } from "../services/inventory.service";
import { FixtureRegistry, uniqueId, type TestUser } from "./inventory-fixtures";

const fixtures = new FixtureRegistry();
const today = todayInBusinessTz();
let customer: TestUser;
let categoryId: string;

interface CheckoutOutcome {
  ok: boolean;
  orderId?: string;
  allocations?: BatchAllocation[];
  error?: unknown;
}

/** One checkout-style transaction; `lockOrder` records allocation order while the locks are held. */
async function checkout(productId: string, quantity: number, lockOrder: BatchAllocation[][]): Promise<CheckoutOutcome> {
  try {
    return await db.transaction(async (tx) => {
      const [order] = await tx
        .insert(orders)
        .values({
          orderNumber: uniqueId("ORD-C-").toUpperCase(),
          userId: customer.id,
          paymentMethod: "COD",
          shippingAddress: {
            fullName: "Race Tester",
            phone: "01700000000",
            addressLine1: "Road 1",
            city: "Dhaka",
            district: "Dhaka",
            postalCode: "1207",
          },
          subtotal: "0.00",
          deliveryFee: "0.00",
          total: "0.00",
        })
        .returning({ id: orders.id });
      if (!order) throw new Error("order insert failed");

      const allocations = await inventoryService.allocateBatchesFEFO(productId, quantity, tx);
      lockOrder.push(allocations);
      await inventoryService.reserveStock(allocations, order.id, customer.id, tx);
      return { ok: true, orderId: order.id, allocations };
    });
  } catch (error) {
    return { ok: false, error };
  }
}

async function quantities(batchIds: string[]): Promise<Map<string, number>> {
  const rows = await db
    .select({ id: productBatches.id, availableQuantity: productBatches.availableQuantity })
    .from(productBatches)
    .where(inArray(productBatches.id, batchIds));
  return new Map(rows.map((row) => [row.id, row.availableQuantity]));
}

beforeAll(async () => {
  customer = await fixtures.user("CUSTOMER");
  categoryId = (await fixtures.category("Concurrency")).id;
});

afterAll(async () => {
  await fixtures.cleanup();
});

describe("concurrent FEFO checkouts", () => {
  it(
    "20 concurrent 1-unit checkouts over two batches (6 + 9): 15 succeed in FEFO order, 5 fail, no oversell",
    async () => {
      const product = await fixtures.product({ categoryId, requiresBatchTracking: true });
      const early = await fixtures.batch(product.id, addDays(today, 15), 6, "EARLY");
      const late = await fixtures.batch(product.id, addDays(today, 120), 9, "LATE");
      const lockOrder: BatchAllocation[][] = [];

      const outcomes = await Promise.all(Array.from({ length: 20 }, () => checkout(product.id, 1, lockOrder)));
      for (const outcome of outcomes) {
        if (outcome.orderId) fixtures.trackOrder(outcome.orderId);
      }

      const succeeded = outcomes.filter((o) => o.ok);
      const failed = outcomes.filter((o) => !o.ok);
      expect(succeeded).toHaveLength(15);
      expect(failed).toHaveLength(5);
      for (const failure of failed) {
        expect(failure.error).toBeInstanceOf(AppError);
        const error = failure.error as AppError;
        expect(error.code).toBe("INSUFFICIENT_STOCK");
        expect(error.details).toEqual({ productId: product.id, requested: 1, available: 0 });
      }

      // Allocation order under the locks: the 6 earliest-expiring units first, then the later batch.
      const sequence = lockOrder.flat().map((a) => a.batchId);
      expect(sequence).toEqual([...Array(6).fill(early.id), ...Array(9).fill(late.id)]);

      const left = await quantities([early.id, late.id]);
      expect(left.get(early.id)).toBe(0);
      expect(left.get(late.id)).toBe(0);

      const purchases = await db
        .select({ orderId: stockHistoryLogs.orderId, changeDelta: stockHistoryLogs.changeDelta })
        .from(stockHistoryLogs)
        .where(and(eq(stockHistoryLogs.productId, product.id), eq(stockHistoryLogs.reason, "PURCHASE")));
      expect(purchases).toHaveLength(15);
      expect(new Set(purchases.map((p) => p.orderId))).toEqual(
        new Set<string | null>(succeeded.flatMap((s) => (s.orderId ? [s.orderId] : []))),
      );
      expect(purchases.every((p) => p.changeDelta === -1)).toBe(true);

      // Failed checkouts rolled back their order rows.
      const persistedOrders = await db
        .select({ id: orders.id })
        .from(orders)
        .where(eq(orders.userId, customer.id));
      expect(persistedOrders.map((o) => o.id).sort()).toEqual(
        succeeded.flatMap((s) => (s.orderId ? [s.orderId] : [])).sort(),
      );

      // Sold out → hidden automatically.
      const [state] = await db
        .select({ isActive: products.isActive, autoDeactivatedAt: products.autoDeactivatedAt })
        .from(products)
        .where(eq(products.id, product.id));
      expect(state?.isActive).toBe(false);
      expect(state?.autoDeactivatedAt).not.toBeNull();
    },
    60_000,
  );

  it(
    "concurrent 2-unit checkouts spill across batches (5 + 10): 7 succeed, 1 fails, one order spans both batches",
    async () => {
      const product = await fixtures.product({ categoryId, requiresBatchTracking: true });
      const early = await fixtures.batch(product.id, addDays(today, 10), 5, "SPILL-EARLY");
      const late = await fixtures.batch(product.id, addDays(today, 90), 10, "SPILL-LATE");
      const lockOrder: BatchAllocation[][] = [];

      const outcomes = await Promise.all(Array.from({ length: 8 }, () => checkout(product.id, 2, lockOrder)));
      for (const outcome of outcomes) {
        if (outcome.orderId) fixtures.trackOrder(outcome.orderId);
      }

      const succeeded = outcomes.filter((o) => o.ok);
      expect(succeeded).toHaveLength(7);
      const failure = outcomes.find((o) => !o.ok)?.error;
      expect(failure).toBeInstanceOf(AppError);
      expect((failure as AppError).details).toEqual({ productId: product.id, requested: 2, available: 1 });

      const split = succeeded.filter((s) => (s.allocations ?? []).length === 2);
      expect(split).toHaveLength(1);
      expect(split[0]?.allocations?.map((a) => [a.batchId, a.quantity])).toEqual([
        [early.id, 1],
        [late.id, 1],
      ]);

      const left = await quantities([early.id, late.id]);
      expect(left.get(early.id)).toBe(0);
      expect(left.get(late.id)).toBe(1);
    },
    60_000,
  );
});
