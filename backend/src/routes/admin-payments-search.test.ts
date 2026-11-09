import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { orders } from "../db/schema/tables";
import { addDays } from "../lib/dates";
import type { AdminOrderListItemDTO } from "../services/order-dto";
import type { PaymentSummaryDTO } from "../services/payment.service";
import { phoneSearchDigits, type AdminSearchResultDTO } from "../services/search.service";
import { uniqueId } from "../tests/inventory-fixtures";
import { call, dhakaTime, isolatedDay, ReportFixtures } from "../tests/report-fixtures";

const fx = new ReportFixtures();
const E = isolatedDay(1950, 9);

let admin: { token: string };
let support: { token: string };
let inventoryManager: { token: string };
let orderManager: { token: string };
let marketingManager: { token: string };
let customer: { id: string; token: string; phone: string; fullName: string };
let productId: string;
let productSku: string;
let productTitle: string;
const orderIds: Record<string, string> = {};

beforeAll(async () => {
  admin = await fx.staff("SUPER_ADMIN");
  support = await fx.staff("SUPPORT_STAFF");
  inventoryManager = await fx.staff("INVENTORY_MANAGER");
  orderManager = await fx.staff("ORDER_MANAGER");
  marketingManager = await fx.staff("MARKETING_MANAGER");

  const token = uniqueId("zq");
  const category = await fx.category("Payments");
  const product = await fx.product({ categoryId: category.id, title: `Quokkafoam Cleanser ${token}`, basePrice: "100.00", costPrice: "40.00" });
  productId = product.id;
  productSku = product.sku;
  productTitle = product.title;
  const fullName = `Shirin Quokka ${token}`;
  customer = { ...(await fx.customer(fullName, dhakaTime(addDays(E, -5), "10:00"), `shirin.${token}@reports.test`)), fullName };

  // Q1..Q6 on business day E (amounts are order totals: lines + 60 delivery).
  const fixtures = [
    { key: "Q1", status: "DELIVERED", paymentMethod: "COD", paymentStatus: "PAID", qty: 9 }, // 960
    { key: "Q2", status: "SHIPPED", paymentMethod: "COD", paymentStatus: "UNPAID", qty: 4 }, // 460
    { key: "Q3", status: "CANCELLED", paymentMethod: "COD", paymentStatus: "UNPAID", qty: 6 }, // 660 (ignored)
    { key: "Q4", status: "PROCESSING", paymentMethod: "ONLINE_GATEWAY", paymentStatus: "PAID", qty: 2 }, // 260
    { key: "Q5", status: "CANCELLED", paymentMethod: "ONLINE_GATEWAY", paymentStatus: "FAILED", qty: 1 }, // 160
    { key: "Q6", status: "REFUNDED", paymentMethod: "COD", paymentStatus: "REFUNDED", qty: 3 }, // 360
  ] as const;
  for (const [index, fixture] of fixtures.entries()) {
    orderIds[fixture.key] = await fx.insertOrder({
      userId: customer.id,
      status: fixture.status,
      paymentMethod: fixture.paymentMethod,
      paymentStatus: fixture.paymentStatus,
      createdAt: dhakaTime(E, `1${index}:00`),
      lines: [{ productId, quantity: fixture.qty, unitPrice: "100.00", unitCost: "40.00" }],
    });
  }
});

afterAll(async () => {
  await fx.cleanup();
});

describe("GET /admin/payments/summary", () => {
  it("splits collected, pending COD, refunded and failed money and groups by method and status", async () => {
    const res = await call<PaymentSummaryDTO>("GET", `/admin/payments/summary?from=${E}&to=${E}`, { token: support.token });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      collected: 1220,
      pendingCod: 460,
      refunded: 360,
      failed: 160,
      byMethod: [
        { method: "COD", orders: 3, amount: 1780 },
        { method: "ONLINE_GATEWAY", orders: 1, amount: 260 },
      ],
      byStatus: [
        { status: "UNPAID", orders: 1, amount: 460 },
        { status: "PAID", orders: 2, amount: 1220 },
        { status: "REFUNDED", orders: 1, amount: 360 },
        // Q5 is cancelled but its payment FAILED, so it stays in byStatus and the
        // FAILED row equals the `failed` total (only cancelled UNPAID orders drop out).
        { status: "FAILED", orders: 1, amount: 160 },
      ],
    });
  });

  it("requires ORDERS_READ and a valid range", async () => {
    expect((await call("GET", "/admin/payments/summary", { token: inventoryManager.token })).status).toBe(403);
    expect((await call("GET", "/admin/payments/summary", { token: customer.token })).status).toBe(403);
    expect((await call("GET", "/admin/payments/summary", { token: orderManager.token })).status).toBe(200);
    expect((await call("GET", "/admin/payments/summary?from=2024-01-01&to=2025-06-01", { token: admin.token })).status).toBe(422);
  });
});

