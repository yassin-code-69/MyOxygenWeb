import { afterAll, beforeAll, describe, expect, it, spyOn } from "bun:test";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db/client";
import {
  categories,
  discounts,
  orderItems,
  orders,
  orderStatusHistory,
  productBatches,
  products,
  stockHistoryLogs,
  users,
} from "../db/schema/tables";
import { app } from "../index";
import { addDays, todayInBusinessTz } from "../lib/dates";
import { AppError } from "../lib/errors";
import { signAccessToken } from "../lib/jwt";
import type { TelemetrySummaryDTO } from "../services/admin-telemetry.service";
import type { CourierProvider, ParcelCancellation } from "../services/courier/courier.interface";
import { CourierService, courierService } from "../services/courier/courier.service";
import { SteadfastCourierProvider } from "../services/courier/steadfast.provider";
import type { AdminOrderListItemDTO, OrderDetailDTO } from "../services/order-dto";
import {
  OrderFulfillmentService,
  type DispatchResultDTO,
  type OrderTrackingDTO,
} from "../services/order-fulfillment.service";
import type { PaginationMeta, UserRole } from "../types";

// ---------------------------------------------------------------------------
// Fixtures
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

async function createUser(role: UserRole): Promise<TestUser> {
  sequence += 1;
  const phone = uniquePhone();
  const [user] = await db
    .insert(users)
    .values({
      fullName: `Admin Orders ${role} ${sequence}`,
      email: `admin-orders-${role.toLowerCase()}-${RUN}-${sequence}@test.myoxygen.local`,
      phone,
      passwordHash: "not-used",
      role,
    })
    .returning({ id: users.id });
  if (!user) throw new Error("user fixture failed");
  return { id: user.id, phone, token: await signAccessToken({ sub: user.id, role, phone }) };
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

let admin: TestUser;
let manager: TestUser;
let support: TestUser;
let inventoryManager: TestUser;
let customer: TestUser;
let categoryId: string;
let productId: string;
let batchId: string;
const customerPhone = "01788776655";

async function placeOrder(quantity = 1, couponCode?: string): Promise<OrderDetailDTO> {
  const res = await call<OrderDetailDTO>("POST", "/orders/checkout", {
    token: customer.token,
    body: {
      shippingAddress: {
        fullName: "Courier Receiver",
        phone: customerPhone,
        addressLine1: "House 11, Road 2, Banani",
        city: "Dhaka",
        district: "Dhaka",
        postalCode: "1213",
      },
      items: [{ productId, quantity }],
      paymentMethod: "COD",
      couponCode,
    },
  });
  if (res.status !== 201) throw new Error(`checkout failed: ${res.status} ${JSON.stringify(res.body.error)}`);
  return res.body.data;
}

async function setStatus(orderId: string, body: Record<string, unknown>, token = admin.token) {
  return call<OrderDetailDTO>("PATCH", `/admin/orders/${orderId}/status`, { token, body });
}

async function batchQuantity(): Promise<number> {
  const [row] = await db
    .select({ quantity: productBatches.availableQuantity })
    .from(productBatches)
    .where(eq(productBatches.id, batchId));
  return row?.quantity ?? -1;
}

beforeAll(async () => {
  admin = await createUser("SUPER_ADMIN");
  manager = await createUser("ORDER_MANAGER");
  support = await createUser("SUPPORT_STAFF");
  inventoryManager = await createUser("INVENTORY_MANAGER");
  customer = await createUser("CUSTOMER");

  const [category] = await db
    .insert(categories)
    .values({ name: `Admin Orders ${RUN}`, slug: `admin-orders-${RUN}` })
    .returning({ id: categories.id });
  if (!category) throw new Error("category fixture failed");
  categoryId = category.id;

  const [product] = await db
    .insert(products)
    .values({
      categoryId,
      title: `Admin Diaper Pack ${RUN}`,
      slug: `admin-diaper-pack-${RUN}`,
      sku: `ADM-DIAPER-${RUN}`,
      description: "Admin orders fixture",
      basePrice: "500.00",
      costPrice: "300.00",
      requiresBatchTracking: true,
      isActive: true,
    })
    .returning({ id: products.id });
  if (!product) throw new Error("product fixture failed");
  productId = product.id;

  const [batch] = await db
    .insert(productBatches)
    .values({
      productId,
      batchNumber: `ADM-${RUN}`,
      expiryDate: addDays(TODAY, 500),
      initialQuantity: 500,
      availableQuantity: 500,
    })
    .returning({ id: productBatches.id });
  if (!batch) throw new Error("batch fixture failed");
  batchId = batch.id;
}, 60_000);

// ---------------------------------------------------------------------------

describe("GET /admin/orders", () => {
  let order: OrderDetailDTO;

  beforeAll(async () => {
    order = await placeOrder(2);
  });

  it("returns a paginated list with customer, items and numeric money", async () => {
    const res = await call<AdminOrderListItemDTO[]>("GET", `/admin/orders?q=${order.orderNumber}`, { token: admin.token });
    expect(res.status).toBe(200);
    expect(res.body.meta).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
    const [row] = res.body.data;
    expect(row).toMatchObject({
      id: order.id,
      status: "PENDING",
      paymentMethod: "COD",
      subtotal: 1000,
      deliveryFee: 60,
      total: 1060,
      itemCount: 2,
      allowedTransitions: ["PROCESSING", "CANCELLED"],
      customer: { id: customer.id },
    });
    expect(row?.shippingAddress.fullName).toBe("Courier Receiver");
    expect(row?.items[0]).toMatchObject({ productId, productTitle: `Admin Diaper Pack ${RUN}`, batchId, unitPrice: 500 });
  });

  it("filters by status, phone search (any format) and business-date range", async () => {
    const byPhone = await call<AdminOrderListItemDTO[]>(
      "GET",
      `/admin/orders?q=${encodeURIComponent("+880 1788-776655")}&status=PENDING&limit=100`,
      { token: manager.token },
    );
    expect(byPhone.status).toBe(200);
    expect(byPhone.body.data.some((row) => row.id === order.id)).toBe(true);
    expect(byPhone.body.data.every((row) => row.status === "PENDING")).toBe(true);

    const today = await call<AdminOrderListItemDTO[]>(
      "GET",
      `/admin/orders?q=${order.orderNumber}&from=${TODAY}&to=${TODAY}`,
      { token: admin.token },
    );
    expect(today.body.meta?.total).toBe(1);

    const tomorrow = addDays(TODAY, 1);
    const future = await call<AdminOrderListItemDTO[]>(
      "GET",
      `/admin/orders?q=${order.orderNumber}&from=${tomorrow}&to=${tomorrow}`,
      { token: admin.token },
    );
    expect(future.body.meta?.total).toBe(0);
    expect(future.body.data).toEqual([]);
  });

  it("validates the query (422) and enforces RBAC", async () => {
    expect((await call("GET", "/admin/orders?status=LOST", { token: admin.token })).status).toBe(422);
    expect((await call("GET", "/admin/orders?limit=500", { token: admin.token })).status).toBe(422);
    expect((await call("GET", `/admin/orders?from=${TODAY}&to=2000-01-01`, { token: admin.token })).status).toBe(422);
    expect((await call("GET", "/admin/orders")).status).toBe(401);
    expect((await call("GET", "/admin/orders", { token: customer.token })).status).toBe(403);
    expect((await call("GET", "/admin/orders", { token: support.token })).status).toBe(200);
  });
});

describe("PATCH /admin/orders/:id/status (state machine)", () => {
  it("rejects invalid transitions with 409 and records valid ones with the actor", async () => {
    const order = await placeOrder();

    const skip = await setStatus(order.id, { status: "SHIPPED" });
    expect(skip.status).toBe(409);
    expect(skip.body.error?.code).toBe("INVALID_STATUS_TRANSITION");

    const processing = await setStatus(order.id, { status: "PROCESSING", note: "Packed" }, manager.token);
    expect(processing.status).toBe(200);
    expect(processing.body.data.status).toBe("PROCESSING");
    expect(processing.body.data.allowedTransitions).toEqual(["SHIPPED", "CANCELLED"]);
    expect(processing.body.data.statusHistory.at(-1)).toMatchObject({
      fromStatus: "PENDING",
      toStatus: "PROCESSING",
      note: "Packed",
      changedBy: { id: manager.id, role: "ORDER_MANAGER" },
    });

    const backwards = await setStatus(order.id, { status: "PENDING" });
    expect(backwards.status).toBe(409);
    const jump = await setStatus(order.id, { status: "DELIVERED" });
    expect(jump.status).toBe(409);
  });

  it("cancels once under concurrency: stock is restored exactly once", async () => {
    const before = await batchQuantity();
    const order = await placeOrder(6);
    expect(await batchQuantity()).toBe(before - 6);
    await setStatus(order.id, { status: "PROCESSING" });

    const results = await Promise.all([
      setStatus(order.id, { status: "CANCELLED", note: "Customer called" }),
      setStatus(order.id, { status: "CANCELLED", note: "Duplicate click" }),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    expect(await batchQuantity()).toBe(before);

    const returns = await db
      .select({ delta: stockHistoryLogs.changeDelta })
      .from(stockHistoryLogs)
      .where(and(eq(stockHistoryLogs.orderId, order.id), eq(stockHistoryLogs.reason, "RETURN")));
    expect(returns.reduce((sum, row) => sum + row.delta, 0)).toBe(6);

    const [stored] = await db
      .select({ status: orders.status, cancelledAt: orders.cancelledAt })
      .from(orders)
      .where(eq(orders.id, order.id));
    expect(stored?.status).toBe("CANCELLED");
    expect(stored?.cancelledAt).toBeInstanceOf(Date);

    const terminal = await setStatus(order.id, { status: "PROCESSING" });
    expect(terminal.status).toBe(409);
  }, 30_000);

  it("gives the coupon use back when an order is cancelled", async () => {
    const code = `ADMCOUPON-${RUN}`.toUpperCase();
    const [coupon] = await db
      .insert(discounts)
      .values({
        code,
        type: "FIXED_AMOUNT",
        value: "25.00",
        usageLimit: 10,
        startsAt: new Date(Date.now() - 3_600_000),
        endsAt: new Date(Date.now() + 86_400_000),
      })
      .returning({ id: discounts.id });
    if (!coupon) throw new Error("coupon fixture failed");
    const usage = async () =>
      (await db.select({ value: discounts.usageCount }).from(discounts).where(eq(discounts.id, coupon.id)))[0]?.value;

    const order = await placeOrder(1, code);
    expect(order.discountAmount).toBe(25);
    expect(await usage()).toBe(1);

    expect((await setStatus(order.id, { status: "CANCELLED" })).status).toBe(200);
    expect(await usage()).toBe(0);
    expect((await setStatus(order.id, { status: "CANCELLED" })).status).toBe(409);
    expect(await usage()).toBe(0);
  });

  it("runs the full lifecycle: manual shipment, COD delivery marks PAID, refund needs REFUNDS_APPROVE", async () => {
    const order = await placeOrder();
    await setStatus(order.id, { status: "PROCESSING" });

    const badShipment = await setStatus(order.id, { status: "PROCESSING", trackingId: "X-1" });
    expect(badShipment.status).toBe(422);

    const shipped = await setStatus(order.id, { status: "SHIPPED", courierProvider: "Pathao", trackingId: "PTH-123" });
    expect(shipped.status).toBe(200);
    expect(shipped.body.data).toMatchObject({ status: "SHIPPED", courierProvider: "pathao", trackingId: "PTH-123" });
    expect(shipped.body.data.shippedAt).not.toBeNull();

    const delivered = await setStatus(order.id, { status: "DELIVERED" });
    expect(delivered.body.data).toMatchObject({ status: "DELIVERED", paymentStatus: "PAID" });
    expect(delivered.body.data.deliveredAt).not.toBeNull();

    const refundBySupport = await setStatus(order.id, { status: "REFUNDED" }, support.token);
    expect(refundBySupport.status).toBe(403);

    const refunded = await setStatus(order.id, { status: "REFUNDED", note: "Damaged item" }, manager.token);
    expect(refunded.status).toBe(200);
    expect(refunded.body.data).toMatchObject({ status: "REFUNDED", paymentStatus: "REFUNDED", allowedTransitions: [] });

    const history = await db
      .select({ to: orderStatusHistory.toStatus })
      .from(orderStatusHistory)
      .where(eq(orderStatusHistory.orderId, order.id))
      .orderBy(orderStatusHistory.createdAt);
    expect(history.map((row) => row.to)).toEqual(["PENDING", "PROCESSING", "SHIPPED", "DELIVERED", "REFUNDED"]);

    expect((await setStatus(order.id, { status: "CANCELLED" })).status).toBe(409);
  }, 30_000);

  it("validates input and enforces RBAC", async () => {
    const order = await placeOrder();
    expect((await setStatus("not-a-uuid", { status: "PROCESSING" })).status).toBe(422);
    expect((await setStatus(order.id, { status: "LOST" })).status).toBe(422);
    expect((await setStatus("00000000-0000-4000-8000-000000000404", { status: "PROCESSING" })).status).toBe(404);
    expect((await setStatus(order.id, { status: "PROCESSING" }, support.token)).status).toBe(403);
    expect((await setStatus(order.id, { status: "PROCESSING" }, customer.token)).status).toBe(403);
    expect((await call("PATCH", `/admin/orders/${order.id}/status`, { body: { status: "PROCESSING" } })).status).toBe(401);
  });
});

describe("Courier dispatch and tracking", () => {
  it("only dispatches PROCESSING orders, once, and exposes tracking to staff and the owner", async () => {
    const order = await placeOrder();

    const early = await call("POST", `/admin/orders/${order.id}/dispatch-courier`, { token: admin.token });
    expect(early.status).toBe(409);
    expect(early.body.error?.code).toBe("INVALID_STATUS_TRANSITION");

    await setStatus(order.id, { status: "PROCESSING" });
    const dispatched = await call<DispatchResultDTO>("POST", `/admin/orders/${order.id}/dispatch-courier`, {
      token: manager.token,
      body: { note: "Fragile skincare package", weightKg: 0.8 },
    });
    expect(dispatched.status).toBe(200);
    expect(dispatched.body.data.parcel.provider).toBe("mock");
    expect(dispatched.body.data.parcel.trackingId).toMatch(/^MOCK-/);
    expect(dispatched.body.data.order).toMatchObject({
      status: "SHIPPED",
      courierProvider: "mock",
      trackingId: dispatched.body.data.parcel.trackingId,
    });
    expect(dispatched.body.data.order.statusHistory.at(-1)?.note).toContain("Dispatched via mock");

    const again = await call("POST", `/admin/orders/${order.id}/dispatch-courier`, { token: admin.token });
    expect(again.status).toBe(409);
    expect(again.body.error?.code).toBe("CONFLICT");

    const adminTracking = await call<OrderTrackingDTO>("GET", `/admin/orders/${order.id}/tracking`, { token: support.token });
    expect(adminTracking.status).toBe(200);
    expect(adminTracking.body.data.courier).toMatchObject({ provider: "mock", normalizedStatus: "PENDING" });
    expect(adminTracking.body.data.history.map((entry) => entry.toStatus)).toEqual(["PENDING", "PROCESSING", "SHIPPED"]);

    const customerTracking = await call<OrderTrackingDTO>("GET", `/orders/${order.orderNumber}/track`, {
      token: customer.token,
    });
    expect(customerTracking.status).toBe(200);
    expect(customerTracking.body.data.courier?.trackingId).toBe(dispatched.body.data.parcel.trackingId);
    expect(customerTracking.body.data.history.every((entry) => entry.changedBy === null)).toBe(true);

    expect((await call("GET", `/admin/orders/${order.id}/tracking`, { token: customer.token })).status).toBe(403);
    expect((await call("GET", `/admin/orders/${order.id}/tracking`)).status).toBe(401);

    // SHIPPED → CANCELLED: the mock courier confirms the parcel cancellation first.
    const cancelled = await setStatus(order.id, { status: "CANCELLED" });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data.statusHistory.at(-1)?.note).toContain("cancelled");
  }, 30_000);

  it("requires explicit confirmation when the courier cannot cancel a shipped parcel", async () => {
    const providerName = `manualtest${RUN}`.toLowerCase();
    const notSupported: CourierProvider = {
      name: providerName,
      isConfigured: true,
      createParcel: () => Promise.reject(new Error("not used")),
      trackParcel: () => Promise.reject(new Error("not used")),
      cancelParcel: async (trackingId): Promise<ParcelCancellation> => ({
        provider: providerName,
        trackingId,
        status: "NOT_SUPPORTED",
        message: "Cancel it in the courier portal",
      }),
    };
    courierService.register(notSupported);

    const order = await placeOrder();
    await setStatus(order.id, { status: "PROCESSING" });
    await setStatus(order.id, { status: "SHIPPED", courierProvider: providerName, trackingId: "MAN-1" });

    const refused = await setStatus(order.id, { status: "CANCELLED" });
    expect(refused.status).toBe(409);
    expect(refused.body.error?.code).toBe("CONFLICT");
    expect(refused.body.error?.details).toMatchObject({ courierCancellation: { status: "NOT_SUPPORTED" } });
    const [stillShipped] = await db.select({ status: orders.status }).from(orders).where(eq(orders.id, order.id));
    expect(stillShipped?.status).toBe("SHIPPED");

    const confirmed = await setStatus(order.id, { status: "CANCELLED", courierCancellationConfirmed: true });
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.data.status).toBe("CANCELLED");
    expect(confirmed.body.data.statusHistory.at(-1)?.note).toContain("confirmed manually");
  }, 30_000);

  it("compensates (cancels the parcel) when the order cannot be updated after booking", async () => {
    const order = await placeOrder();
    await setStatus(order.id, { status: "PROCESSING" });

    const cancelled: string[] = [];
    const oversized: CourierProvider = {
      name: "oversized",
      isConfigured: true,
      // orders.tracking_id is varchar(128): the UPDATE fails after the parcel is booked.
      createParcel: async () => ({
        provider: "oversized",
        trackingId: `T${"X".repeat(200)}`,
        consignmentId: "C-1",
        rawStatus: "pending",
        normalizedStatus: "PENDING",
        labelUrl: null,
      }),
      trackParcel: () => Promise.reject(new Error("not used")),
      cancelParcel: async (trackingId) => {
        cancelled.push(trackingId);
        return { provider: "oversized", trackingId, status: "CANCELLED", message: "cancelled" };
      },
    };
    const service = new OrderFulfillmentService(new CourierService([oversized], "oversized"));
    const errorSpy = spyOn(console, "error").mockImplementation(() => undefined);
    let failure: unknown;
    try {
      await service.dispatch(order.id, {}, { id: admin.id, role: "SUPER_ADMIN" });
    } catch (error) {
      failure = error;
    } finally {
      errorSpy.mockRestore();
    }

    expect(failure).toBeInstanceOf(AppError);
    expect((failure as AppError).details).toMatchObject({ compensation: "CANCELLED" });
    expect(cancelled).toEqual([`T${"X".repeat(200)}`]);
    const [stored] = await db
      .select({ status: orders.status, trackingId: orders.trackingId })
      .from(orders)
      .where(eq(orders.id, order.id));
    expect(stored).toEqual({ status: "PROCESSING", trackingId: null });
  });

  it("refuses to dispatch through an unconfigured courier (503) without touching the order", async () => {
    const order = await placeOrder();
    await setStatus(order.id, { status: "PROCESSING" });
    const service = new OrderFulfillmentService(
      new CourierService([new SteadfastCourierProvider({ apiKey: "", secretKey: "" })], "steadfast"),
    );
    const failure = await service.dispatch(order.id, {}, { id: admin.id, role: "SUPER_ADMIN" }).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(AppError);
    expect((failure as AppError).httpStatus).toBe(503);
    const [stored] = await db.select({ status: orders.status }).from(orders).where(eq(orders.id, order.id));
    expect(stored?.status).toBe("PROCESSING");
  });

  it("validates the dispatch request and enforces COURIER_ASSIGN", async () => {
    const order = await placeOrder();
    const path = `/admin/orders/${order.id}/dispatch-courier`;
    expect((await call("POST", path, { token: support.token })).status).toBe(403);
    expect((await call("POST", path, { token: admin.token, body: { weightKg: -1 } })).status).toBe(422);
    expect((await call("POST", "/admin/orders/nope/dispatch-courier", { token: admin.token })).status).toBe(422);
  });
});

describe("GET /admin/analytics/summary", () => {
  // An isolated business-date window far in the past keeps the assertions exact
  // even while other suites create orders today.
  const day = addDays("1995-01-01", Math.floor(Math.random() * 3650));
  const nextDay = addDays(day, 1);
  const insertedOrderIds: string[] = [];

  beforeAll(async () => {
    const shippingAddress = {
      fullName: "Telemetry Customer",
      phone: "01700000000",
      addressLine1: "Telemetry Road 1",
      city: "Dhaka",
      district: "Dhaka",
      postalCode: "1200",
    };
    // Asia/Dhaka is UTC+6: 17:30Z is 23:30 on `day`, 18:30Z is 00:30 on `nextDay`.
    const fixtures: Array<{ status: "PENDING" | "DELIVERED" | "CANCELLED" | "REFUNDED"; total: string; at: string }> = [
      { status: "PENDING", total: "100.00", at: `${day}T17:30:00Z` },
      { status: "DELIVERED", total: "250.50", at: `${day}T18:30:00Z` },
      { status: "CANCELLED", total: "1000.00", at: `${day}T10:00:00Z` },
      { status: "REFUNDED", total: "700.00", at: `${day}T11:00:00Z` },
    ];
    for (const [index, fixture] of fixtures.entries()) {
      const [row] = await db
        .insert(orders)
        .values({
          orderNumber: `TEL-${RUN}-${index}`.toUpperCase(),
          userId: customer.id,
          status: fixture.status,
          paymentMethod: "COD",
          paymentStatus: "UNPAID",
          shippingAddress,
          subtotal: fixture.total,
          deliveryFee: "0.00",
          total: fixture.total,
          createdAt: new Date(fixture.at),
        })
        .returning({ id: orders.id });
      if (!row) throw new Error("telemetry fixture failed");
      insertedOrderIds.push(row.id);
      await db.insert(orderItems).values({
        orderId: row.id,
        productId,
        quantity: 1,
        unitPrice: fixture.total,
        totalPrice: fixture.total,
      });
    }
  });

  afterAll(async () => {
    if (insertedOrderIds.length > 0) {
      await db.delete(orders).where(inArray(orders.id, insertedOrderIds));
    }
  });

  it("excludes CANCELLED and REFUNDED orders from revenue and buckets days in the business time zone", async () => {
    const res = await call<TelemetrySummaryDTO>("GET", `/admin/analytics/summary?from=${day}&to=${nextDay}`, {
      token: admin.token,
    });
    expect(res.status).toBe(200);
    const summary = res.body.data;
    expect(summary.range).toEqual({ from: day, to: nextDay, timezone: "Asia/Dhaka" });
    expect(summary.totalRevenue).toBe(350.5);
    expect(summary.totalOrders).toBe(4);
    expect(summary.revenueOrderCount).toBe(2);
    expect(summary.avgOrderValue).toBe(175.25);
    expect(summary.ordersByStatus).toEqual({
      PENDING: 1,
      PROCESSING: 0,
      SHIPPED: 0,
      DELIVERED: 1,
      CANCELLED: 1,
      REFUNDED: 1,
    });
    expect(summary.dailyRevenue).toEqual([
      { date: day, revenue: 100, orderCount: 1 },
      { date: nextDay, revenue: 250.5, orderCount: 1 },
    ]);
    expect(summary.topProducts).toEqual([
      { productId, title: `Admin Diaper Pack ${RUN}`, sku: `ADM-DIAPER-${RUN}`, unitsSold: 2, revenue: 350.5 },
    ]);
  });

  it("returns 30 days of revenue, recent orders and inventory counters by default", async () => {
    const res = await call<TelemetrySummaryDTO>("GET", "/admin/analytics/summary", { token: inventoryManager.token });
    expect(res.status).toBe(200);
    const summary = res.body.data;
    expect(summary.dailyRevenue).toHaveLength(30);
    expect(summary.dailyRevenue.at(-1)?.date).toBe(TODAY);
    expect(summary.recentOrders.length).toBeGreaterThan(0);
    expect(summary.recentOrders.length).toBeLessThanOrEqual(5);
    expect(summary.recentOrders[0]).toEqual(
      expect.objectContaining({
        orderNumber: expect.any(String),
        customerName: expect.any(String),
        status: expect.any(String),
        total: expect.any(Number),
        itemCount: expect.any(Number),
        createdAt: expect.any(String),
      }),
    );
    expect(summary.revenueTrendPercent === null || typeof summary.revenueTrendPercent === "number").toBe(true);
    expect(typeof summary.lowStockCount).toBe("number");
    expect(typeof summary.expiringSoonCount).toBe("number");
  });

  it("validates the range and enforces ANALYTICS_READ", async () => {
    expect((await call("GET", `/admin/analytics/summary?from=${nextDay}&to=${day}`, { token: admin.token })).status).toBe(422);
    expect((await call("GET", "/admin/analytics/summary?from=2020-02-30", { token: admin.token })).status).toBe(422);
    expect((await call("GET", "/admin/analytics/summary", { token: customer.token })).status).toBe(403);
    expect((await call("GET", "/admin/analytics/summary", { token: support.token })).status).toBe(403);
  });
});
