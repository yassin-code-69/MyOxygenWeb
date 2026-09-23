import { describe, it, expect, beforeAll } from "bun:test";
import { app } from "../index";
import { db } from "../db";
import {
  categories,
  orders,
  productBatches,
  products,
  users,
  invoices,
} from "../db/schema/tables";
import { eq } from "drizzle-orm";
import { signAccessToken } from "../lib/jwt";
import { orderService } from "../services/order.service";
import { invoiceService } from "../services/invoice/invoice.service";

describe("Admin Invoices Management & DB Storage API", () => {
  let customerUserId: string;
  let adminUserId: string;
  let adminToken: string;
  let customerToken: string;

  let testOrderId: string;
  let testOrderNumber: string;
  let testInvoiceId: string;

  beforeAll(async () => {
    // 1. Get or create customer user
    const [existingCust] = await db
      .select()
      .from(users)
      .where(eq(users.role, "CUSTOMER"))
      .limit(1);

    if (existingCust) {
      customerUserId = existingCust.id;
    } else {
      const [newCust] = await db
        .insert(users)
        .values({
          fullName: "Invoice Test Customer",
          email: `inv-cust-${Date.now()}@myoxygen.com`,
          phone: `017${Math.floor(10000000 + Math.random() * 90000000)}`,
          passwordHash: "hash",
          role: "CUSTOMER",
        })
        .returning();
      customerUserId = newCust.id;
    }

    // 2. Get or create admin user
    const [existingAdmin] = await db
      .select()
      .from(users)
      .where(eq(users.role, "SUPER_ADMIN"))
      .limit(1);

    if (existingAdmin) {
      adminUserId = existingAdmin.id;
    } else {
      const [newAdmin] = await db
        .insert(users)
        .values({
          fullName: "Invoice SuperAdmin",
          email: `inv-admin-${Date.now()}@myoxygen.com`,
          phone: `018${Math.floor(10000000 + Math.random() * 90000000)}`,
          passwordHash: "hash",
          role: "SUPER_ADMIN",
        })
        .returning();
      adminUserId = newAdmin.id;
    }

    // 3. Issue tokens
    adminToken = await signAccessToken({
      sub: adminUserId,
      role: "SUPER_ADMIN",
      phone: "01800000099",
    });

    customerToken = await signAccessToken({
      sub: customerUserId,
      role: "CUSTOMER",
      phone: "01700000099",
    });

    // 4. Create a test category, product, batch and order
    const [cat] = await db
      .insert(categories)
      .values({
        name: `Inv Cat ${Date.now()}`,
        slug: `inv-cat-${Date.now()}`,
      })
      .returning();

    const [prod] = await db
      .insert(products)
      .values({
        categoryId: cat.id,
        title: "Invoice Gentle Cleanser",
        slug: `inv-cleanser-${Date.now()}`,
        sku: `INV-CLEAN-${Date.now()}`,
        description: "Gentle baby cleanser",
        basePrice: "950.00",
        costPrice: "500.00",
        images: ["https://example.com/cleanser.jpg"],
      })
      .returning();

    const [batch] = await db
      .insert(productBatches)
      .values({
        productId: prod.id,
        batchNumber: `BATCH-${Date.now()}`,
        expiryDate: "2027-12-31",
        initialQuantity: 100,
        availableQuantity: 100,
      })
      .returning();

    const order = await orderService.createOrder(
      {
        items: [{ productId: prod.id, quantity: 2 }],
        paymentMethod: "CASH_ON_DELIVERY",
        shippingAddress: {
          recipientName: "Jaber Ahmed",
          phone: "01711223344",
          addressLine1: "House 12, Road 5",
          city: "Dhaka",
          postalCode: "1212",
        },
      },
      customerUserId,
      db,
    );

    testOrderId = order.id;
    testOrderNumber = order.orderNumber;

    // Persist invoice directly in DB using invoiceService
    const fullOrder = await orderService.getOrderByIdOrNumber(order.id, db);
    const { invoice } = await invoiceService.generateAndSaveInvoice(fullOrder as any);
    testInvoiceId = invoice.id;
  });

  describe("1. Access Control & RBAC Guarding", () => {
    it("should return 401 Unauthorized if no token provided", async () => {
      const res = await app.request("/admin/invoices");
      expect(res.status).toBe(401);
    });

    it("should return 403 Forbidden when CUSTOMER accesses /admin/invoices", async () => {
      const res = await app.request("/admin/invoices", {
        headers: { Authorization: `Bearer ${customerToken}` },
      });
      expect(res.status).toBe(403);
    });

    it("should allow SUPER_ADMIN to access /admin/invoices", async () => {
      const res = await app.request("/admin/invoices", {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(Array.isArray(json.data.items)).toBe(true);
      expect(json.data.summary).toBeDefined();
    });
  });

  describe("2. Invoices Listing & Filtering", () => {
    it("should return paginated invoices with summary statistics", async () => {
      const res = await app.request("/admin/invoices?page=1&limit=5", {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.items.length).toBeGreaterThanOrEqual(1);
      expect(json.data.pagination.page).toBe(1);
      expect(json.data.summary.totalInvoices).toBeGreaterThanOrEqual(1);
      expect(Number(json.data.summary.totalBilledAmount)).toBeGreaterThan(0);
    });

    it("should filter invoices by search query matching customer phone or name", async () => {
      const res = await app.request("/admin/invoices?q=01711223344", {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.items.length).toBeGreaterThanOrEqual(1);
      expect(json.data.items[0].customerPhone).toBe("01711223344");
    });
  });

  describe("3. Invoice Details & Line Items Breakdown", () => {
    it("should retrieve full invoice breakdown by invoice ID", async () => {
      const res = await app.request(`/admin/invoices/${testInvoiceId}`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.id).toBe(testInvoiceId);
      expect(json.data.customerName).toBe("Jaber Ahmed");
      expect(json.data.hasPdf).toBe(true);
      expect(Array.isArray(json.data.itemsSnapshot)).toBe(true);
      expect(json.data.itemsSnapshot.length).toBe(1);
      expect(json.data.itemsSnapshot[0].quantity).toBe(2);
    });

    it("should return 404 for non-existent invoice ID", async () => {
      const res = await app.request("/admin/invoices/00000000-0000-0000-0000-000000000000", {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(404);
    });
  });

  describe("4. Pure Database PDF Streaming (Zero-Disk)", () => {
    it("should stream binary PDF directly from PostgreSQL database", async () => {
      const res = await app.request(`/admin/invoices/${testInvoiceId}/pdf`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("application/pdf");
      const disposition = res.headers.get("Content-Disposition") || "";
      expect(disposition).toContain("inline");
      expect(disposition).toContain(".pdf");

      const arrayBuffer = await res.arrayBuffer();
      const uint8 = new Uint8Array(arrayBuffer);
      const header = new TextDecoder().decode(uint8.subarray(0, 5));
      expect(header).toBe("%PDF-");
    });

    it("should stream customer order invoice endpoint /orders/:id/invoice from database", async () => {
      const res = await app.request(`/orders/${testOrderId}/invoice`, {
        headers: { Authorization: `Bearer ${customerToken}` },
      });

      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("application/pdf");
      const arrayBuffer = await res.arrayBuffer();
      const uint8 = new Uint8Array(arrayBuffer);
      const header = new TextDecoder().decode(uint8.subarray(0, 5));
      expect(header).toBe("%PDF-");
    });
  });

  describe("5. On-Demand Invoice Generation", () => {
    it("should generate/regenerate invoice for an order via POST /admin/invoices/generate/:orderId", async () => {
      const res = await app.request(`/admin/invoices/generate/${testOrderId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.orderId).toBe(testOrderId);
      expect(json.data.invoiceNumber).toBeDefined();
    });
  });
});