describe("GET /admin/orders payment filters", () => {
  async function list(query: string): Promise<string[]> {
    const res = await call<AdminOrderListItemDTO[]>("GET", `/admin/orders?from=${E}&to=${E}&limit=50&${query}`, { token: admin.token });
    expect(res.status).toBe(200);
    return res.body.data.map((row) => row.id).sort();
  }

  it("filters by payment status and method (ALL and CASH_ON_DELIVERY accepted)", async () => {
    expect(await list("paymentStatus=PAID")).toEqual([orderIds.Q1, orderIds.Q4].sort() as string[]);
    expect(await list("paymentMethod=ONLINE_GATEWAY")).toEqual([orderIds.Q4, orderIds.Q5].sort() as string[]);
    expect(await list("paymentMethod=CASH_ON_DELIVERY&paymentStatus=UNPAID")).toEqual([orderIds.Q2, orderIds.Q3].sort() as string[]);
    expect(await list("paymentMethod=ALL&paymentStatus=ALL")).toHaveLength(6);
    expect((await call("GET", "/admin/orders?paymentStatus=SETTLED", { token: admin.token })).status).toBe(422);
    expect((await call("GET", "/admin/orders?paymentMethod=BKASH", { token: admin.token })).status).toBe(422);
  });
});

describe("GET /admin/search", () => {
  it("normalises phone queries", () => {
    expect(phoneSearchDigits("+880 1712-345678")).toBe("01712345678");
    expect(phoneSearchDigits("8801712")).toBe("01712");
    expect(phoneSearchDigits("01712 345")).toBe("01712345");
    expect(phoneSearchDigits("ORD-2026")).toBeNull();
    expect(phoneSearchDigits("12")).toBeNull();
  });

  it("finds products, orders and customers with admin links", async () => {
    const res = await call<AdminSearchResultDTO>("GET", `/admin/search?q=${encodeURIComponent("quokka")}`, { token: admin.token });
    expect(res.status).toBe(200);
    expect(res.body.data.products.find((row) => row.id === productId)).toEqual({
      id: productId,
      title: productTitle,
      sku: productSku,
      image: "/images/products/fixture.jpg",
      href: `/admin/products?productId=${productId}`,
    });
    // All six fixture orders match the customer name: newest five, newest first.
    expect(res.body.data.orders.map((row) => row.id)).toEqual([orderIds.Q6, orderIds.Q5, orderIds.Q4, orderIds.Q3, orderIds.Q2]);
    expect(res.body.data.orders[0]).toMatchObject({ customerName: customer.fullName, status: "REFUNDED", total: 360 });
    expect(res.body.data.customers.find((row) => row.id === customer.id)).toMatchObject({
      phone: customer.phone,
      href: `/admin/customers?customerId=${customer.id}`,
    });
  });

  it("matches SKUs, order numbers and phones in any format", async () => {
    const sku = await call<AdminSearchResultDTO>("GET", `/admin/search?q=${encodeURIComponent(productSku.toLowerCase())}`, { token: admin.token });
    expect(sku.body.data.products[0]?.id).toBe(productId);

    const [q2] = await db.select({ orderNumber: orders.orderNumber }).from(orders).where(eq(orders.id, orderIds.Q2 ?? ""));
    const byNumber = await call<AdminSearchResultDTO>("GET", `/admin/search?q=${q2?.orderNumber ?? ""}`, { token: admin.token });
    expect(byNumber.body.data.orders).toEqual([
      { id: orderIds.Q2, orderNumber: q2?.orderNumber, customerName: expect.any(String), total: 460, status: "SHIPPED", href: `/admin/orders?orderId=${orderIds.Q2}` },
    ]);

    const local = customer.phone; // 01XXXXXXXXX
    for (const format of [local, `+880 ${local.slice(1, 5)}-${local.slice(5)}`, `880${local.slice(1)}`]) {
      const res = await call<AdminSearchResultDTO>("GET", `/admin/search?q=${encodeURIComponent(format)}`, { token: admin.token });
      expect(res.status).toBe(200);
      expect(res.body.data.customers.map((row) => row.id)).toContain(customer.id);
      expect(res.body.data.orders.length).toBeGreaterThan(0);
    }
  });

  it("returns only the groups the caller may read", async () => {
    const q = encodeURIComponent("quokka");
    const inventory = await call<AdminSearchResultDTO>("GET", `/admin/search?q=${q}`, { token: inventoryManager.token });
    expect(inventory.status).toBe(200);
    expect(inventory.body.data.products.length).toBeGreaterThan(0);
    expect(inventory.body.data.orders).toEqual([]);
    expect(inventory.body.data.customers).toEqual([]);

    const orders = await call<AdminSearchResultDTO>("GET", `/admin/search?q=${q}`, { token: orderManager.token });
    expect(orders.body.data.products).toEqual([]);
    expect(orders.body.data.orders.length).toBeGreaterThan(0);
    expect(orders.body.data.customers.length).toBeGreaterThan(0);

    const marketing = await call<AdminSearchResultDTO>("GET", `/admin/search?q=${q}`, { token: marketingManager.token });
    expect(marketing.body.data.products.length).toBeGreaterThan(0);
    expect(marketing.body.data.orders).toEqual([]);

    const supportRes = await call<AdminSearchResultDTO>("GET", `/admin/search?q=${q}`, { token: support.token });
    expect(supportRes.body.data.products.length).toBeGreaterThan(0);
    expect(supportRes.body.data.customers.length).toBeGreaterThan(0);

    expect((await call("GET", `/admin/search?q=${q}`, { token: customer.token })).status).toBe(403);
    expect((await call("GET", `/admin/search?q=${q}`)).status).toBe(401);
    expect((await call("GET", "/admin/search?q=a", { token: admin.token })).status).toBe(422);
    expect((await call("GET", "/admin/search", { token: admin.token })).status).toBe(422);
    expect((await call("GET", `/admin/search?q=${"x".repeat(101)}`, { token: admin.token })).status).toBe(422);
  });
});
