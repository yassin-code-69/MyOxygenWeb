import { describe, test, expect, mock } from "bun:test";
import { InventoryService } from "./inventory.service";
import {
  importBatchSchema,
  stockAdjustmentSchema,
} from "../routes/inventory.schema";
import { runExpiryCheck } from "../jobs/expiry-scheduler";
import type { DatabaseClient } from "../db/client";

interface MockBatch {
  id: string;
  productId: string;
  batchNumber: string;
  manufactureDate?: string | null;
  expiryDate: string;
  initialQuantity: number;
  availableQuantity: number;
}

interface MockLog {
  id?: string;
  productId: string;
  batchId: string | null;
  changeDelta: number;
  balanceAfter: number;
  reason: string;
  note: string | null;
  performedByUserId: string | null;
}

function createMockDatabase(initialBatches: MockBatch[] = [], initialLogs: MockLog[] = []) {
  const batches = initialBatches.map((b) => ({ ...b }));
  const logs = initialLogs.map((l) => ({ ...l }));

  const mockDb: any = {
    _batches: batches,
    _logs: logs,

    query: {
      productBatches: {
        findMany: mock(async (opts?: any) => {
          return batches.map((b) => ({ ...b }));
        }),
        findFirst: mock(async (opts?: any) => {
          return batches[0] ? { ...batches[0] } : undefined;
        }),
      },
      stockHistoryLogs: {
        findMany: mock(async (opts?: any) => {
          return logs.map((l) => ({ ...l }));
        }),
      },
    },

    select: mock((fields: any) => {
      return {
        from: mock((table: any) => {
          const chain: any = {
            where: mock((cond: any) => {
              const today = new Date().toISOString().split("T")[0];
              const valid = batches.filter(
                (b) => b.availableQuantity > 0 && b.expiryDate > today,
              );
              const resPromise = Promise.resolve([
                {
                  total: valid.reduce((sum, x) => sum + x.availableQuantity, 0),
                },
              ]);
              (resPromise as any).for = mock(() => resPromise);
              return resPromise;
            }),
            groupBy: mock(() => Promise.resolve([])),
            limit: mock(() => chain),
            offset: mock(() => chain),
            orderBy: mock(() => chain),
            leftJoin: mock(() => chain),
          };
          return chain;
        }),
      };
    }),

    transaction: mock(async (callback: (tx: any) => Promise<any>) => {
      const tx: any = {
        select: mock((fields: any) => ({
          from: mock((table: any) => ({
            where: mock((cond: any) => {
              const whereChain: any = {
                for: mock(async (lockMode: string) => {
                  return batches.map((b) => ({
                    id: b.id,
                    productId: b.productId,
                    availableQuantity: b.availableQuantity,
                  }));
                }),
                then: (resolve: any, reject: any) => {
                  return Promise.resolve(
                    batches.map((b) => ({
                      id: b.id,
                      productId: b.productId,
                      availableQuantity: b.availableQuantity,
                    })),
                  ).then(resolve, reject);
                },
              };
              return whereChain;
            }),
          })),
        })),

        update: mock((table: any) => ({
          set: mock((values: any) => ({
            where: mock(async (cond: any) => {
              return [{ ...values }];
            }),
          })),
        })),

        insert: mock((table: any) => ({
          values: mock(async (data: any) => {
            logs.push({ ...data, id: "log-" + Math.random() });
            return [data];
          }),
        })),
      };

      return await callback(tx);
    }),

    update: mock((table: any) => ({
      set: mock((values: any) => ({
        where: mock(async (cond: any) => {
          return [{ ...values }];
        }),
      })),
    })),

    insert: mock((table: any) => ({
      values: mock(async (data: any) => {
        logs.push({ ...data, id: "log-" + Math.random() });
        return [data];
      }),
    })),
  };

  return mockDb as DatabaseClient & { _batches: MockBatch[]; _logs: MockLog[] };
}

