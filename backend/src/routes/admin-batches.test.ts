/**
 * HTTP tests: batch inspector (GET /admin/batches) and /admin/inventory/*.
 * Real users per role (requireAuth reads the role from the database).
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { stockHistoryLogs } from "../db/schema/tables";
import { addDays, todayInBusinessTz } from "../lib/dates";
import { calculateBatchHealth, type BatchDTO, type BatchHealthSummary } from "../services/batch-inspector.service";
import type { LedgerEntryDTO } from "../services/audit.service";
import type {
  ImportBatchResult,
  LowStockItem,
  StockAdjustmentResult,
} from "../services/inventory.service";
import { api } from "../tests/http-client";
import { FixtureRegistry, type TestUser } from "../tests/inventory-fixtures";
import type { PaginationMeta } from "../types";

const fixtures = new FixtureRegistry();
const today = todayInBusinessTz();

let admin: TestUser;
let inventoryManager: TestUser;
let marketing: TestUser;
let customer: TestUser;
let productId: string;
let expiredBatchId: string;
let soonBatchId: string;
let healthyBatchId: string;
let soonBatchNumber: string;

type InspectorMeta = PaginationMeta & { summary: BatchHealthSummary };

beforeAll(async () => {
  [admin, inventoryManager, marketing, customer] = await Promise.all([
    fixtures.user("SUPER_ADMIN"),
    fixtures.user("INVENTORY_MANAGER"),
    fixtures.user("MARKETING_MANAGER"),
    fixtures.user("CUSTOMER"),
  ]);
  const category = await fixtures.category("Batch Inspector");
  const product = await fixtures.product({ categoryId: category.id, lowStockThreshold: 1_000_000 });
  productId = product.id;
  expiredBatchId = (await fixtures.batch(productId, addDays(today, -2), 4)).id;
  const soon = await fixtures.batch(productId, addDays(today, 10), 6);
  soonBatchId = soon.id;
  soonBatchNumber = soon.batchNumber;
  healthyBatchId = (await fixtures.batch(productId, addDays(today, 200), 20)).id;
});

afterAll(async () => {
  await fixtures.cleanup();
});

describe("GET /admin/batches (batch inspector)", () => {
  it("returns every batch with business-TZ health, product info and summary meta", async () => {
    const res = await api<BatchDTO[], InspectorMeta>("GET", `/admin/batches?productId=${productId}`, {
      token: admin.token,
    });
    expect(res.status).toBe(200);
    expect(res.body.meta).toMatchObject({ page: 1, limit: 20, total: 3, totalPages: 1 });
    expect(res.body.meta?.summary).toEqual({ EXPIRED: 1, EXPIRING_SOON: 1, HEALTHY: 1 });

    const byId = new Map(res.body.data.map((b) => [b.id, b]));
    expect(byId.get(expiredBatchId)).toMatchObject({ healthStatus: "EXPIRED", daysUntilExpiry: -2, availableQuantity: 4 });
    expect(byId.get(soonBatchId)).toMatchObject({ healthStatus: "EXPIRING_SOON", daysUntilExpiry: 10 });
    expect(byId.get(healthyBatchId)).toMatchObject({ healthStatus: "HEALTHY", daysUntilExpiry: 200 });

    const sample = byId.get(soonBatchId);
    expect(sample).toMatchObject({
      productId,
      batchNumber: soonBatchNumber,
      expiryDate: addDays(today, 10),
      manufactureDate: null,
      initialQuantity: 6,
    });
    expect(typeof sample?.productTitle).toBe("string");
    expect(typeof sample?.sku).toBe("string");
    // FEFO order.
    expect(res.body.data.map((b) => b.id)).toEqual([expiredBatchId, soonBatchId, healthyBatchId]);
  });

  it("filters by status, searches and paginates", async () => {
    const soon = await api<BatchDTO[], InspectorMeta>(
      "GET",
      `/admin/batches?productId=${productId}&status=EXPIRING_SOON`,
      { token: inventoryManager.token },
    );
    expect(soon.status).toBe(200);
    expect(soon.body.data.map((b) => b.id)).toEqual([soonBatchId]);
    expect(soon.body.meta?.summary.HEALTHY).toBe(1); // summary ignores the status filter

    const search = await api<BatchDTO[]>("GET", `/admin/batches?q=${encodeURIComponent(soonBatchNumber)}`, {
      token: admin.token,
    });
    expect(search.body.data.map((b) => b.id)).toEqual([soonBatchId]);

    const page2 = await api<BatchDTO[]>("GET", `/admin/batches?productId=${productId}&limit=1&page=2`, {
      token: admin.token,
    });
    expect(page2.body.meta).toMatchObject({ page: 2, limit: 1, total: 3, totalPages: 3 });
    expect(page2.body.data.map((b) => b.id)).toEqual([soonBatchId]);

    const invalid = await api<null>("GET", "/admin/batches?status=ROTTEN", { token: admin.token });
    expect(invalid.status).toBe(422);
    expect(invalid.body.error?.code).toBe("VALIDATION_ERROR");
  });

  it("enforces authentication and BATCHES_MANAGE", async () => {
    expect((await api<null>("GET", "/admin/batches")).status).toBe(401);
    const asCustomer = await api<null>("GET", "/admin/batches", { token: customer.token });
    expect(asCustomer.status).toBe(403);
    expect(asCustomer.body.error).toMatchObject({ code: "FORBIDDEN" });
    expect((await api<null>("GET", "/admin/batches", { token: marketing.token })).status).toBe(403);
  });
});

describe("POST /admin/inventory/batches (the batch import endpoint)", () => {
  it("imports a batch, writes the IMPORT ledger row and returns batch + product status", async () => {
    const res = await api<ImportBatchResult>("POST", "/admin/inventory/batches", {
      token: inventoryManager.token,
      body: {
        productId,
        batchNumber: "IMP-2026-C",
        manufactureDate: addDays(today, -20),
        expiryDate: addDays(today, 365),
        initialQuantity: 75,
      },
    });
    expect(res.status).toBe(201);
    expect(res.body.data.batch).toMatchObject({
      productId,
      batchNumber: "IMP-2026-C",
      initialQuantity: 75,
      availableQuantity: 75,
      healthStatus: "HEALTHY",
      daysUntilExpiry: 365,
    });
    expect(res.body.data.product).toMatchObject({ id: productId, isActive: true, listingStatus: "ACTIVE" });

    const logs = await db
      .select()
      .from(stockHistoryLogs)
      .where(and(eq(stockHistoryLogs.batchId, res.body.data.batch.id), eq(stockHistoryLogs.reason, "IMPORT")));
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ changeDelta: 75, balanceAfter: 75, performedByUserId: inventoryManager.id });
  });

  it("rejects duplicates (409), expired batches (422), unknown products (404) and customers (403)", async () => {
    const body = { productId, batchNumber: "IMP-2026-C", expiryDate: addDays(today, 365), initialQuantity: 5 };
    const duplicate = await api<null>("POST", "/admin/inventory/batches", { token: admin.token, body });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error?.code).toBe("CONFLICT");

    const expired = await api<null>("POST", "/admin/inventory/batches", {
      token: admin.token,
      body: { ...body, batchNumber: "OLD-1", expiryDate: today },
    });
    expect(expired.status).toBe(422);
    expect(expired.body.error?.details).toMatchObject({ fieldErrors: { expiryDate: expect.any(Array) } });

    const unknown = await api<null>("POST", "/admin/inventory/batches", {
      token: admin.token,
      body: { ...body, batchNumber: "NEW-1", productId: "00000000-0000-4000-8000-000000000000" },
    });
    expect(unknown.status).toBe(404);

    const forbidden = await api<null>("POST", "/admin/inventory/batches", {
      token: customer.token,
      body: { ...body, batchNumber: "HACK-1" },
    });
    expect(forbidden.status).toBe(403);
  });

  it("removed the duplicate endpoints", async () => {
    const legacyImport = await api<null>("POST", "/admin/batches", {
      token: admin.token,
      body: { productId, batchNumber: "LEGACY-1", expiryDate: addDays(today, 30), initialQuantity: 1 },
    });
    expect(legacyImport.status).toBe(404);
    expect((await api<null>("GET", "/admin/inventory/logs", { token: admin.token })).status).toBe(404);
    expect((await api<null>("GET", "/admin/inventory/batches", { token: admin.token })).status).toBe(404);
  });
});

describe("POST /admin/inventory/adjust", () => {
  it("applies a relative correction and logs it", async () => {
    const res = await api<StockAdjustmentResult>("POST", "/admin/inventory/adjust", {
      token: inventoryManager.token,
      body: { productId, batchId: healthyBatchId, delta: -5, note: "Damaged in transit" },
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      reason: "MANUAL_ADJUSTMENT",
      delta: -5,
      previousQuantity: 20,
      newQuantity: 15,
    });
    expect(res.body.data.batch.availableQuantity).toBe(15);
  });

  it("rejects negative results (409), unknown reasons (422) and roles without STOCK_ADJUST (403)", async () => {
    const negative = await api<null>("POST", "/admin/inventory/adjust", {
      token: admin.token,
      body: { productId, batchId: soonBatchId, delta: -100 },
    });
    expect(negative.status).toBe(409);
    expect(negative.body.error).toMatchObject({ code: "INSUFFICIENT_STOCK" });

    const badReason = await api<null>("POST", "/admin/inventory/adjust", {
      token: admin.token,
      body: { productId, batchId: soonBatchId, delta: -1, reason: "PURCHASE" },
    });
    expect(badReason.status).toBe(422);

    const forbidden = await api<null>("POST", "/admin/inventory/adjust", {
      token: marketing.token,
      body: { productId, batchId: soonBatchId, delta: -1 },
    });
    expect(forbidden.status).toBe(403);
  });
});

describe("GET /admin/inventory/ledger (the ledger endpoint)", () => {
  it("paginates newest-first with filters", async () => {
    const all = await api<LedgerEntryDTO[]>("GET", `/admin/inventory/ledger?productId=${productId}`, {
      token: inventoryManager.token,
    });
    expect(all.status).toBe(200);
    expect(all.body.meta).toMatchObject({ page: 1, limit: 20 });
    expect(all.body.meta?.total).toBeGreaterThanOrEqual(2);
    const [newest] = all.body.data;
    expect(newest).toMatchObject({ productId, reason: "MANUAL_ADJUSTMENT", changeDelta: -5, balanceAfter: 15 });
    expect(newest?.performedBy).toMatchObject({ id: inventoryManager.id, role: "INVENTORY_MANAGER" });
    expect(newest?.batchNumber).not.toBeNull();

    const imports = await api<LedgerEntryDTO[]>("GET", `/admin/inventory/ledger?productId=${productId}&reason=IMPORT`, {
      token: admin.token,
    });
    expect(imports.body.data.every((e) => e.reason === "IMPORT")).toBe(true);
    expect(imports.body.data).toHaveLength(1);

    const alias = await api<LedgerEntryDTO[]>(
      "GET",
      `/admin/inventory/ledger?productId=${productId}&reason=ADJUSTMENT`,
      { token: admin.token },
    );
    expect(alias.body.data.map((e) => e.reason)).toEqual(["MANUAL_ADJUSTMENT"]);

    const byBatch = await api<LedgerEntryDTO[]>("GET", `/admin/inventory/ledger?batchId=${healthyBatchId}`, {
      token: admin.token,
    });
    expect(byBatch.body.data.every((e) => e.batchId === healthyBatchId)).toBe(true);

    const todayOnly = await api<LedgerEntryDTO[]>(
      "GET",
      `/admin/inventory/ledger?productId=${productId}&from=${today}&to=${today}`,
      { token: admin.token },
    );
    expect(todayOnly.body.meta?.total).toBe(all.body.meta?.total);
    const future = await api<LedgerEntryDTO[]>(
      "GET",
      `/admin/inventory/ledger?productId=${productId}&from=${addDays(today, 1)}`,
      { token: admin.token },
    );
    expect(future.body.meta?.total).toBe(0);

    const paged = await api<LedgerEntryDTO[]>("GET", `/admin/inventory/ledger?productId=${productId}&limit=1`, {
      token: admin.token,
    });
    expect(paged.body.data).toHaveLength(1);
    expect(paged.body.meta?.totalPages).toBe(all.body.meta?.total);
  });

  it("validates filters and permissions", async () => {
    expect((await api<null>("GET", "/admin/inventory/ledger?reason=STOLEN", { token: admin.token })).status).toBe(422);
    expect((await api<null>("GET", "/admin/inventory/ledger?productId=abc", { token: admin.token })).status).toBe(422);
    expect((await api<null>("GET", "/admin/inventory/ledger")).status).toBe(401);
    expect((await api<null>("GET", "/admin/inventory/ledger", { token: marketing.token })).status).toBe(403);
    expect((await api<null>("GET", "/admin/inventory/ledger", { token: customer.token })).status).toBe(403);
  });
});

describe("GET /admin/inventory/low-stock and /expiring-soon", () => {
  it("lists low-stock products", async () => {
    const res = await api<LowStockItem[]>("GET", "/admin/inventory/low-stock?limit=100", { token: marketing.token });
    expect(res.status).toBe(200);
    const total = res.body.meta?.total ?? 0;
    let match = res.body.data.find((item) => item.productId === productId);
    for (let page = 2; !match && (page - 1) * 100 < total; page++) {
      const next = await api<LowStockItem[]>("GET", `/admin/inventory/low-stock?limit=100&page=${page}`, {
        token: marketing.token,
      });
      match = next.body.data.find((item) => item.productId === productId);
    }
    // 6 (soon) + 15 (healthy) + 75 (imported); the expired batch does not count.
    expect(match).toMatchObject({ totalStock: 96, lowStockThreshold: 1_000_000, isOutOfStock: false });
  });

  it("lists sellable batches expiring within N days", async () => {
    const res = await api<BatchDTO[]>("GET", "/admin/inventory/expiring-soon?days=30&limit=100", {
      token: inventoryManager.token,
    });
    expect(res.status).toBe(200);
    const ids = res.body.data.map((b) => b.id);
    expect(ids).toContain(soonBatchId);
    expect(ids).not.toContain(expiredBatchId);
    expect(ids).not.toContain(healthyBatchId);
    expect((await api<null>("GET", "/admin/inventory/expiring-soon?days=0", { token: admin.token })).status).toBe(422);
  });
});

describe("calculateBatchHealth", () => {
  const reference = "2026-06-15";

  it("labels batches expiring on or before today as EXPIRED", () => {
    expect(calculateBatchHealth("2026-06-15", 5, reference)).toEqual({ daysUntilExpiry: 0, healthStatus: "EXPIRED" });
    expect(calculateBatchHealth("2026-06-10", 0, reference)).toEqual({ daysUntilExpiry: -5, healthStatus: "EXPIRED" });
  });

  it("labels stocked batches within 30 days as EXPIRING_SOON, depleted ones as HEALTHY", () => {
    expect(calculateBatchHealth("2026-06-16", 1, reference).healthStatus).toBe("EXPIRING_SOON");
    expect(calculateBatchHealth("2026-07-15", 1, reference)).toEqual({ daysUntilExpiry: 30, healthStatus: "EXPIRING_SOON" });
    expect(calculateBatchHealth("2026-06-20", 0, reference).healthStatus).toBe("HEALTHY");
  });

  it("labels batches beyond 30 days as HEALTHY", () => {
    expect(calculateBatchHealth("2026-07-16", 9, reference)).toEqual({ daysUntilExpiry: 31, healthStatus: "HEALTHY" });
  });
});
