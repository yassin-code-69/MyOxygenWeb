import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { InventoryService } from "../services/inventory.service";
import { db, categories, products, productBatches, stockHistoryLogs } from "../db";
import { eq, and } from "drizzle-orm";

describe("Phase 3 & 7: Concurrency Race Condition Testing & FEFO Stock Reservation", () => {
  const inventoryService = new InventoryService();
  const testRunId = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;

  let testCategoryId: string;
  let testProductId: string;
  let testBatchId: string;

  beforeAll(async () => {
    // 1. Seed a test category
    const [category] = await db
      .insert(categories)
      .values({
        name: `Race Test Cat ${testRunId}`,
        slug: `race-cat-${testRunId}`,
      })
      .returning();
    testCategoryId = category.id;

    // 2. Seed a test product
    const [product] = await db
      .insert(products)
      .values({
        title: `Race Test Hydrating Cream ${testRunId}`,
        slug: `race-test-cream-${testRunId}`,
        categoryId: testCategoryId,
        description: "Concurrency race condition test perishable item",
        basePrice: "500.00",
        costPrice: "300.00",
        images: ["https://example.com/cream.png"],
        sku: `SKU-CR-${testRunId}`,
        requiresBatchTracking: true,
        isActive: true,
      })
      .returning();
    testProductId = product.id;

    // 3. Seed a single batch having availableQuantity = 5
    const [batch] = await db
      .insert(productBatches)
      .values({
        productId: testProductId,
        batchNumber: `BATCH-RACE-${testRunId}`,
        manufactureDate: "2025-01-01",
        expiryDate: "2028-12-31",
        initialQuantity: 5,
        availableQuantity: 5,
      })
      .returning();
    testBatchId = batch.id;
  });

  afterAll(async () => {
    // Clean up test rows
    if (testBatchId) {
      await db
        .delete(stockHistoryLogs)
        .where(eq(stockHistoryLogs.batchId, testBatchId));
      await db
        .delete(productBatches)
        .where(eq(productBatches.id, testBatchId));
    }
    if (testProductId) {
      await db
        .delete(stockHistoryLogs)
        .where(eq(stockHistoryLogs.productId, testProductId));
      await db.delete(products).where(eq(products.id, testProductId));
    }
    if (testCategoryId) {
      await db.delete(categories).where(eq(categories.id, testCategoryId));
    }
  });

  it(
    "should handle 10 concurrent reserveStock() requests for 1 unit each on a batch of 5: exactly 5 succeed, 5 fail, remaining stock is 0, and 5 PURCHASE logs exist",
    async () => {
      const concurrencyRequests = 10;
      let fulfilledCount = 0;
      let rejectedCount = 0;
      const rejectedErrors: Error[] = [];

      // Fires 10 concurrent requests calling inventoryService.reserveStock() for 1 unit each using Promise.all()
      await Promise.all(
        Array.from({ length: concurrencyRequests }, async (_, index) => {
          const orderId = `ORD-RACE-${testRunId}-${index}`;
          try {
            await inventoryService.reserveStock(
              [{ batchId: testBatchId, quantity: 1 }],
              orderId,
            );
            fulfilledCount++;
          } catch (error) {
            rejectedCount++;
            rejectedErrors.push(error as Error);
          }
        }),
      );

      // Asserts:
      // Exactly 5 promises resolve successfully
      expect(fulfilledCount).toBe(5);

      // Exactly 5 promises reject with insufficient stock error
      expect(rejectedCount).toBe(5);
      expect(rejectedErrors).toHaveLength(5);
      for (const err of rejectedErrors) {
        expect(err.message).toMatch(/race condition|insufficient/i);
      }

      // The remaining availableQuantity in the database is exactly 0 (never negative)
      const [batchInDb] = await db
        .select({
          id: productBatches.id,
          availableQuantity: productBatches.availableQuantity,
        })
        .from(productBatches)
        .where(eq(productBatches.id, testBatchId));

      expect(batchInDb).toBeDefined();
      expect(batchInDb.availableQuantity).toBe(0);

      // Exactly 5 PURCHASE audit rows are logged in stockHistoryLogs
      const auditLogs = await db
        .select()
        .from(stockHistoryLogs)
        .where(
          and(
            eq(stockHistoryLogs.batchId, testBatchId),
            eq(stockHistoryLogs.reason, "PURCHASE"),
          ),
        );

      expect(auditLogs).toHaveLength(5);
      for (const log of auditLogs) {
        expect(log.changeDelta).toBe(-1);
        expect(log.balanceAfter).toBeGreaterThanOrEqual(0);
        expect(log.balanceAfter).toBeLessThanOrEqual(4);
      }
    },
    30000,
  );
});