describe("InventoryService - FEFO Allocation & Perishable Engine", () => {
  const service = new InventoryService();
  const productId = "e3d96924-4f06-4440-843e-b8d96cf6473e";

  test("FEFO batch allocation logic allocates the earliest-expiring batch first", async () => {
    // Setup batches expiring on different future dates
    const batches: MockBatch[] = [
      {
        id: "batch-exp-dec",
        productId,
        batchNumber: "BATCH-DEC",
        expiryDate: "2027-12-31",
        initialQuantity: 100,
        availableQuantity: 100,
      },
      {
        id: "batch-exp-feb",
        productId,
        batchNumber: "BATCH-FEB",
        expiryDate: "2027-02-01", // Earliest expiring
        initialQuantity: 40,
        availableQuantity: 40,
      },
      {
        id: "batch-exp-jun",
        productId,
        batchNumber: "BATCH-JUN",
        expiryDate: "2027-06-15", // Middle expiring
        initialQuantity: 50,
        availableQuantity: 50,
      },
    ];

    const mockDb = createMockDatabase(batches);

    // Request 30 units: should be fulfilled ENTIRELY from batch-exp-feb (earliest)
    const singleAlloc = await service.allocateBatchesFEFO(productId, 30, mockDb);
    expect(singleAlloc).toHaveLength(1);
    expect(singleAlloc[0]).toEqual({
      batchId: "batch-exp-feb",
      quantity: 30,
    });

    // Request 70 units: should take all 40 from BATCH-FEB, and 30 from BATCH-JUN
    const multiAlloc = await service.allocateBatchesFEFO(productId, 70, mockDb);
    expect(multiAlloc).toHaveLength(2);
    expect(multiAlloc[0]).toEqual({
      batchId: "batch-exp-feb",
      quantity: 40,
    });
    expect(multiAlloc[1]).toEqual({
      batchId: "batch-exp-jun",
      quantity: 30,
    });

    // Request 110 units: should drain BATCH-FEB (40), BATCH-JUN (50), and take 20 from BATCH-DEC
    const threeAlloc = await service.allocateBatchesFEFO(productId, 110, mockDb);
    expect(threeAlloc).toHaveLength(3);
    expect(threeAlloc[0]).toEqual({ batchId: "batch-exp-feb", quantity: 40 });
    expect(threeAlloc[1]).toEqual({ batchId: "batch-exp-jun", quantity: 50 });
    expect(threeAlloc[2]).toEqual({ batchId: "batch-exp-dec", quantity: 20 });
  });

  test("FEFO allocation ignores expired batches and zero-quantity batches", async () => {
    const batches: MockBatch[] = [
      {
        id: "batch-expired",
        productId,
        batchNumber: "BATCH-EXPIRED",
        expiryDate: "2020-01-01", // Long expired
        initialQuantity: 50,
        availableQuantity: 50,
      },
      {
        id: "batch-zero-stock",
        productId,
        batchNumber: "BATCH-ZERO",
        expiryDate: "2028-01-01",
        initialQuantity: 50,
        availableQuantity: 0, // Depleted
      },
      {
        id: "batch-valid",
        productId,
        batchNumber: "BATCH-VALID",
        expiryDate: "2027-10-01",
        initialQuantity: 25,
        availableQuantity: 25,
      },
    ];

    const mockDb = createMockDatabase(batches);

    const alloc = await service.allocateBatchesFEFO(productId, 20, mockDb);
    expect(alloc).toHaveLength(1);
    expect(alloc[0].batchId).toBe("batch-valid");
    expect(alloc[0].quantity).toBe(20);

    // Requesting more than valid stock should fail even though expired batch has stock
    expect(service.allocateBatchesFEFO(productId, 50, mockDb)).rejects.toThrow(
      /Insufficient stock/i,
    );
  });

  test("FEFO allocation throws error if aggregate stock is insufficient", async () => {
    const batches: MockBatch[] = [
      {
        id: "batch-small",
        productId,
        batchNumber: "BATCH-SMALL",
        expiryDate: "2027-05-01",
        initialQuantity: 15,
        availableQuantity: 15,
      },
    ];

    const mockDb = createMockDatabase(batches);

    await expect(service.allocateBatchesFEFO(productId, 20, mockDb)).rejects.toThrow(
      /Insufficient stock for product.*Requested: 20, Available: 15/,
    );
  });

  test("FEFO allocation throws error if requested quantity is <= 0", async () => {
    const mockDb = createMockDatabase([]);
    await expect(service.allocateBatchesFEFO(productId, 0, mockDb)).rejects.toThrow(
      /Required quantity must be greater than zero/,
    );
    await expect(service.allocateBatchesFEFO(productId, -5, mockDb)).rejects.toThrow(
      /Required quantity must be greater than zero/,
    );
  });

  test("Total available stock calculation sums non-expired available stock", async () => {
    const batches: MockBatch[] = [
      {
        id: "b1",
        productId,
        batchNumber: "B1",
        expiryDate: "2027-03-01",
        initialQuantity: 50,
        availableQuantity: 45,
      },
      {
        id: "b2",
        productId,
        batchNumber: "B2",
        expiryDate: "2027-09-01",
        initialQuantity: 100,
        availableQuantity: 80,
      },
      {
        id: "b-exp",
        productId,
        batchNumber: "B-EXP",
        expiryDate: "2021-01-01", // Expired
        initialQuantity: 30,
        availableQuantity: 30,
      },
    ];

    const mockDb = createMockDatabase(batches);

    const total = await service.getTotalAvailableStock(productId, mockDb);
    // 45 + 80 = 125 (excluding expired batch of 30)
    expect(total).toBe(125);
  });

  test("Total available stock returns 0 when no eligible batches exist", async () => {
    const mockDb = createMockDatabase([]);
    const total = await service.getTotalAvailableStock(productId, mockDb);
    expect(total).toBe(0);
  });

  test("reserveStock decrements available quantity and appends PURCHASE audit log", async () => {
    const batchId = "batch-reserve-1";
    const batch: MockBatch = {
      id: batchId,
      productId,
      batchNumber: "BATCH-RES",
      expiryDate: "2027-05-01",
      initialQuantity: 50,
      availableQuantity: 50,
    };

    const mockDb = createMockDatabase([batch]);
    const orderId = "order-test-123";

    await service.reserveStock(
      [{ batchId, quantity: 20 }],
      orderId,
      "user-admin-uuid",
      mockDb,
    );

    // Verify stock ledger entry was recorded
    expect(mockDb._logs).toHaveLength(1);
    const log = mockDb._logs[0];
    expect(log.reason).toBe("PURCHASE");
    expect(log.changeDelta).toBe(-20);
    expect(log.note).toBe(`Reserved for order ${orderId}`);
    expect(log.performedByUserId).toBe("user-admin-uuid");
  });

  test("releaseReservation restores available quantity and appends RETURN audit log", async () => {
    const batchId = "batch-release-1";
    const orderId = "order-cancel-999";

    const batch: MockBatch = {
      id: batchId,
      productId,
      batchNumber: "BATCH-REL",
      expiryDate: "2027-05-01",
      initialQuantity: 50,
      availableQuantity: 30, // Was reduced from 50 to 30
    };

    const purchaseLog: MockLog = {
      id: "log-p1",
      productId,
      batchId,
      changeDelta: -20,
      balanceAfter: 30,
      reason: "PURCHASE",
      note: `Reserved for order ${orderId}`,
      performedByUserId: "user-1",
    };

    const mockDb = createMockDatabase([batch], [purchaseLog]);

    await service.releaseReservation(orderId, "user-admin-uuid", mockDb);

    // Verify RETURN log was appended
    const returnLogs = mockDb._logs.filter((l) => l.reason === "RETURN");
    expect(returnLogs).toHaveLength(1);
    expect(returnLogs[0].changeDelta).toBe(20);
    expect(returnLogs[0].note).toBe(
      `Stock returned on cancellation of order ${orderId}`,
    );
  });
});

