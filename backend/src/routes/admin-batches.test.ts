import { describe, it, expect, beforeAll } from "bun:test";
import { app } from "../index";
import { db } from "../db";
import {
  categories,
  products,
  productBatches,
  stockHistoryLogs,
  users,
} from "../db/schema/tables";
import { eq } from "drizzle-orm";
import { signAccessToken } from "../lib/jwt";
import {
  batchInspectorService,
  calculateBatchHealth,
} from "../services/batch-inspector.service";

describe("Admin Batch Inspector & Stock Audit Ledger", () => {
  let superAdminToken: string;
  let inventoryManagerToken: string;
  let customerToken: string;
  let marketingToken: string;

  let testAdminUserId: string;
  let testCustomerId: string;
  let testCategoryId: string;
  let testProductId: string;

  let expiredBatchId: string;
  let expiringSoonBatchId: string;
  let healthyBatchId: string;

  const expiredBatchNumber = `B-EXP-${Date.now()}`;
  const expiringSoonBatchNumber = `B-SOON-${Date.now()}`;
  const healthyBatchNumber = `B-HLT-${Date.now()}`;

  beforeAll(async () => {
    // 1. Seed or retrieve super admin user
    const existingAdmin = await db.query.users.findFirst({
      where: eq(users.role, "SUPER_ADMIN"),
    });

    if (existingAdmin) {
      testAdminUserId = existingAdmin.id;
    } else {
      const [newAdmin] = await db
        .insert(users)
        .values({
          fullName: "Admin Batch Tester",
          email: `admin-batch-${Date.now()}@oxygen.test`,
          phone: `017${Date.now().toString().slice(-8)}`,
          role: "SUPER_ADMIN",
        })
        .returning();
      testAdminUserId = newAdmin.id;
    }

    // 2. Seed customer user
    const [newCustomer] = await db
      .insert(users)
      .values({
        fullName: "Customer Batch Tester",
        email: `cust-batch-${Date.now()}@oxygen.test`,
        phone: `018${Date.now().toString().slice(-8)}`,
        role: "CUSTOMER",
      })
      .returning();
    testCustomerId = newCustomer.id;

    // 3. Generate Auth Tokens
    superAdminToken = await signAccessToken({
      sub: testAdminUserId,
      phone: "01700000001",
      role: "SUPER_ADMIN",
    });

    inventoryManagerToken = await signAccessToken({
      sub: testAdminUserId,
      phone: "01700000002",
      role: "INVENTORY_MANAGER",
    });

    customerToken = await signAccessToken({
      sub: testCustomerId,
      phone: "01800000003",
      role: "CUSTOMER",
    });

    marketingToken = await signAccessToken({
      sub: testAdminUserId,
      phone: "01700000004",
      role: "MARKETING_MANAGER",
    });

    // 4. Seed Category
    const [cat] = await db
      .insert(categories)
      .values({
        name: `Perishables Category ${Date.now()}`,
        slug: `perishables-cat-${Date.now()}`,
      })
      .returning();
    testCategoryId = cat.id;

    // 5. Seed Test Product
    const [prod] = await db
      .insert(products)
      .values({
        title: "Perishable Organic Baby Balm",
        slug: `perishable-organic-baby-balm-${Date.now()}`,
        categoryId: testCategoryId,
        description: "Organic baby balm with strict expiry tracking",
        basePrice: "550.00",
        costPrice: "350.00",
        images: ["https://images.unsplash.com/photo-baby-balm.jpg"],
        sku: `BALM-${Date.now().toString().slice(-6)}`,
        requiresBatchTracking: true,
        isActive: true,
      })
      .returning();
    testProductId = prod.id;

    // 6. Seed Batches with deliberate health statuses
    const now = new Date();
    const formatDate = (d: Date) => d.toISOString().split("T")[0];

    // EXPIRED: in the past
    const expiredDateStr = "2023-01-15";
    const [b1] = await db
      .insert(productBatches)
      .values({
        productId: testProductId,
        batchNumber: expiredBatchNumber,
        manufactureDate: "2022-01-01",
        expiryDate: expiredDateStr,
        initialQuantity: 20,
        availableQuantity: 15,
      })
      .returning();
    expiredBatchId = b1.id;

    // EXPIRING_SOON: within 15 days (< 30 days) and availableQuantity > 0
    const expiringSoonDate = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000);
    const expiringSoonDateStr = formatDate(expiringSoonDate);
    const [b2] = await db
      .insert(productBatches)
      .values({
        productId: testProductId,
        batchNumber: expiringSoonBatchNumber,
        manufactureDate: "2025-01-01",
        expiryDate: expiringSoonDateStr,
        initialQuantity: 30,
        availableQuantity: 25,
      })
      .returning();
    expiringSoonBatchId = b2.id;

    // HEALTHY: 90 days away (> 30 days)
    const healthyDate = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
    const healthyDateStr = formatDate(healthyDate);
    const [b3] = await db
      .insert(productBatches)
      .values({
        productId: testProductId,
        batchNumber: healthyBatchNumber,
        manufactureDate: "2025-05-01",
        expiryDate: healthyDateStr,
        initialQuantity: 50,
        availableQuantity: 50,
      })
      .returning();
    healthyBatchId = b3.id;

    // 7. Seed Stock History Logs for Audit Ledger tests
    await db.insert(stockHistoryLogs).values([
      {
        productId: testProductId,
        batchId: expiredBatchId,
        changeDelta: 20,
        balanceAfter: 20,
        reason: "IMPORT",
        note: "Initial expired batch import",
        performedByUserId: testAdminUserId,
      },
      {
        productId: testProductId,
        batchId: expiringSoonBatchId,
        changeDelta: 30,
        balanceAfter: 30,
        reason: "IMPORT",
        note: "Expiring soon batch import",
        performedByUserId: testAdminUserId,
      },
      {
        productId: testProductId,
        batchId: expiringSoonBatchId,
        changeDelta: -5,
        balanceAfter: 25,
        reason: "PURCHASE",
        note: "Order fulfillment allocation",
        performedByUserId: testAdminUserId,
      },
      {
        productId: testProductId,
        batchId: expiringSoonBatchId,
        changeDelta: 2,
        balanceAfter: 27,
        reason: "RETURN",
        note: "Customer return processed",
        performedByUserId: testAdminUserId,
      },
      {
        productId: testProductId,
        batchId: expiredBatchId,
        changeDelta: -5,
        balanceAfter: 15,
        reason: "MANUAL_ADJUSTMENT",
        note: "Damaged packaging correction",
        performedByUserId: testAdminUserId,
      },
      {
        productId: testProductId,
        batchId: expiredBatchId,
        changeDelta: -15,
        balanceAfter: 0,
        reason: "EXPIRED_SCRAP",
        note: "Perishable scrap clearance",
        performedByUserId: testAdminUserId,
      },
    ]);
  });

  // =========================================================================
  // 1. Batch Inspector & FEFO Status Calculations (GET /admin/batches)
  // =========================================================================
  describe("1. Batch Inspection Endpoint (GET /admin/batches)", () => {
    it("should return batch inspection list with FEFO calculations for SUPER_ADMIN", async () => {
      const res = await app.request("/admin/batches", {
        headers: { Authorization: `Bearer ${superAdminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(Array.isArray(json.data)).toBe(true);

      const items = json.data;
      const expiredItem = items.find(
        (b: any) => b.batchNumber === expiredBatchNumber,
      );
      const expiringSoonItem = items.find(
        (b: any) => b.batchNumber === expiringSoonBatchNumber,
      );
      const healthyItem = items.find(
        (b: any) => b.batchNumber === healthyBatchNumber,
      );

      expect(expiredItem).toBeDefined();
      expect(expiringSoonItem).toBeDefined();
      expect(healthyItem).toBeDefined();

      // Check Expired item
      expect(expiredItem.healthStatus).toBe("EXPIRED");
      expect(expiredItem.daysUntilExpiry).toBeLessThanOrEqual(0);
      expect(expiredItem.productTitle).toBe("Perishable Organic Baby Balm");
      expect(expiredItem.sku).toContain("BALM-");

      // Check Expiring Soon item
      expect(expiringSoonItem.healthStatus).toBe("EXPIRING_SOON");
      expect(expiringSoonItem.daysUntilExpiry).toBeGreaterThan(0);
      expect(expiringSoonItem.daysUntilExpiry).toBeLessThanOrEqual(30);
      expect(expiringSoonItem.availableQuantity).toBeGreaterThan(0);

      // Check Healthy item
      expect(healthyItem.healthStatus).toBe("HEALTHY");
      expect(healthyItem.daysUntilExpiry).toBeGreaterThan(30);
    });

    it("should allow INVENTORY_MANAGER to access GET /admin/batches", async () => {
      const res = await app.request("/admin/batches", {
        headers: { Authorization: `Bearer ${inventoryManagerToken}` },
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.length).toBeGreaterThanOrEqual(3);
    });

    it("should return complete batch schema fields (dates, quantities, sku, product title)", async () => {
      const res = await app.request("/admin/batches", {
        headers: { Authorization: `Bearer ${superAdminToken}` },
      });
      const json = await res.json();
      const batch = json.data.find(
        (b: any) => b.batchNumber === expiringSoonBatchNumber,
      );

      expect(batch).toBeDefined();
      expect(batch.id).toBeDefined();
      expect(batch.productId).toBe(testProductId);
      expect(batch.batchNumber).toBe(expiringSoonBatchNumber);
      expect(batch.productTitle).toBe("Perishable Organic Baby Balm");
      expect(batch.sku).toBeDefined();
      expect(batch.expiryDate).toBeDefined();
      expect(batch.initialQuantity).toBe(30);
      expect(batch.availableQuantity).toBe(25);
      expect(batch.daysUntilExpiry).toBeDefined();
      expect(batch.healthStatus).toBe("EXPIRING_SOON");
    });
  });

  // =========================================================================
  // 2. Batch Import (POST /admin/batches)
  // =========================================================================
  describe("2. Batch Import Endpoint (POST /admin/batches)", () => {
    it("should successfully import a new batch and create an audit ledger entry", async () => {
      const newBatchNumber = `B-IMPORT-${Date.now()}`;
      const payload = {
        productId: testProductId,
        batchNumber: newBatchNumber,
        manufactureDate: "2025-01-01",
        expiryDate: "2027-12-31",
        initialQuantity: 100,
      };

      const res = await app.request("/admin/batches", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${superAdminToken}`,
        },
        body: JSON.stringify(payload),
      });

      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.batchNumber).toBe(newBatchNumber);
      expect(json.data.initialQuantity).toBe(100);
      expect(json.data.availableQuantity).toBe(100);

      // Verify audit ledger entry was written
      const ledger = await batchInspectorService.getAuditLedger({
        productId: testProductId,
        reason: "IMPORT",
      });
      const importEntry = ledger.entries.find(
        (e) => e.batchNumber === newBatchNumber,
      );
      expect(importEntry).toBeDefined();
      expect(importEntry?.changeDelta).toBe(100);
      expect(importEntry?.balanceAfter).toBe(100);
      expect(importEntry?.reason).toBe("IMPORT");
    });

    it("should reject duplicate batch numbers with 409 Conflict", async () => {
      const payload = {
        productId: testProductId,
        batchNumber: healthyBatchNumber, // Already exists
        expiryDate: "2027-12-31",
        initialQuantity: 50,
      };

      const res = await app.request("/admin/batches", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${superAdminToken}`,
        },
        body: JSON.stringify(payload),
      });

      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain("already exists");
    });

    it("should reject batch import with past expiry date with 400 Bad Request", async () => {
      const payload = {
        productId: testProductId,
        batchNumber: `B-PAST-${Date.now()}`,
        expiryDate: "2020-01-01",
        initialQuantity: 50,
      };

      const res = await app.request("/admin/batches", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${superAdminToken}`,
        },
        body: JSON.stringify(payload),
      });

      expect(res.status).toBe(400);
    });
  });

  // =========================================================================
  // 3. Stock Audit Ledger (GET /admin/inventory/ledger)
  // =========================================================================
  describe("3. Stock Audit Ledger Endpoint (GET /admin/inventory/ledger)", () => {
    it("should return paginated stock history logs with total count", async () => {
      const res = await app.request("/admin/inventory/ledger?page=1&limit=3", {
        headers: { Authorization: `Bearer ${superAdminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.page).toBe(1);
      expect(json.limit).toBe(3);
      expect(json.total).toBeGreaterThanOrEqual(6);
      expect(json.entries.length).toBeLessThanOrEqual(3);
      expect(json.totalPages).toBeGreaterThanOrEqual(2);

      // Verify joined product and batch fields
      const entry = json.entries[0];
      expect(entry.id).toBeDefined();
      expect(entry.productId).toBeDefined();
      expect(entry.productTitle).toBeDefined();
      expect(entry.sku).toBeDefined();
      expect(entry.changeDelta).toBeDefined();
      expect(entry.balanceAfter).toBeDefined();
      expect(entry.reason).toBeDefined();
    });

    it("should filter audit ledger by productId", async () => {
      const res = await app.request(
        `/admin/inventory/ledger?productId=${testProductId}`,
        {
          headers: { Authorization: `Bearer ${superAdminToken}` },
        },
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.entries.length).toBeGreaterThan(0);
      for (const entry of json.entries) {
        expect(entry.productId).toBe(testProductId);
        expect(entry.productTitle).toBe("Perishable Organic Baby Balm");
      }
    });

    it("should filter audit ledger by reason (IMPORT, PURCHASE, RETURN, EXPIRED_SCRAP)", async () => {
      // Reason: IMPORT
      const resImport = await app.request(
        `/admin/inventory/ledger?productId=${testProductId}&reason=IMPORT`,
        { headers: { Authorization: `Bearer ${superAdminToken}` } },
      );
      expect(resImport.status).toBe(200);
      const jsonImport = await resImport.json();
      expect(jsonImport.entries.length).toBeGreaterThanOrEqual(2);
      for (const e of jsonImport.entries) {
        expect(e.reason).toBe("IMPORT");
      }

      // Reason: PURCHASE
      const resPurchase = await app.request(
        `/admin/inventory/ledger?productId=${testProductId}&reason=PURCHASE`,
        { headers: { Authorization: `Bearer ${superAdminToken}` } },
      );
      expect(resPurchase.status).toBe(200);
      const jsonPurchase = await resPurchase.json();
      expect(jsonPurchase.entries.length).toBe(1);
      expect(jsonPurchase.entries[0].reason).toBe("PURCHASE");
      expect(jsonPurchase.entries[0].changeDelta).toBe(-5);

      // Reason: RETURN
      const resReturn = await app.request(
        `/admin/inventory/ledger?productId=${testProductId}&reason=RETURN`,
        { headers: { Authorization: `Bearer ${superAdminToken}` } },
      );
      expect(resReturn.status).toBe(200);
      const jsonReturn = await resReturn.json();
      expect(jsonReturn.entries.length).toBe(1);
      expect(jsonReturn.entries[0].reason).toBe("RETURN");
      expect(jsonReturn.entries[0].changeDelta).toBe(2);

      // Reason: EXPIRED_SCRAP
      const resScrap = await app.request(
        `/admin/inventory/ledger?productId=${testProductId}&reason=EXPIRED_SCRAP`,
        { headers: { Authorization: `Bearer ${superAdminToken}` } },
      );
      expect(resScrap.status).toBe(200);
      const jsonScrap = await resScrap.json();
      expect(jsonScrap.entries.length).toBe(1);
      expect(jsonScrap.entries[0].reason).toBe("EXPIRED_SCRAP");
      expect(jsonScrap.entries[0].changeDelta).toBe(-15);
    });

    it("should support reason=ADJUSTMENT alias matching MANUAL_ADJUSTMENT logs", async () => {
      const res = await app.request(
        `/admin/inventory/ledger?productId=${testProductId}&reason=ADJUSTMENT`,
        { headers: { Authorization: `Bearer ${superAdminToken}` } },
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.entries.length).toBeGreaterThanOrEqual(1);
      for (const e of json.entries) {
        expect(e.reason).toBe("MANUAL_ADJUSTMENT");
      }
    });

    it("should allow INVENTORY_MANAGER with STOCK_ADJUST permission to access ledger", async () => {
      const res = await app.request("/admin/inventory/ledger", {
        headers: { Authorization: `Bearer ${inventoryManagerToken}` },
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.entries.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // 4. RBAC Authorization & Security Verification
  // =========================================================================
  describe("4. Security & RBAC Guarding", () => {
    it("should return 401 Unauthorized when unauthenticated on GET /admin/batches", async () => {
      const res = await app.request("/admin/batches");
      expect(res.status).toBe(401);
    });

    it("should return 401 Unauthorized when unauthenticated on GET /admin/inventory/ledger", async () => {
      const res = await app.request("/admin/inventory/ledger");
      expect(res.status).toBe(401);
    });

    it("should return 403 Forbidden when CUSTOMER accesses GET /admin/batches", async () => {
      const res = await app.request("/admin/batches", {
        headers: { Authorization: `Bearer ${customerToken}` },
      });
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain("Forbidden");
    });

    it("should return 403 Forbidden when CUSTOMER accesses GET /admin/inventory/ledger", async () => {
      const res = await app.request("/admin/inventory/ledger", {
        headers: { Authorization: `Bearer ${customerToken}` },
      });
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain("Forbidden");
    });

    it("should return 403 Forbidden when CUSTOMER accesses POST /admin/batches", async () => {
      const res = await app.request("/admin/batches", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${customerToken}`,
        },
        body: JSON.stringify({
          productId: testProductId,
          batchNumber: "B-FORBIDDEN-01",
          expiryDate: "2027-01-01",
          initialQuantity: 10,
        }),
      });
      expect(res.status).toBe(403);
    });

    it("should return 403 Forbidden when MARKETING_MANAGER accesses GET /admin/batches", async () => {
      const res = await app.request("/admin/batches", {
        headers: { Authorization: `Bearer ${marketingToken}` },
      });
      expect(res.status).toBe(403);
    });

    it("should return 403 Forbidden when MARKETING_MANAGER accesses GET /admin/inventory/ledger", async () => {
      const res = await app.request("/admin/inventory/ledger", {
        headers: { Authorization: `Bearer ${marketingToken}` },
      });
      expect(res.status).toBe(403);
    });
  });

  // =========================================================================
  // 5. Unit Level Calculation & Service Logic
  // =========================================================================
  describe("5. Unit Health Status Calculation Logic", () => {
    const fixedNow = new Date("2026-09-22T00:00:00.000Z");

    it("should label batches expired on or before today as EXPIRED", () => {
      // Before today
      const past = calculateBatchHealth("2026-09-20", 10, fixedNow);
      expect(past.healthStatus).toBe("EXPIRED");
      expect(past.daysUntilExpiry).toBe(-2);

      // Exactly today
      const today = calculateBatchHealth("2026-09-22", 10, fixedNow);
      expect(today.healthStatus).toBe("EXPIRED");
      expect(today.daysUntilExpiry).toBe(0);
    });

    it("should label batches expiring within 30 days with qty > 0 as EXPIRING_SOON", () => {
      // 1 day away
      const day1 = calculateBatchHealth("2026-09-23", 5, fixedNow);
      expect(day1.healthStatus).toBe("EXPIRING_SOON");
      expect(day1.daysUntilExpiry).toBe(1);

      // 30 days away exactly
      const day30 = calculateBatchHealth("2026-10-22", 20, fixedNow);
      expect(day30.healthStatus).toBe("EXPIRING_SOON");
      expect(day30.daysUntilExpiry).toBe(30);
    });

    it("should label batches expiring within 30 days with 0 available quantity as HEALTHY", () => {
      const zeroQty = calculateBatchHealth("2026-10-10", 0, fixedNow);
      expect(zeroQty.healthStatus).toBe("HEALTHY");
    });

    it("should label batches expiring after 30 days as HEALTHY", () => {
      // 31 days away
      const day31 = calculateBatchHealth("2026-10-23", 50, fixedNow);
      expect(day31.healthStatus).toBe("HEALTHY");
      expect(day31.daysUntilExpiry).toBe(31);

      // 100 days away
      const day100 = calculateBatchHealth("2026-12-31", 100, fixedNow);
      expect(day100.healthStatus).toBe("HEALTHY");
      expect(day100.daysUntilExpiry).toBe(100);
    });
  });
});
