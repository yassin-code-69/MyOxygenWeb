import { describe, it, expect, beforeAll } from "bun:test";
import { app } from "../index";
import { db } from "../db";
import {
  categories,
  orders,
  productBatches,
  products,
  stockHistoryLogs,
  users,
} from "../db/schema/tables";
import { eq } from "drizzle-orm";
import { signAccessToken } from "../lib/jwt";
import { orderService } from "../services/order.service";

describe("Admin Orders & Telemetry API", () => {
  let customerUserId: string;
  let adminUserId: string;
  let adminToken: string;
  let orderManagerToken: string;
  let customerToken: string;

  let testCategoryId: string;
  let testProductId: string;
  let testBatchId: string;
  let testOrderId: string;

  beforeAll(async () => {
    // 1. Seed or retrieve customer user
    const [existingCustomer] = await db
      .select()
      .from(users)
      .where(eq(users.role, "CUSTOMER"))
      .limit(1);

    if (existingCustomer) {
      customerUserId = existingCustomer.id;
    } else {
      const [newCustomer] = await db
        .insert(users)
        .values({
          fullName: "Admin Orders Customer",
          email: `admin-order-cust-${Date.now()}@myoxygen.com`,
          phone: `017${Math.floor(10000000 + Math.random() * 90000000)}`,
          passwordHash: "hashed",
          role: "CUSTOMER",
        })
        .returning();
      customerUserId = newCustomer.id;
    }

    // 2. Seed or retrieve admin user
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
          fullName: "Admin Orders SuperAdmin",
          email: `admin-order-super-${Date.now()}@myoxygen.com`,
          phone: `018${Math.floor(10000000 + Math.random() * 90000000)}`,
          passwordHash: "hashed",
          role: "SUPER_ADMIN",
        })
        .returning();
      adminUserId = newAdmin.id;
    }

    // 3. Issue tokens
    adminToken = await signAccessToken({
      sub: adminUserId,
      role: "SUPER_ADMIN",
      phone: "01800000001",
    });

    orderManagerToken = await signAccessToken({
      sub: adminUserId,
      role: "ORDER_MANAGER",
      phone: "01800000002",
    });

    customerToken = await signAccessToken({
      sub: customerUserId,
      role: "CUSTOMER",
      phone: "01700000001",
    });

    // 4. Seed Category
    const [cat] = await db
      .insert(categories)
      .values({
        name: `Admin Telemetry Cat ${Date.now()}`,
        slug: `admin-telemetry-cat-${Date.now()}`,
      })
      .returning();
    testCategoryId = cat.id;

    // 5. Seed Product
    const [prod] = await db
      .insert(products)
      .values({
        title: "Admin Test Diaper Pack",
        slug: `admin-test-diaper-pack-${Date.now()}`,
        categoryId: testCategoryId,
        description: "Hypoallergenic diapers for newborn babies",
        basePrice: "500.00",
        costPrice: "350.00",
        images: ["https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4"],
        sku: `DIAPER-${Date.now().toString().slice(-6)}`,
        requiresBatchTracking: true,
        lowStockThreshold: 5,
        isActive: true,
      })
      .returning();
    testProductId = prod.id;

    // 6. Seed Batch with 25 units expiring in 2027
    const [batch] = await db
      .insert(productBatches)
      .values({
        productId: testProductId,
        batchNumber: `BAT-ADMIN-${Date.now()}`,
        manufactureDate: "2025-01-01",
        expiryDate: "2027-12-31",
        initialQuantity: 25,
        availableQuantity: 25,
      })
      .returning();
    testBatchId = batch.id;

    // 7. Place initial test order
    const createdOrder = await orderService.createOrder(
      {
        shippingAddress: {
          fullName: "Rahim Al Mamun",
          phone: "01712345678",
          addressLine1: "House 24, Road 7, Sector 4, Uttara",
          city: "Dhaka",
          district: "Dhaka",
          postalCode: "1230",
        },
        items: [{ productId: testProductId, quantity: 2 }],
        paymentMethod: "CASH_ON_DELIVERY",
      },
      customerUserId,
    );
    testOrderId = createdOrder.id;
  }, 30000);

  describe("1. Admin Telemetry Summary (GET /admin/analytics/summary)", () => {
    it("should return complete telemetry summary with revenue and order metrics", async () => {
      const res = await app.request("/admin/analytics/summary", {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data).toBeDefined();

      const summary = json.data;

      // Check totalRevenue
      expect(typeof summary.totalRevenue).toBe("number");
      expect(summary.totalRevenue).toBeGreaterThanOrEqual(0);

      // Check totalOrders
      expect(typeof summary.totalOrders).toBe("number");
      expect(summary.totalOrders).toBeGreaterThanOrEqual(1);

      // Check ordersByStatus counts
      expect(summary.ordersByStatus).toBeDefined();
      expect(typeof summary.ordersByStatus.PENDING).toBe("number");
      expect(typeof summary.ordersByStatus.PROCESSING).toBe("number");
      expect(typeof summary.ordersByStatus.SHIPPED).toBe("number");
      expect(typeof summary.ordersByStatus.DELIVERED).toBe("number");
      expect(typeof summary.ordersByStatus.CANCELLED).toBe("number");
      expect(summary.ordersByStatus.PENDING).toBeGreaterThanOrEqual(1);

      // Check inventory metrics
      expect(typeof summary.lowStockCount).toBe("number");
      expect(summary.lowStockCount).toBeGreaterThanOrEqual(0);
      expect(typeof summary.expiringSoonCount).toBe("number");
      expect(summary.expiringSoonCount).toBeGreaterThanOrEqual(0);

      // Check 7-day dailyRevenue aggregation
      expect(Array.isArray(summary.dailyRevenue)).toBe(true);
      expect(summary.dailyRevenue.length).toBe(7);

      for (const day of summary.dailyRevenue) {
        expect(day.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(typeof day.revenue).toBe("number");
        expect(typeof day.orderCount).toBe("number");
      }

      // Today's entry should record the order we created
      const today = new Date().toISOString().split("T")[0];
      const todayEntry = summary.dailyRevenue.find((d: any) => d.date === today);
      expect(todayEntry).toBeDefined();
      expect(todayEntry!.orderCount).toBeGreaterThanOrEqual(1);
    }, 30000);

    it("should allow ORDER_MANAGER role with ANALYTICS_READ permission to view summary", async () => {
      const res = await app.request("/admin/analytics/summary", {
        headers: {
          Authorization: `Bearer ${orderManagerToken}`,
        },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
    }, 30000);
  });

  describe("2. Admin Orders Listing & Pagination (GET /admin/orders)", () => {
    it("should retrieve paginated orders with customer info and order items", async () => {
      const res = await app.request("/admin/orders", {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(Array.isArray(json.data)).toBe(true);
      expect(json.data.length).toBeGreaterThanOrEqual(1);

      // Check pagination structure
      expect(json.pagination).toBeDefined();
      expect(json.pagination.page).toBe(1);
      expect(json.pagination.limit).toBe(10);
      expect(typeof json.pagination.total).toBe("number");
      expect(json.pagination.total).toBeGreaterThanOrEqual(1);
      expect(typeof json.pagination.totalPages).toBe("number");

      // Verify order contents
      const order = json.data.find((o: any) => o.id === testOrderId);
      expect(order).toBeDefined();
      expect(order.orderNumber).toStartWith("ORD-");
      expect(order.user).toBeDefined();
      expect(order.user.id).toBe(customerUserId);
      expect(typeof order.user.fullName).toBe("string");
      expect(typeof order.user.phone).toBe("string");

      // Verify items with product information
      expect(Array.isArray(order.items)).toBe(true);
      expect(order.items.length).toBeGreaterThanOrEqual(1);
      const item = order.items[0];
      expect(item.product).toBeDefined();
      expect(item.product.title).toBe("Admin Test Diaper Pack");
      expect(item.batchId).toBe(testBatchId);
    });

    it("should handle custom pagination limit and page query parameters", async () => {
      const res = await app.request("/admin/orders?page=1&limit=2", {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.length).toBeLessThanOrEqual(2);
      expect(json.pagination.limit).toBe(2);
      expect(json.pagination.page).toBe(1);
    });

    it("should filter orders by status", async () => {
      const res = await app.request("/admin/orders?status=PENDING", {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      for (const ord of json.data) {
        expect(ord.status).toBe("PENDING");
      }
    });
  });

  describe("3. Order Status Transition & Stock Release on CANCELLED (PATCH /admin/orders/:id/status)", () => {
    let cancelTestOrderId: string;
    let cancelTestBatchId: string;
    let cancelTestProductId: string;

    beforeAll(async () => {
      // Create product specifically for cancellation test
      const [p] = await db
        .insert(products)
        .values({
          title: "Cancellation Test Product",
          slug: `cancel-test-prod-${Date.now()}`,
          categoryId: testCategoryId,
          description: "Testing cancellation inventory return",
          basePrice: "300.00",
          costPrice: "200.00",
          images: ["https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4"],
          sku: `CANCEL-${Date.now().toString().slice(-6)}`,
          requiresBatchTracking: true,
          lowStockThreshold: 5,
          isActive: true,
        })
        .returning();
      cancelTestProductId = p.id;

      // Seed batch with 20 units
      const [b] = await db
        .insert(productBatches)
        .values({
          productId: cancelTestProductId,
          batchNumber: `BAT-CANCEL-${Date.now()}`,
          manufactureDate: "2025-01-01",
          expiryDate: "2028-01-01",
          initialQuantity: 20,
          availableQuantity: 20,
        })
        .returning();
      cancelTestBatchId = b.id;

      // Order 6 units -> availableQuantity should decrement from 20 to 14
      const order = await orderService.createOrder(
        {
          shippingAddress: {
            fullName: "Cancel Test User",
            phone: "01822334455",
            addressLine1: "Dhanmondi 27",
            city: "Dhaka",
            district: "Dhaka",
            postalCode: "1209",
          },
          items: [{ productId: cancelTestProductId, quantity: 6 }],
          paymentMethod: "CASH_ON_DELIVERY",
        },
        customerUserId,
      );
      cancelTestOrderId = order.id;

      // Verify stock was decremented to 14
      const [batchBefore] = await db
        .select()
        .from(productBatches)
        .where(eq(productBatches.id, cancelTestBatchId));
      expect(batchBefore.availableQuantity).toBe(14);
    }, 30000);

    it("should update status to PROCESSING without releasing stock", async () => {
      const res = await app.request(
        `/admin/orders/${cancelTestOrderId}/status`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${adminToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ status: "PROCESSING" }),
        },
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.status).toBe("PROCESSING");

      // Verify stock remains 14
      const [batchAfter] = await db
        .select()
        .from(productBatches)
        .where(eq(productBatches.id, cancelTestBatchId));
      expect(batchAfter.availableQuantity).toBe(14);
    });

    it("should transition order to CANCELLED and restore reserved batch stock", async () => {
      const res = await app.request(
        `/admin/orders/${cancelTestOrderId}/status`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${adminToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ status: "CANCELLED" }),
        },
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.status).toBe("CANCELLED");

      // Verify batch stock was restored: 14 + 6 = 20
      const [batchRestored] = await db
        .select()
        .from(productBatches)
        .where(eq(productBatches.id, cancelTestBatchId));
      expect(batchRestored.availableQuantity).toBe(20);

      // Verify RETURN entry in stock audit ledger
      const returnLogs = await db
        .select()
        .from(stockHistoryLogs)
        .where(eq(stockHistoryLogs.batchId, cancelTestBatchId));

      const returnEntry = returnLogs.find((l) => l.reason === "RETURN");
      expect(returnEntry).toBeDefined();
      expect(returnEntry!.changeDelta).toBe(6);
      expect(returnEntry!.balanceAfter).toBe(20);
      expect(returnEntry!.note).toContain(cancelTestOrderId);
    }, 30000);

    it("should reject cancelling an order that is already CANCELLED", async () => {
      const res = await app.request(
        `/admin/orders/${cancelTestOrderId}/status`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${adminToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ status: "CANCELLED" }),
        },
      );

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain("already cancelled");
    });
  });

  describe("4. Courier Dispatch (POST /admin/orders/:id/dispatch-courier)", () => {
    let dispatchOrderId: string;

    beforeAll(async () => {
      const order = await orderService.createOrder(
        {
          shippingAddress: {
            fullName: "Courier Receiver",
            phone: "01788776655",
            addressLine1: "Banani 11",
            city: "Dhaka",
            district: "Dhaka",
            postalCode: "1213",
          },
          items: [{ productId: testProductId, quantity: 1 }],
          paymentMethod: "CASH_ON_DELIVERY",
        },
        customerUserId,
      );
      dispatchOrderId = order.id;
    }, 30000);

    it("should dispatch order to Steadfast, assign trackingId, and update status to SHIPPED", async () => {
      const res = await app.request(
        `/admin/orders/${dispatchOrderId}/dispatch-courier`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${adminToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            note: "Fragile skincare package",
          }),
        },
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.status).toBe("SHIPPED");
      expect(json.data.trackingId).toStartWith("STF-");
      expect(json.data.courierProvider).toBe("STEADFAST");

      // Verify DB persistence
      const [dbOrder] = await db
        .select()
        .from(orders)
        .where(eq(orders.id, dispatchOrderId));

      expect(dbOrder.status).toBe("SHIPPED");
      expect(dbOrder.trackingId).toBe(json.data.trackingId);
      expect(dbOrder.courierProvider).toBe("STEADFAST");
    });

    it("should reject dispatching a cancelled order", async () => {
      // Create and cancel an order
      const cancelledOrder = await orderService.createOrder(
        {
          shippingAddress: {
            fullName: "Cancelled Dispatch",
            phone: "01799887766",
            addressLine1: "Gulshan 1",
            city: "Dhaka",
            district: "Dhaka",
            postalCode: "1212",
          },
          items: [{ productId: testProductId, quantity: 1 }],
          paymentMethod: "CASH_ON_DELIVERY",
        },
        customerUserId,
      );

      await app.request(`/admin/orders/${cancelledOrder.id}/status`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: "CANCELLED" }),
      });

      const res = await app.request(
        `/admin/orders/${cancelledOrder.id}/dispatch-courier`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${adminToken}`,
          },
        },
      );

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain("cancelled");
    }, 30000);
  });

  describe("5. Role-Based Access Control (RBAC) Guard Verification", () => {
    it("should reject customer token on GET /admin/analytics/summary with 403 Forbidden", async () => {
      const res = await app.request("/admin/analytics/summary", {
        headers: {
          Authorization: `Bearer ${customerToken}`,
        },
      });
      expect(res.status).toBe(403);
    });

    it("should reject customer token on GET /admin/orders with 403 Forbidden", async () => {
      const res = await app.request("/admin/orders", {
        headers: {
          Authorization: `Bearer ${customerToken}`,
        },
      });
      expect(res.status).toBe(403);
    });

    it("should reject customer token on PATCH /admin/orders/:id/status with 403 Forbidden", async () => {
      const res = await app.request(`/admin/orders/${testOrderId}/status`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${customerToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: "DELIVERED" }),
      });
      expect(res.status).toBe(403);
    });

    it("should reject customer token on POST /admin/orders/:id/dispatch-courier with 403 Forbidden", async () => {
      const res = await app.request(
        `/admin/orders/${testOrderId}/dispatch-courier`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${customerToken}`,
          },
        },
      );
      expect(res.status).toBe(403);
    });

    it("should reject unauthenticated request with 401 Unauthorized", async () => {
      const res = await app.request("/admin/orders");
      expect(res.status).toBe(401);
    });
  });
});