describe("Inventory Schema Validation", () => {
  const validProductId = "f47ac10b-58cc-4372-a567-0e02b2c3d479";

  test("importBatchSchema validates correct future batch payload", () => {
    const validData = {
      productId: validProductId,
      batchNumber: "BATCH-2027-XYZ",
      manufactureDate: "2026-01-01",
      expiryDate: "2027-12-31",
      initialQuantity: 100,
    };

    const result = importBatchSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  test("importBatchSchema rejects expired dates", () => {
    const expiredData = {
      productId: validProductId,
      batchNumber: "BATCH-OLD",
      manufactureDate: "2020-01-01",
      expiryDate: "2021-01-01", // In the past
      initialQuantity: 50,
    };

    const result = importBatchSchema.safeParse(expiredData);
    expect(result.success).toBe(false);
    if (!result.success) {
      const issues = result.error.issues;
      const expiryIssue = issues.find((i) => i.path.includes("expiryDate"));
      expect(expiryIssue).toBeDefined();
      expect(expiryIssue?.message).toContain("already expired");
    }
  });

  test("importBatchSchema rejects when manufactureDate >= expiryDate", () => {
    const invalidDateData = {
      productId: validProductId,
      batchNumber: "BATCH-INVALID-DATES",
      manufactureDate: "2028-01-01", // After expiry
      expiryDate: "2027-01-01",
      initialQuantity: 50,
    };

    const result = importBatchSchema.safeParse(invalidDateData);
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) =>
        i.path.includes("manufactureDate"),
      );
      expect(issue).toBeDefined();
      expect(issue?.message).toContain("manufactureDate must be before expiryDate");
    }
  });

  test("importBatchSchema rejects invalid initialQuantity <= 0", () => {
    const zeroQty = {
      productId: validProductId,
      batchNumber: "BATCH-ZERO",
      expiryDate: "2028-01-01",
      initialQuantity: 0,
    };
    expect(importBatchSchema.safeParse(zeroQty).success).toBe(false);

    const negativeQty = {
      ...zeroQty,
      initialQuantity: -10,
    };
    expect(importBatchSchema.safeParse(negativeQty).success).toBe(false);
  });

  test("importBatchSchema rejects non-UUID productId", () => {
    const invalidId = {
      productId: "not-a-valid-uuid",
      batchNumber: "BATCH-2028-A",
      expiryDate: "2028-01-01",
      initialQuantity: 50,
    };
    expect(importBatchSchema.safeParse(invalidId).success).toBe(false);
  });

  test("stockAdjustmentSchema accepts valid delta and reason", () => {
    const validAdjust = {
      productId: validProductId,
      batchId: "f47ac10b-58cc-4372-a567-0e02b2c3d478",
      delta: -5,
      reason: "MANUAL_ADJUSTMENT",
      note: "Damaged packaging in warehouse",
    };
    const result = stockAdjustmentSchema.safeParse(validAdjust);
    expect(result.success).toBe(true);
  });

  test("stockAdjustmentSchema rejects delta = 0", () => {
    const zeroDelta = {
      productId: validProductId,
      delta: 0,
      reason: "MANUAL_ADJUSTMENT",
    };
    const result = stockAdjustmentSchema.safeParse(zeroDelta);
    expect(result.success).toBe(false);
  });
});

