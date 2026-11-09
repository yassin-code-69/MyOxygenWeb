import { beforeAll, describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import {
  categories,
  discounts,
  invoices,
  orders,
  productBatches,
  products,
  stockHistoryLogs,
  users,
} from "../db/schema/tables";
import { app } from "../index";
import { addDays, todayInBusinessTz } from "../lib/dates";
import { signAccessToken } from "../lib/jwt";
import { resetRateLimiter } from "../middleware/rate-limiter";
import type { CouponPreviewDTO, CouponRejectionCode } from "../services/coupon.service";
import type { OrderTrackingDTO } from "../services/order-fulfillment.service";
import type { OrderDetailDTO, OrderSummaryDTO } from "../services/order-dto";
import type { PaginationMeta, UserRole } from "../types";
import { shippingAddressSchema } from "./orders.schema";

// ---------------------------------------------------------------------------
// Fixtures (unique per run; nothing shared is truncated)
// ---------------------------------------------------------------------------

const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
const TODAY = todayInBusinessTz();
let sequence = 0;

interface TestUser {
  id: string;
  token: string;
  phone: string;
}

interface Envelope<T> {
  success: boolean;
  data: T;
  meta?: PaginationMeta;
  error?: { code: string; message: string; details?: unknown };
}

function uniquePhone(): string {
  return `01${3 + Math.floor(Math.random() * 7)}${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
}

async function createUser(role: UserRole, email = true): Promise<TestUser> {
  sequence += 1;
  const phone = uniquePhone();
  const [user] = await db
    .insert(users)
    .values({
      fullName: `Orders ${role} ${sequence}`,
      email: email ? `orders-${role.toLowerCase()}-${RUN}-${sequence}@test.myoxygen.local` : null,
      phone,
      passwordHash: "not-used",
      role,
    })
    .returning({ id: users.id });
  if (!user) throw new Error("user fixture failed");
  return { id: user.id, phone, token: await signAccessToken({ sub: user.id, role, phone }) };
}

async function createCategory(label: string): Promise<string> {
  const [category] = await db
    .insert(categories)
    .values({ name: `Orders ${label} ${RUN}`, slug: `orders-${label}-${RUN}` })
    .returning({ id: categories.id });
  if (!category) throw new Error("category fixture failed");
  return category.id;
}

async function createProduct(
  label: string,
  categoryId: string,
  basePrice: string,
  batches: Array<{ quantity: number; expiresInDays: number }>,
): Promise<{ id: string; batchIds: string[] }> {
  const [product] = await db
    .insert(products)
    .values({
      categoryId,
      title: `Orders ${label} ${RUN}`,
      slug: `orders-${label.toLowerCase()}-${RUN}`,
      sku: `ORD-${label.toUpperCase()}-${RUN}`,
      description: "Order test fixture",
      basePrice,
      costPrice: "1.00",
      requiresBatchTracking: true,
      isActive: true,
    })
    .returning({ id: products.id });
  if (!product) throw new Error("product fixture failed");
  const batchIds: string[] = [];
  for (const [index, batch] of batches.entries()) {
    const [row] = await db
      .insert(productBatches)
      .values({
        productId: product.id,
        batchNumber: `B${index}-${label}-${RUN}`,
        expiryDate: addDays(TODAY, batch.expiresInDays),
        initialQuantity: batch.quantity,
        availableQuantity: batch.quantity,
      })
      .returning({ id: productBatches.id });
    if (!row) throw new Error("batch fixture failed");
    batchIds.push(row.id);
  }
  return { id: product.id, batchIds };
}

async function createCoupon(
  label: string,
  values: Partial<typeof discounts.$inferInsert> & Pick<typeof discounts.$inferInsert, "type" | "value">,
): Promise<{ id: string; code: string }> {
  const code = `${label}-${RUN}`.toUpperCase();
  const [row] = await db
    .insert(discounts)
    .values({
      code,
      startsAt: new Date(Date.now() - 3_600_000),
      endsAt: new Date(Date.now() + 86_400_000),
      isActive: true,
      ...values,
    })
    .returning({ id: discounts.id });
  if (!row) throw new Error("coupon fixture failed");
  return { id: row.id, code };
}

async function call<T>(
  method: string,
  path: string,
  options: { token?: string; body?: unknown } = {},
): Promise<{ status: number; body: Envelope<T> }> {
  const headers: Record<string, string> = {};
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  const response = await app.request(path, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  return { status: response.status, body: (text ? JSON.parse(text) : {}) as Envelope<T> };
}

const address = {
  fullName: "Ayesha Rahman",
  phone: "+8801799887766",
  addressLine1: "Flat 4B, Green Road",
  addressLine2: "Near Green Life Hospital",
  city: "Dhaka",
  district: "Dhaka",
  postalCode: "1205",
};

function checkoutBody(items: Array<{ productId: string; quantity: number }>, couponCode?: string) {
  return { shippingAddress: address, items, paymentMethod: "COD", couponCode };
}

async function batchQuantity(batchId: string): Promise<number> {
  const [row] = await db
    .select({ quantity: productBatches.availableQuantity })
    .from(productBatches)
    .where(eq(productBatches.id, batchId));
  return row?.quantity ?? -1;
}

async function usageCount(discountId: string): Promise<number> {
  const [row] = await db.select({ value: discounts.usageCount }).from(discounts).where(eq(discounts.id, discountId));
  return row?.value ?? -1;
}

let customerA: TestUser;
let customerB: TestUser;
let staff: TestUser;
let categoryA: string;
let categoryB: string;
let lotion: { id: string; batchIds: string[] }; // ৳400, two batches (FEFO)
let flashCream: { id: string; batchIds: string[] }; // ৳1000 with an automatic 20% discount
let wipes: { id: string; batchIds: string[] }; // ৳300, category B
let diapers: { id: string; batchIds: string[] }; // ৳500, category A

beforeAll(async () => {
  resetRateLimiter();
  customerA = await createUser("CUSTOMER");
  customerB = await createUser("CUSTOMER");
  staff = await createUser("ORDER_MANAGER");
  categoryA = await createCategory("cat-a");
  categoryB = await createCategory("cat-b");

  lotion = await createProduct("lotion", categoryA, "400.00", [
    { quantity: 20, expiresInDays: 400 },
    { quantity: 10, expiresInDays: 100 },
  ]);
  flashCream = await createProduct("flash", categoryA, "1000.00", [{ quantity: 50, expiresInDays: 300 }]);
  wipes = await createProduct("wipes", categoryB, "300.00", [{ quantity: 200, expiresInDays: 300 }]);
  diapers = await createProduct("diapers", categoryA, "500.00", [{ quantity: 300, expiresInDays: 300 }]);

  await db.insert(discounts).values({
    code: null,
    name: `Flash ${RUN}`,
    type: "PERCENTAGE",
    value: "20.00",
    productId: flashCream.id,
    startsAt: new Date(Date.now() - 3_600_000),
    endsAt: new Date(Date.now() + 86_400_000),
    isFlashSale: true,
    isActive: true,
  });
}, 60_000);

// ---------------------------------------------------------------------------

describe("Checkout validation", () => {
  it("normalises Bangladeshi phone numbers to 01XXXXXXXXX", () => {
    for (const phone of ["01712345678", "+8801712345678", "8801712345678", "1712345678", "01712-345678"]) {
      const result = shippingAddressSchema.safeParse({ ...address, phone });
      expect(result.success).toBe(true);
      if (result.success) expect(result.data.phone).toBe("01712345678");
    }
  });

  it("rejects non-Bangladeshi or malformed phone numbers and postcodes", () => {
    for (const phone of ["01112345678", "12345678", "+14155552671", "0171234567", "abcdefghijk"]) {
      expect(shippingAddressSchema.safeParse({ ...address, phone }).success).toBe(false);
    }
    expect(shippingAddressSchema.safeParse({ ...address, postalCode: "410" }).success).toBe(false);
  });

  it("requires authentication (401) and a valid body (422)", async () => {
    const anonymous = await call("POST", "/orders/checkout", { body: checkoutBody([{ productId: lotion.id, quantity: 1 }]) });
    expect(anonymous.status).toBe(401);

    const invalid = await call("POST", "/orders/checkout", {
      token: customerA.token,
      body: { ...checkoutBody([{ productId: lotion.id, quantity: 1 }]), shippingAddress: { ...address, phone: "12345" } },
    });
    expect(invalid.status).toBe(422);
    expect(invalid.body.error?.code).toBe("VALIDATION_ERROR");
  });
});

describe("POST /orders/checkout", () => {
  it("merges duplicate lines, reserves FEFO stock, records history and ledger links", async () => {
    const res = await call<OrderDetailDTO>("POST", "/orders/checkout", {
      token: customerA.token,
      body: {
        ...checkoutBody([
          { productId: lotion.id, quantity: 5 },
          { productId: lotion.id.toUpperCase(), quantity: 7 },
        ]),
        paymentMethod: "CASH_ON_DELIVERY",
      },
    });
    expect(res.status).toBe(201);
    const order = res.body.data;
    expect(order.orderNumber).toMatch(/^ORD-\d{8}-[A-HJ-NP-Z2-9]{8}$/);
    expect(order.status).toBe("PENDING");
    expect(order.paymentMethod).toBe("COD");
    expect(order.paymentStatus).toBe("UNPAID");
    expect(order.shippingAddress).toEqual({ ...address, phone: "01799887766" });
    expect(order.subtotal).toBe(4800);
    expect(order.deliveryFee).toBe(0);
    expect(order.discountAmount).toBe(0);
    expect(order.total).toBe(4800);
    expect(order.canCancel).toBe(true);

    // FEFO: the batch expiring in 100 days (10 units) is consumed first, then 2 from the later batch.
    const [laterBatch, earlierBatch] = lotion.batchIds as [string, string];
    expect(await batchQuantity(earlierBatch)).toBe(0);
    expect(await batchQuantity(laterBatch)).toBe(18);
    const byBatch = new Map(order.items.map((item) => [item.batchId, item]));
    expect(byBatch.get(earlierBatch)?.quantity).toBe(10);
    expect(byBatch.get(laterBatch)?.quantity).toBe(2);
    for (const item of order.items) {
      expect(item.unitPrice).toBe(400);
      expect(item.productTitle).toBe(`Orders lotion ${RUN}`);
    }

    expect(order.statusHistory).toHaveLength(1);
    expect(order.statusHistory[0]).toMatchObject({ fromStatus: null, toStatus: "PENDING", changedBy: null });

    const ledger = await db
      .select({ reason: stockHistoryLogs.reason, delta: stockHistoryLogs.changeDelta })
      .from(stockHistoryLogs)
      .where(eq(stockHistoryLogs.orderId, order.id));
    expect(ledger.map((row) => row.reason)).toEqual(["PURCHASE", "PURCHASE"]);
    expect(ledger.reduce((sum, row) => sum + row.delta, 0)).toBe(-12);
  }, 30_000);

  it("charges the effective flash-sale price and the ৳60 delivery fee below ৳1,500", async () => {
    const res = await call<OrderDetailDTO>("POST", "/orders/checkout", {
      token: customerA.token,
      body: checkoutBody([{ productId: flashCream.id, quantity: 1 }]),
    });
    expect(res.status).toBe(201);
    expect(res.body.data.items[0]?.unitPrice).toBe(800);
    expect(res.body.data.subtotal).toBe(800);
    expect(res.body.data.deliveryFee).toBe(60);
    expect(res.body.data.total).toBe(860);
  });

  it("gives free delivery at exactly ৳1,500", async () => {
    const res = await call<OrderDetailDTO>("POST", "/orders/checkout", {
      token: customerA.token,
      body: checkoutBody([{ productId: diapers.id, quantity: 3 }]),
    });
    expect(res.status).toBe(201);
    expect(res.body.data.subtotal).toBe(1500);
    expect(res.body.data.deliveryFee).toBe(0);
  });

  it("rejects quantities above the available stock with 409 INSUFFICIENT_STOCK and changes nothing", async () => {
    const before = await batchQuantity(wipes.batchIds[0] ?? "");
    const res = await call("POST", "/orders/checkout", {
      token: customerA.token,
      body: checkoutBody([
        { productId: wipes.id, quantity: 1 },
        { productId: lotion.id, quantity: 999 },
      ]),
    });
    expect(res.status).toBe(409);
    expect(res.body.error?.code).toBe("INSUFFICIENT_STOCK");
    expect(await batchQuantity(wipes.batchIds[0] ?? "")).toBe(before);
  });

  it("rejects unknown products with 409 CONFLICT", async () => {
    const res = await call("POST", "/orders/checkout", {
      token: customerA.token,
      body: checkoutBody([{ productId: "00000000-0000-4000-8000-000000000404", quantity: 1 }]),
    });
    expect(res.status).toBe(409);
    expect(res.body.error?.code).toBe("CONFLICT");
  });
});

describe("Coupons", () => {
  it("previews a store-wide coupon case-insensitively at server prices", async () => {
    const coupon = await createCoupon("pct10", { type: "PERCENTAGE", value: "10.00" });
    const res = await call<CouponPreviewDTO>("POST", "/orders/validate-coupon", {
      body: { code: coupon.code.toLowerCase(), items: [{ productId: flashCream.id, quantity: 1 }] },
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      valid: true,
      code: coupon.code,
      reasonCode: null,
      reason: null,
      couponType: "PERCENTAGE",
      couponValue: 10,
      scope: "ORDER",
      minOrderAmount: null,
      maxDiscountAmount: null,
      subtotal: 800,
      eligibleSubtotal: 800,
      discountAmount: 80,
      deliveryFee: 60,
      total: 780,
    });
  });

  it("returns valid=false with a reason code for unknown, expired, future and inactive coupons", async () => {
    const expired = await createCoupon("expired", {
      type: "FIXED_AMOUNT",
      value: "50.00",
      startsAt: new Date(Date.now() - 5 * 86_400_000),
      endsAt: new Date(Date.now() - 86_400_000),
    });
    const future = await createCoupon("future", {
      type: "FIXED_AMOUNT",
      value: "50.00",
      startsAt: new Date(Date.now() + 86_400_000),
      endsAt: new Date(Date.now() + 5 * 86_400_000),
    });
    const inactive = await createCoupon("inactive", { type: "FIXED_AMOUNT", value: "50.00", isActive: false });
    const items = [{ productId: diapers.id, quantity: 1 }];

    const cases: Array<[string, CouponRejectionCode]> = [
      [`NOPE-${RUN}`, "NOT_FOUND"],
      [expired.code, "EXPIRED"],
      [future.code, "NOT_STARTED"],
      [inactive.code, "INACTIVE"],
    ];
    for (const [code, reasonCode] of cases) {
      const res = await call<CouponPreviewDTO>("POST", "/orders/validate-coupon", { body: { code, items } });
      expect(res.status).toBe(200);
      expect(res.body.data.valid).toBe(false);
      expect(res.body.data.reasonCode).toBe(reasonCode);
      expect(res.body.data.discountAmount).toBe(0);
      expect(typeof res.body.data.reason).toBe("string");
    }
  });

  it("enforces min_order_amount in previews and at checkout (422, stock untouched)", async () => {
    const coupon = await createCoupon("min2000", { type: "FIXED_AMOUNT", value: "200.00", minOrderAmount: "2000.00" });
    const items = [{ productId: diapers.id, quantity: 2 }];

    const preview = await call<CouponPreviewDTO>("POST", "/orders/validate-coupon", { body: { code: coupon.code, items } });
    expect(preview.body.data.valid).toBe(false);
    expect(preview.body.data.reasonCode).toBe("MIN_ORDER_NOT_MET");

    const before = await batchQuantity(diapers.batchIds[0] ?? "");
    const checkout = await call("POST", "/orders/checkout", { token: customerA.token, body: checkoutBody(items, coupon.code) });
    expect(checkout.status).toBe(422);
    expect(checkout.body.error?.code).toBe("INVALID_COUPON");
    expect(checkout.body.error?.details).toMatchObject({ reasonCode: "MIN_ORDER_NOT_MET" });
    expect(await batchQuantity(diapers.batchIds[0] ?? "")).toBe(before);
    expect(await usageCount(coupon.id)).toBe(0);

    const qualifying = await call<OrderDetailDTO>("POST", "/orders/checkout", {
      token: customerA.token,
      body: checkoutBody([{ productId: diapers.id, quantity: 4 }], coupon.code),
    });
    expect(qualifying.status).toBe(201);
    expect(qualifying.body.data.discountAmount).toBe(200);
    expect(qualifying.body.data.total).toBe(1800);
    expect(qualifying.body.data.couponCode).toBe(coupon.code);
    expect(await usageCount(coupon.id)).toBe(1);
  });

  it("caps percentage discounts with max_discount_amount", async () => {
    const coupon = await createCoupon("cap", { type: "PERCENTAGE", value: "50.00", maxDiscountAmount: "100.00" });
    const res = await call<CouponPreviewDTO>("POST", "/orders/validate-coupon", {
      body: { code: coupon.code, items: [{ productId: diapers.id, quantity: 2 }] },
    });
    expect(res.body.data.valid).toBe(true);
    expect(res.body.data.discountAmount).toBe(100);
    expect(res.body.data.maxDiscountAmount).toBe(100);
  });

  it("applies category coupons only to lines of that category", async () => {
    const coupon = await createCoupon("catb", { type: "PERCENTAGE", value: "20.00", categoryId: categoryB });
    const mixed = await call<CouponPreviewDTO>("POST", "/orders/validate-coupon", {
      body: {
        code: coupon.code,
        items: [
          { productId: wipes.id, quantity: 1 },
          { productId: diapers.id, quantity: 2 },
        ],
      },
    });
    expect(mixed.body.data).toMatchObject({ valid: true, scope: "CATEGORY", subtotal: 1300, eligibleSubtotal: 300, discountAmount: 60 });

    const otherCategory = await call<CouponPreviewDTO>("POST", "/orders/validate-coupon", {
      body: { code: coupon.code, items: [{ productId: diapers.id, quantity: 2 }] },
    });
    expect(otherCategory.body.data).toMatchObject({ valid: false, reasonCode: "NOT_APPLICABLE" });
  });

  it("applies product coupons only to the matching product", async () => {
    const coupon = await createCoupon("prod", { type: "FIXED_AMOUNT", value: "50.00", productId: diapers.id });
    const res = await call<CouponPreviewDTO>("POST", "/orders/validate-coupon", {
      body: {
        code: coupon.code,
        items: [
          { productId: diapers.id, quantity: 1 },
          { productId: wipes.id, quantity: 1 },
        ],
      },
    });
    expect(res.body.data).toMatchObject({ valid: true, scope: "PRODUCT", eligibleSubtotal: 500, discountAmount: 50 });
  });

  it("lets exactly one of two concurrent checkouts redeem a usage_limit=1 coupon", async () => {
    const coupon = await createCoupon("limit1", { type: "FIXED_AMOUNT", value: "20.00", usageLimit: 1 });
    const results = await Promise.all([
      call("POST", "/orders/checkout", {
        token: customerA.token,
        body: checkoutBody([{ productId: diapers.id, quantity: 1 }], coupon.code),
      }),
      call("POST", "/orders/checkout", {
        token: customerB.token,
        body: checkoutBody([{ productId: wipes.id, quantity: 1 }], coupon.code),
      }),
    ]);
    const statuses = results.map((result) => result.status).sort();
    expect(statuses).toEqual([201, 422]);
    const rejected = results.find((result) => result.status === 422);
    expect(rejected?.body.error?.details).toMatchObject({ reasonCode: "USAGE_LIMIT_REACHED" });
    expect(await usageCount(coupon.id)).toBe(1);
    const withCoupon = await db.select({ id: orders.id }).from(orders).where(eq(orders.discountId, coupon.id));
    expect(withCoupon).toHaveLength(1);
  }, 30_000);

  it("enforces per_customer_limit and frees the slot when the order is cancelled", async () => {
    const coupon = await createCoupon("percust", { type: "FIXED_AMOUNT", value: "30.00", perCustomerLimit: 1 });
    const items = [{ productId: wipes.id, quantity: 1 }];

    const first = await call<OrderDetailDTO>("POST", "/orders/checkout", {
      token: customerA.token,
      body: checkoutBody(items, coupon.code),
    });
    expect(first.status).toBe(201);

    const asCustomer = await call<CouponPreviewDTO>("POST", "/orders/validate-coupon", {
      token: customerA.token,
      body: { code: coupon.code, items },
    });
    expect(asCustomer.body.data).toMatchObject({ valid: false, reasonCode: "PER_CUSTOMER_LIMIT_REACHED" });
    const anonymous = await call<CouponPreviewDTO>("POST", "/orders/validate-coupon", { body: { code: coupon.code, items } });
    expect(anonymous.body.data.valid).toBe(true);

    const second = await call("POST", "/orders/checkout", { token: customerA.token, body: checkoutBody(items, coupon.code) });
    expect(second.status).toBe(422);
    expect(second.body.error?.details).toMatchObject({ reasonCode: "PER_CUSTOMER_LIMIT_REACHED" });

    const otherCustomer = await call("POST", "/orders/checkout", { token: customerB.token, body: checkoutBody(items, coupon.code) });
    expect(otherCustomer.status).toBe(201);
    expect(await usageCount(coupon.id)).toBe(2);

    const cancelled = await call<OrderDetailDTO>("POST", `/orders/${first.body.data.id}/cancel`, { token: customerA.token });
    expect(cancelled.status).toBe(200);
    expect(await usageCount(coupon.id)).toBe(1);
    const afterCancel = await call<CouponPreviewDTO>("POST", "/orders/validate-coupon", {
      token: customerA.token,
      body: { code: coupon.code, items },
    });
    expect(afterCancel.body.data.valid).toBe(true);
  }, 30_000);
});

describe("POST /orders/:id/cancel", () => {
  let order: OrderDetailDTO;

  beforeAll(async () => {
    const res = await call<OrderDetailDTO>("POST", "/orders/checkout", {
      token: customerB.token,
      body: checkoutBody([{ productId: wipes.id, quantity: 4 }]),
    });
    order = res.body.data;
  });

  it("forbids other customers (403)", async () => {
    const res = await call("POST", `/orders/${order.id}/cancel`, { token: customerA.token });
    expect(res.status).toBe(403);
  });

  it("lets the owner cancel a PENDING order and restores the stock", async () => {
    const before = await batchQuantity(wipes.batchIds[0] ?? "");
    const res = await call<OrderDetailDTO>("POST", `/orders/${order.orderNumber.toLowerCase()}/cancel`, {
      token: customerB.token,
      body: { reason: "Ordered by mistake" },
    });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe("CANCELLED");
    expect(res.body.data.canCancel).toBe(false);
    expect(res.body.data.cancelledAt).not.toBeNull();
    expect(res.body.data.statusHistory.at(-1)).toMatchObject({
      fromStatus: "PENDING",
      toStatus: "CANCELLED",
      note: "Cancelled by customer — Ordered by mistake",
    });
    expect(await batchQuantity(wipes.batchIds[0] ?? "")).toBe(before + 4);
  });

  it("rejects a second cancellation with 409", async () => {
    const res = await call("POST", `/orders/${order.id}/cancel`, { token: customerB.token });
    expect(res.status).toBe(409);
    expect(res.body.error?.code).toBe("INVALID_STATUS_TRANSITION");
  });

  it("does not let customers cancel once the order is PROCESSING", async () => {
    const placed = await call<OrderDetailDTO>("POST", "/orders/checkout", {
      token: customerB.token,
      body: checkoutBody([{ productId: wipes.id, quantity: 1 }]),
    });
    const processing = await call("PATCH", `/admin/orders/${placed.body.data.id}/status`, {
      token: staff.token,
      body: { status: "PROCESSING" },
    });
    expect(processing.status).toBe(200);
    const res = await call("POST", `/orders/${placed.body.data.id}/cancel`, { token: customerB.token });
    expect(res.status).toBe(409);
    expect(res.body.error?.code).toBe("INVALID_STATUS_TRANSITION");
  });
});

describe("Order reads", () => {
  let reader: TestUser;
  const placed: OrderDetailDTO[] = [];

  beforeAll(async () => {
    reader = await createUser("CUSTOMER");
    for (const quantity of [1, 2, 3]) {
      const res = await call<OrderDetailDTO>("POST", "/orders/checkout", {
        token: reader.token,
        body: checkoutBody([{ productId: diapers.id, quantity }]),
      });
      placed.push(res.body.data);
    }
  }, 30_000);

  it("paginates GET /orders/my-orders newest first with item summaries", async () => {
    const page1 = await call<OrderSummaryDTO[]>("GET", "/orders/my-orders?page=1&limit=2", { token: reader.token });
    expect(page1.status).toBe(200);
    expect(page1.body.meta).toEqual({ page: 1, limit: 2, total: 3, totalPages: 2 });
    expect(page1.body.data.map((order) => order.id)).toEqual([placed[2]?.id, placed[1]?.id]);
    expect(page1.body.data[0]).toMatchObject({ itemCount: 3, total: 1500, deliveryFee: 0 });
    expect(page1.body.data[0]?.items).toEqual([
      expect.objectContaining({ productId: diapers.id, productTitle: `Orders diapers ${RUN}`, quantity: 3 }),
    ]);

    const page2 = await call<OrderSummaryDTO[]>("GET", "/orders/my-orders?page=2&limit=2", { token: reader.token });
    expect(page2.body.data.map((order) => order.id)).toEqual([placed[0]?.id]);

    const invalid = await call("GET", "/orders/my-orders?limit=1000", { token: reader.token });
    expect(invalid.status).toBe(422);
  });

  it("returns order detail to the owner and ORDERS_READ staff only", async () => {
    const target = placed[0];
    if (!target) throw new Error("fixture missing");

    const byNumber = await call<OrderDetailDTO>("GET", `/orders/${target.orderNumber}`, { token: reader.token });
    expect(byNumber.status).toBe(200);
    expect(byNumber.body.data.id).toBe(target.id);
    expect(byNumber.body.data.statusHistory[0]?.changedBy).toBeNull();

    const forStaff = await call<OrderDetailDTO>("GET", `/orders/${target.id}`, { token: staff.token });
    expect(forStaff.status).toBe(200);
    expect(forStaff.body.data.statusHistory[0]?.changedBy?.id).toBe(reader.id);
    expect(forStaff.body.data.allowedTransitions).toEqual(["PROCESSING", "CANCELLED"]);

    expect((await call("GET", `/orders/${target.id}`, { token: customerA.token })).status).toBe(403);
    expect((await call("GET", "/orders/ORD-20000101-NOTFOUND", { token: reader.token })).status).toBe(404);
    expect((await call("GET", "/orders/not%20valid!", { token: reader.token })).status).toBe(422);
    expect((await call("GET", `/orders/${target.id}`)).status).toBe(401);
  });

  it("serves the tracking timeline to the owner only", async () => {
    const target = placed[1];
    if (!target) throw new Error("fixture missing");
    expect((await call("GET", `/orders/${target.orderNumber}/track`)).status).toBe(401);
    expect((await call("GET", `/orders/${target.orderNumber}/track`, { token: customerA.token })).status).toBe(403);

    const res = await call<OrderTrackingDTO>("GET", `/orders/${target.orderNumber}/track`, { token: reader.token });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      orderId: target.id,
      orderNumber: target.orderNumber,
      status: "PENDING",
      trackingId: null,
      courier: null,
      courierError: null,
    });
    expect(res.body.data.history.map((entry) => entry.toStatus)).toEqual(["PENDING"]);
  });
});

describe("GET /orders/:id/invoice", () => {
  let order: OrderDetailDTO;

  beforeAll(async () => {
    const res = await call<OrderDetailDTO>("POST", "/orders/checkout", {
      token: customerA.token,
      body: checkoutBody([{ productId: wipes.id, quantity: 2 }]),
    });
    order = res.body.data;
  });

  async function fetchInvoice(token?: string, ref = order.id): Promise<Response> {
    return app.request(`/orders/${ref}/invoice`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  }

  it("rejects anonymous (401), other customers (403) and unknown orders (404)", async () => {
    expect((await fetchInvoice()).status).toBe(401);
    expect((await fetchInvoice(customerB.token)).status).toBe(403);
    expect((await fetchInvoice(customerA.token, "00000000-0000-4000-8000-000000000404")).status).toBe(404);
  });

  it("generates, stores and streams the PDF for the owner and staff", async () => {
    const res = await fetchInvoice(customerA.token);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toBe(`inline; filename="invoice-${order.orderNumber}.pdf"`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(new TextDecoder().decode(bytes.subarray(0, 5))).toBe("%PDF-");

    const stored = await db
      .select({ id: invoices.id, paymentMethod: invoices.paymentMethod, customerName: invoices.customerName })
      .from(invoices)
      .where(eq(invoices.orderId, order.id));
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ paymentMethod: "COD", customerName: "Ayesha Rahman" });

    const staffRes = await fetchInvoice(staff.token, order.orderNumber);
    expect(staffRes.status).toBe(200);
    const again = await db.select({ id: invoices.id }).from(invoices).where(eq(invoices.orderId, order.id));
    expect(again.map((row) => row.id)).toEqual(stored.map((row) => row.id));
  });
});

describe("Coupon preview rate limiting", () => {
  it("returns 429 after 30 previews per minute from one client", async () => {
    resetRateLimiter();
    const statuses: number[] = [];
    for (let index = 0; index < 31; index++) {
      const res = await call("POST", "/orders/validate-coupon", { body: { code: "", items: [] } });
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 30).every((status) => status === 422)).toBe(true);
    expect(statuses[30]).toBe(429);
    resetRateLimiter();
  });
});
