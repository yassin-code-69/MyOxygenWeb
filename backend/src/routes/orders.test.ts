import { describe, it, expect, beforeAll } from "bun:test";
import { shippingAddressSchema, validateCouponSchema, checkoutSchema } from "./orders.schema";
import { couponService } from "../services/coupon.service";
import { orderService } from "../services/order.service";
import { inventoryService } from "../services/inventory.service";
import { db } from "../db";
import { products, productBatches, discounts, users, categories, orders, orderItems, stockHistoryLogs } from "../db/schema/tables";
import { eq } from "drizzle-orm";
import { signAccessToken } from "../lib/jwt";
import { app } from "../index";

describe("Phase 7: Purchase Funnel, Coupon Validation & Orders API", () => {
  let testUserId: string;
  let testCategoryId: string;
  let testProductId: string;
  let testBatch1Id: string;
  let testBatch2Id: string;
  let testCouponCode: string;
  let expiredCouponCode: string;

  beforeAll(async () => {
    // 1. Seed or retrieve a test user
    const existingUser = await db.select().from(users).limit(1);
    if (existingUser.length > 0) {
      testUserId = existingUser[0].id;
    } else {
      const [newUser] = await db
        .insert(users)
        .values({
          fullName: "Customer Funnel Test",
          email: "funnel-customer@myoxygen.com",
          phone: "01711223344",
          passwordHash: "hashed",
          role: "CUSTOMER",
        })
        .returning();
      testUserId = newUser.id;
    }

    // 2. Seed test category
    const [cat] = await db
      .insert(categories)
      .values({
        name: `Funnel Cat ${Date.now()}`,
        slug: `funnel-cat-${Date.now()}`,
      })
      .returning();
    testCategoryId = cat.id;

    // 3. Seed test product
    const [prod] = await db
      .insert(products)
      .values({
        title: "Baby Protective Lotion",
        slug: `baby-protective-lotion-${Date.now()}`,
        categoryId: testCategoryId,
        description: "A gentle protective lotion for newborns and toddlers",
        basePrice: "400.00",
        costPrice: "250.00",
        images: ["https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4"],
        sku: `LOTION-${Date.now().toString().slice(-6)}`,
        requiresBatchTracking: true,
        isActive: true,
      })
      .returning();
    testProductId = prod.id;

    // 4. Seed batches with FEFO dates
    // Batch 1 expires earlier: 2026-12-01, qty 10
    const [b1] = await db
      .insert(productBatches)
      .values({
        productId: testProductId,
        batchNumber: `B-EARLY-${Date.now()}`,
        manufactureDate: "2025-01-01",
        expiryDate: "2026-12-01",
        initialQuantity: 10,
        availableQuantity: 10,
      })
      .returning();
    testBatch1Id = b1.id;

    // Batch 2 expires later: 2027-06-01, qty 20
    const [b2] = await db
      .insert(productBatches)
      .values({
        productId: testProductId,
        batchNumber: `B-LATE-${Date.now()}`,
        manufactureDate: "2025-06-01",
        expiryDate: "2027-06-01",
        initialQuantity: 20,
        availableQuantity: 20,
      })
      .returning();
    testBatch2Id = b2.id;

    // 5. Seed coupons: Active 10% discount and Expired discount
    testCouponCode = `SAVE10-${Date.now()}`;
    await db.insert(discounts).values({
      code: testCouponCode,
      type: "PERCENTAGE",
      value: "10.00",
      startsAt: new Date(Date.now() - 3600000),
      endsAt: new Date(Date.now() + 86400000),
      isActive: true,
    });

    expiredCouponCode = `EXPIRED-${Date.now()}`;
    await db.insert(discounts).values({
      code: expiredCouponCode,
      type: "FIXED_AMOUNT",
      value: "50.00",
      startsAt: new Date(Date.now() - 86400000 * 5),
      endsAt: new Date(Date.now() - 86400000),
      isActive: true,
    });
  });

  describe("1. Schema Validations (Bangladesh Phone & Address Rules)", () => {
    it("should accept valid Bangladeshi phone numbers", () => {
      const validNumbers = [
        "01712345678",
        "+8801812345678",
        "8801912345678",
        "01300000000",
        "01699999999",
      ];
      for (const phone of validNumbers) {
        const result = shippingAddressSchema.safeParse({
          fullName: "Rahim Uddin",
          phone,
          addressLine1: "House 12, Road 4, Dhanmondi",
          city: "Dhaka",
          district: "Dhaka",
          postalCode: "1205",
        });
        expect(result.success).toBe(true);
      }
    });

    it("should reject invalid phone numbers", () => {
      const invalidNumbers = [
        "01112345678", // operator 1 is invalid in BD mobile (valid: 3-9)
        "12345678",    // too short
        "+14155552671", // US number
        "0171234567",  // 10 digits instead of 11
        "abcdefghijk", // non-numeric
      ];
      for (const phone of invalidNumbers) {
        const result = shippingAddressSchema.safeParse({
          fullName: "Rahim Uddin",
          phone,
          addressLine1: "House 12, Road 4, Dhanmondi",
          city: "Dhaka",
          district: "Dhaka",
          postalCode: "1205",
        });
        expect(result.success).toBe(false);
      }
    });

    it("should validate 4-digit Bangladesh postal code", () => {
      const valid = shippingAddressSchema.safeParse({
        fullName: "Karim",
        phone: "01812345678",
        addressLine1: "Agrabad C/A",
        city: "Chittagong",
        district: "Chittagong",
        postalCode: "4100",
      });
      expect(valid.success).toBe(true);

      const invalid = shippingAddressSchema.safeParse({
        fullName: "Karim",
        phone: "01812345678",
        addressLine1: "Agrabad C/A",
        city: "Chittagong",
        district: "Chittagong",
        postalCode: "410", // 3 digits
      });
      expect(invalid.success).toBe(false);
    });
  });

  describe("2. Coupon Engine & Discount Calculation", () => {
    it("should successfully validate an active coupon code and calculate discount", async () => {
      const items = [{ productId: testProductId, quantity: 2, unitPrice: 400 }];
      const res = await couponService.validateCouponForCart(testCouponCode, items);

      expect(res.isValid).toBe(true);
      expect(res.code).toBe(testCouponCode);
      expect(res.type).toBe("PERCENTAGE");
      expect(res.value).toBe(10);
      expect(res.subtotal).toBe(800);
      expect(res.discountAmount).toBe(80); // 10% of 800
      expect(res.finalTotal).toBe(720);
    });

    it("should reject expired coupon codes", async () => {
      const items = [{ productId: testProductId, quantity: 1, unitPrice: 400 }];
      expect(
        couponService.validateCouponForCart(expiredCouponCode, items),
      ).rejects.toThrow("Coupon has expired");
    });

    it("should reject non-existent coupon codes", async () => {
      const items = [{ productId: testProductId, quantity: 1, unitPrice: 400 }];
      expect(
        couponService.validateCouponForCart("NONEXISTENTCODE", items),
      ).rejects.toThrow("Coupon not found");
    });
  });

  describe("3. Order Placement & Transactional FEFO Batch Deduction", () => {
    it(
      "should place an order, apply FEFO reservation, and calculate shipping correctly",
      async () => {
      // Order 12 items: 10 should come from Batch 1 (earliest), 2 from Batch 2
      const checkoutPayload = {
        shippingAddress: {
          fullName: "Ayesha Rahman",
          phone: "01799887766",
          addressLine1: "Flat 4B, Green Road",
          city: "Dhaka",
          district: "Dhaka",
          postalCode: "1205",
        },
        items: [{ productId: testProductId, quantity: 12 }],
        paymentMethod: "CASH_ON_DELIVERY" as const,
        couponCode: testCouponCode,
      };

      const order = await orderService.createOrder(checkoutPayload, testUserId);

      expect(order).toBeDefined();
      expect(order.orderNumber).toStartWith("ORD-");
      expect(order.status).toBe("PENDING");
      expect(order.paymentStatus).toBe("UNPAID");

      // Subtotal: 12 * 400 = 4800
      // 4800 >= 1500 => free delivery (deliveryFee: 0)
      // Discount: 10% of 4800 = 480
      // Total: 4800 - 480 = 4320
      expect(parseFloat(order.subtotal)).toBe(4800);
      expect(parseFloat(order.deliveryFee)).toBe(0);
      expect(parseFloat(order.discountAmount)).toBe(480);
      expect(parseFloat(order.total)).toBe(4320);

      // Verify batch deductions:
      // Batch 1 had 10 -> should now be 0
      const [b1After] = await db
        .select()
        .from(productBatches)
        .where(eq(productBatches.id, testBatch1Id));
      expect(b1After.availableQuantity).toBe(0);

      // Batch 2 had 20 -> 2 allocated -> should now be 18
      const [b2After] = await db
        .select()
        .from(productBatches)
        .where(eq(productBatches.id, testBatch2Id));
      expect(b2After.availableQuantity).toBe(18);

      // Verify order line items
      const items = await db
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, order.id));
      expect(items.length).toBe(2); // split across 2 batches

      const batch1Allocation = items.find((i) => i.batchId === testBatch1Id);
      const batch2Allocation = items.find((i) => i.batchId === testBatch2Id);
      expect(batch1Allocation?.quantity).toBe(10);
      expect(batch2Allocation?.quantity).toBe(2);
    }, 30000);

    it("should charge ৳60 delivery fee when order subtotal is below ৳1,500", async () => {
      const checkoutPayload = {
        shippingAddress: {
          fullName: "Tahmina Akter",
          phone: "01855667788",
          addressLine1: "House 5, Mirpur 10",
          city: "Dhaka",
          district: "Dhaka",
          postalCode: "1216",
        },
        items: [{ productId: testProductId, quantity: 2 }], // 2 * 400 = 800 (< 1500)
        paymentMethod: "CASH_ON_DELIVERY" as const,
      };

      const order = await orderService.createOrder(checkoutPayload, testUserId);

      expect(parseFloat(order.subtotal)).toBe(800);
      expect(parseFloat(order.deliveryFee)).toBe(60);
      expect(parseFloat(order.discountAmount)).toBe(0);
      expect(parseFloat(order.total)).toBe(860);
    }, 30000);

    it("should reject checkout when requested quantity exceeds available stock across all batches", async () => {
      const excessivePayload = {
        shippingAddress: {
          fullName: "Overbuyer",
          phone: "01700112233",
          addressLine1: "Banani",
          city: "Dhaka",
          district: "Dhaka",
          postalCode: "1213",
        },
        items: [{ productId: testProductId, quantity: 9999 }],
        paymentMethod: "CASH_ON_DELIVERY" as const,
      };

      expect(
        orderService.createOrder(excessivePayload, testUserId),
      ).rejects.toThrow();
    }, 30000);

    it("should retrieve user orders via getUserOrders", async () => {
      const list = await orderService.getUserOrders(testUserId);
      expect(Array.isArray(list)).toBe(true);
      expect(list.length).toBeGreaterThanOrEqual(1);
    }, 30000);
  });

  describe("4. Order Invoice Generation & Streaming (GET /orders/:id/invoice)", () => {
    let createdOrderId: string;
    let customerToken: string;
    let otherCustomerToken: string;
    let adminToken: string;

    beforeAll(async () => {
      customerToken = await signAccessToken({
        sub: testUserId,
        role: "CUSTOMER",
        phone: "01711223344",
      });

      otherCustomerToken = await signAccessToken({
        sub: "00000000-0000-0000-0000-000000000099",
        role: "CUSTOMER",
        phone: "01799887766",
      });

      adminToken = await signAccessToken({
        sub: "00000000-0000-0000-0000-000000000001",
        role: "SUPER_ADMIN",
        phone: "01700000001",
      });

      const testOrder = await orderService.createOrder(
        {
          shippingAddress: {
            fullName: "Invoice Test User",
            phone: "01711223344",
            addressLine1: "Invoice Road 10",
            city: "Dhaka",
            district: "Dhaka",
            postalCode: "1212",
          },
          items: [{ productId: testProductId, quantity: 1 }],
          paymentMethod: "CASH_ON_DELIVERY",
        },
        testUserId,
      );
      createdOrderId = testOrder.id;
    });

    it("should return 401 when unauthenticated", async () => {
      const res = await app.request(`/orders/${createdOrderId}/invoice`);
      expect(res.status).toBe(401);
    });

    it("should return 403 when another customer tries to access the invoice", async () => {
      const res = await app.request(`/orders/${createdOrderId}/invoice`, {
        headers: {
          Authorization: `Bearer ${otherCustomerToken}`,
        },
      });
      expect(res.status).toBe(403);
    });

    it("should return 404 for a non-existent order ID", async () => {
      const res = await app.request(
        `/orders/00000000-0000-0000-0000-000000000404/invoice`,
        {
          headers: {
            Authorization: `Bearer ${customerToken}`,
          },
        },
      );
      expect(res.status).toBe(404);
    });

    it("should generate and stream PDF invoice with application/pdf headers for order owner", async () => {
      const res = await app.request(`/orders/${createdOrderId}/invoice`, {
        headers: {
          Authorization: `Bearer ${customerToken}`,
        },
      });

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("application/pdf");
      expect(res.headers.get("content-disposition")).toContain("invoice-");

      const buffer = await res.arrayBuffer();
      expect(buffer.byteLength).toBeGreaterThan(1000);
      const headerStr = new TextDecoder().decode(
        new Uint8Array(buffer).subarray(0, 5),
      );
      expect(headerStr).toBe("%PDF-");
    });

    it("should allow staff / super_admin to access any order invoice", async () => {
      const res = await app.request(`/orders/${createdOrderId}/invoice`, {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      });

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("application/pdf");
    });
  });
});