describe("Expiry Scheduler (runExpiryCheck)", () => {
  const productId = "f47ac10b-58cc-4372-a567-0e02b2c3d479";

  test("runExpiryCheck zeroes out expired batches with remaining quantity", async () => {
    const expiredBatch: MockBatch = {
      id: "expired-batch-1",
      productId,
      batchNumber: "BATCH-EXPIRED-TEST",
      expiryDate: "2020-01-01",
      initialQuantity: 25,
      availableQuantity: 25,
    };

    const mockDb = createMockDatabase([expiredBatch]);

    const result = await runExpiryCheck(mockDb);

    expect(result.scrappedBatchCount).toBe(1);
    expect(result.totalUnitsScrapped).toBe(25);
    expect(result.details[0].batchId).toBe("expired-batch-1");
    expect(result.details[0].unitsScrapped).toBe(25);

    // Verify EXPIRED_SCRAP audit log was inserted
    const scrapLogs = mockDb._logs.filter((l) => l.reason === "EXPIRED_SCRAP");
    expect(scrapLogs).toHaveLength(1);
    expect(scrapLogs[0].changeDelta).toBe(-25);
    expect(scrapLogs[0].balanceAfter).toBe(0);
    expect(scrapLogs[0].performedByUserId).toBeNull(); // System action
  });

  test("runExpiryCheck returns 0 count when no batches are expired", async () => {
    const mockDb = createMockDatabase([]);
    // Mock findMany returning empty array
    (mockDb.query.productBatches as any).findMany = mock(async () => []);

    const result = await runExpiryCheck(mockDb);
    expect(result.scrappedBatchCount).toBe(0);
    expect(result.totalUnitsScrapped).toBe(0);
  });
});

describe("Inventory API Endpoints & RBAC Protection", () => {
  const validProductId = "f47ac10b-58cc-4372-a567-0e02b2c3d479";

  test("GET /inventory/low-stock rejects unauthenticated requests (401)", async () => {
    const { app } = await import("../index");
    const res = await app.request("/inventory/low-stock", {
      method: "GET",
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain("Authorization token required");
  });

  test("POST /inventory/batches rejects customer token without BATCHES_MANAGE (403)", async () => {
    const { app } = await import("../index");
    const { signAccessToken } = await import("../lib/jwt");

    const customerToken = await signAccessToken({
      sub: "cust-1",
      role: "CUSTOMER",
      phone: "+8801811111111",
    });

    const res = await app.request("/inventory/batches", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${customerToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        productId: validProductId,
        batchNumber: "BATCH-HACK",
        expiryDate: "2028-01-01",
        initialQuantity: 100,
      }),
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain("Missing required permission [batches:manage]");
  });

  test("POST /inventory/adjust rejects customer token without STOCK_ADJUST (403)", async () => {
    const { app } = await import("../index");
    const { signAccessToken } = await import("../lib/jwt");

    const customerToken = await signAccessToken({
      sub: "cust-1",
      role: "CUSTOMER",
      phone: "+8801811111111",
    });

    const res = await app.request("/inventory/adjust", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${customerToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        productId: validProductId,
        delta: 10,
        reason: "MANUAL_ADJUSTMENT",
      }),
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain("Missing required permission [stock:adjust]");
  });
});

