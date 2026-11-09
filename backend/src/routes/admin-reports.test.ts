/**
 * Dashboard v2, activity feed, products / customers / inventory reports and
 * the SUPER_ADMIN profit reports. Exact numbers come from fixture orders in an
 * isolated business-date window far in the past (see report-fixtures.ts).
 *
 * Fixture window D .. D+1 (previous period D-2 .. D-1), Asia/Dhaka:
 *   O1 C1 DELIVERED/PAID  D 10:00   P1 x2 @500 (cost 300)                    total 1060 ("dhaka ")
 *   O2 C1 SHIPPED/UNPAID  D+1 12:00 P1 x1 @450 (cost 310), P2 x3 @200 (cost 120), coupon 105 → 1005
 *   O3 C2 CANCELLED       D 15:00   P2 x5 @200                               (excluded)
 *   O4 C2 REFUNDED        D+1 09:00 P1 x1 @500                               (excluded)
 *   O5 C3 DELIVERED/PAID  D-1 11:00 P2 x2 @200 (cost 100)                    total 460 (previous)
 *   Expenses: MARKETING 300 (D), SHIPPING 150.50 (D+1), OTHER 1000 (D-1), RENT 999 (D+2, outside)
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { addDays, todayInBusinessTz } from "../lib/dates";
import type { TelemetrySummaryDTO } from "../services/admin-telemetry.service";
import type { ExpenseDTO } from "../services/expense.service";
import type { OrderDetailDTO } from "../services/order-dto";
import type { ActivityItemDTO } from "../services/reports/activity.service";
import type { InventoryReportDTO } from "../services/reports/inventory-report.service";
import type {
  ProfitProductDetailDTO,
  ProfitProductRowDTO,
  ProfitSummaryDTO,
} from "../services/reports/profit-report.service";
import type { CustomerReportDTO, ProductReportRowDTO } from "../services/reports/sales-report.service";
import type { PaginationMeta } from "../types";
import { uniqueId } from "../tests/inventory-fixtures";
import { call, dhakaTime, isolatedDay, ReportFixtures } from "../tests/report-fixtures";

const fx = new ReportFixtures();
const D = isolatedDay(1972, 16);
const D1 = addDays(D, 1);
const PREV = addDays(D, -1);
const TODAY = todayInBusinessTz();

let admin: { id: string; token: string };
let inventoryManager: { token: string };
let orderManager: { token: string };
let marketingManager: { token: string };
let support: { token: string };
let categoryId: string;
let categoryName: string;
let p1: { id: string; title: string; slug: string; sku: string };
let p2: { id: string; title: string; slug: string; sku: string };
let p3: { id: string; title: string; slug: string; sku: string };
let c1: { id: string; token: string };
let c2: { id: string; token: string };

beforeAll(async () => {
  admin = await fx.staff("SUPER_ADMIN");
  inventoryManager = await fx.staff("INVENTORY_MANAGER");
  orderManager = await fx.staff("ORDER_MANAGER");
  marketingManager = await fx.staff("MARKETING_MANAGER");
  support = await fx.staff("SUPPORT_STAFF");

  const category = await fx.category("Reports A");
  categoryId = category.id;
  categoryName = category.name;
  p1 = await fx.product({ categoryId, title: `Rep Lotion ${uniqueId()}`, basePrice: "500.00", costPrice: "300.00", requiresBatchTracking: false });
  p2 = await fx.product({ categoryId, title: `Rep Wipes ${uniqueId()}`, basePrice: "200.00", costPrice: "120.00", requiresBatchTracking: false });
  p3 = await fx.product({ categoryId, title: `Rep Unsold ${uniqueId()}`, basePrice: "1000.00", costPrice: "400.00", requiresBatchTracking: false });

  c1 = await fx.customer("Rep Loyal Customer", dhakaTime(addDays(D, -10), "10:00"));
  await fx.customer("Rep Previous Customer", dhakaTime(PREV, "09:00"));
  c2 = await fx.customer("Rep New Customer", dhakaTime(D, "08:00"));
  const c3Id = (await fx.customer("Rep Earlier Buyer", dhakaTime(addDays(D, -20), "10:00"))).id;

  await fx.insertOrder({
    userId: c1.id,
    status: "DELIVERED",
    paymentStatus: "PAID",
    createdAt: dhakaTime(D, "10:00"),
    district: "dhaka ",
    lines: [{ productId: p1.id, quantity: 2, unitPrice: "500.00", unitCost: "300.00" }],
  });
  await fx.insertOrder({
    userId: c1.id,
    status: "SHIPPED",
    createdAt: dhakaTime(D1, "12:00"),
    discountAmount: "105.00",
    district: "Dhaka",
    lines: [
      { productId: p1.id, quantity: 1, unitPrice: "450.00", unitCost: "310.00" },
      { productId: p2.id, quantity: 3, unitPrice: "200.00", unitCost: "120.00" },
    ],
  });
  await fx.insertOrder({
    userId: c2.id,
    status: "CANCELLED",
    createdAt: dhakaTime(D, "15:00"),
    lines: [{ productId: p2.id, quantity: 5, unitPrice: "200.00", unitCost: "120.00" }],
  });
  await fx.insertOrder({
    userId: c2.id,
    status: "REFUNDED",
    paymentStatus: "REFUNDED",
    createdAt: dhakaTime(D1, "09:00"),
    lines: [{ productId: p1.id, quantity: 1, unitPrice: "500.00", unitCost: "300.00" }],
  });
  await fx.insertOrder({
    userId: c3Id,
    status: "DELIVERED",
    paymentStatus: "PAID",
    createdAt: dhakaTime(PREV, "11:00"),
    district: "Sylhet",
    lines: [{ productId: p2.id, quantity: 2, unitPrice: "200.00", unitCost: "100.00" }],
  });

  for (const expense of [
    { category: "MARKETING", amount: 300, incurredOn: D },
    { category: "SHIPPING", amount: "150.50", incurredOn: D1 },
    { category: "OTHER", amount: 1000, incurredOn: PREV },
    { category: "RENT", amount: 999, incurredOn: addDays(D, 2) },
  ]) {
    const res = await call<ExpenseDTO>("POST", "/admin/expenses", { token: admin.token, body: expense });
    if (res.status !== 201) throw new Error(`expense fixture failed: ${res.status} ${JSON.stringify(res.body.error)}`);
    fx.trackExpense(res.body.data.id);
  }

  const patched = await call("PATCH", `/admin/catalog/products/${p1.id}`, {
    token: admin.token,
    body: { costBreakdown: { supplierPrice: 250, shipping: 30, customsDuty: 10, packaging: 5, other: 5 } },
  });
  if (patched.status !== 200) throw new Error(`cost breakdown fixture failed: ${patched.status}`);
}, 60_000);

afterAll(async () => {
  await fx.cleanup();
});

// ---------------------------------------------------------------------------

describe("GET /admin/analytics/summary (v2)", () => {
  it("computes KPIs against the previous period, series, statuses and product blocks", async () => {
    const res = await call<TelemetrySummaryDTO>("GET", `/admin/analytics/summary?from=${D}&to=${D1}`, { token: admin.token });
    expect(res.status).toBe(200);
    const s = res.body.data;
    expect(s.range).toEqual({
      from: D,
      to: D1,
      timezone: "Asia/Dhaka",
      previousFrom: addDays(D, -2),
      previousTo: PREV,
      granularity: "day",
    });
    expect(s.kpis).toEqual({
      revenue: { value: 2065, previous: 460, changePercent: 348.91 },
      orders: { value: 4, previous: 1, changePercent: 300 },
      customers: { value: 4, previous: 3, changePercent: 33.33 },
      newCustomers: { value: 1, previous: 1, changePercent: 0 },
      productsSold: { value: 6, previous: 2, changePercent: 200 },
      avgOrderValue: { value: 1032.5, previous: 460, changePercent: 124.46 },
    });
    // Legacy fields keep their meaning for the resolved range.
    expect(s.totalRevenue).toBe(2065);
    expect(s.totalOrders).toBe(4);
    expect(s.revenueOrderCount).toBe(2);
    expect(s.avgOrderValue).toBe(1032.5);
    expect(s.dailyRevenue).toEqual([
      { date: D, revenue: 1060, orderCount: 1 },
      { date: D1, revenue: 1005, orderCount: 1 },
    ]);
    expect(s.revenueSeries.map((point) => ({ period: point.period, revenue: point.revenue, orders: point.orders }))).toEqual([
      { period: D, revenue: 1060, orders: 2 },
      { period: D1, revenue: 1005, orders: 2 },
    ]);
    expect(s.revenueSeries[0]?.label).toMatch(/^[A-Z][a-z]{2} \d{1,2}$/);
    expect(s.ordersByStatus).toEqual({ PENDING: 0, PROCESSING: 0, SHIPPED: 1, DELIVERED: 1, CANCELLED: 1, REFUNDED: 1 });
    expect(s.topProducts).toEqual([
      {
        productId: p1.id,
        title: p1.title,
        slug: p1.slug,
        sku: p1.sku,
        image: "/images/products/fixture.jpg",
        categoryName,
        unitsSold: 3,
        revenue: 1405, // 1000 + (450 - 105 * 450/1050)
      },
      {
        productId: p2.id,
        title: p2.title,
        slug: p2.slug,
        sku: p2.sku,
        image: "/images/products/fixture.jpg",
        categoryName,
        unitsSold: 3,
        revenue: 540, // 600 - 105 * 600/1050
      },
    ]);
    expect(s.salesByCategory).toEqual([
      { categoryId, name: categoryName, slug: expect.any(String), revenue: 1945, unitsSold: 6, sharePercent: 100 },
    ]);
  });

  it("uses month buckets above 92 days and zero-fills every bucket", async () => {
    const from = addDays(D, -100);
    const res = await call<TelemetrySummaryDTO>("GET", `/admin/analytics/summary?from=${from}&to=${D1}`, { token: admin.token });
    expect(res.status).toBe(200);
    const s = res.body.data;
    expect(s.range.granularity).toBe("month");
    const periods = s.revenueSeries.map((point) => point.period);
    expect(periods[0]).toBe(from.slice(0, 7));
    expect(periods.at(-1)).toBe(D1.slice(0, 7));
    for (let i = 1; i < periods.length; i++) {
      const [year, month] = (periods[i - 1] ?? "").split("-").map(Number) as [number, number];
      const next = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, "0")}`;
      expect(periods[i]).toBe(next);
    }
    expect(s.revenueSeries.every((point) => /^[A-Z][a-z]{2} \d{4}$/.test(point.label))).toBe(true);
    expect(s.revenueSeries.reduce((sum, point) => sum + point.revenue, 0)).toBe(2525);
    expect(s.revenueSeries.reduce((sum, point) => sum + point.orders, 0)).toBe(5);
    expect(s.dailyRevenue).toHaveLength(102);
  });

  it("serves the dashboard blocks for the default range", async () => {
    const res = await call<TelemetrySummaryDTO>("GET", "/admin/analytics/summary", { token: marketingManager.token });
    expect(res.status).toBe(200);
    const s = res.body.data;
    expect(s.range).toMatchObject({ from: addDays(TODAY, -6), to: TODAY, granularity: "day" });
    expect(s.revenueSeries).toHaveLength(7);
    expect(s.latestCustomers.length).toBeLessThanOrEqual(5);
    expect(s.lowStockProducts.length).toBeLessThanOrEqual(5);
    expect(s.lowStockProducts.length).toBeLessThanOrEqual(s.lowStockCount);
    for (const order of s.recentOrders) {
      expect(order).toEqual(expect.objectContaining({ itemCount: expect.any(Number) }));
      expect(order.firstItemImage === null || typeof order.firstItemImage === "string").toBe(true);
    }
  });

  it("validates the range", async () => {
    expect((await call("GET", `/admin/analytics/summary?from=2020-01-01&to=2021-01-02`, { token: admin.token })).status).toBe(422);
    expect((await call("GET", `/admin/analytics/summary?from=${D1}&to=${D}`, { token: admin.token })).status).toBe(422);
  });
});

describe("GET /admin/analytics/activity", () => {
  let order: OrderDetailDTO;
  let ledgerEntryId: string;

  beforeAll(async () => {
    const activityCategory = await fx.category("Reports Activity");
    const product = await fx.product({ categoryId: activityCategory.id, basePrice: "300.00", costPrice: "100.00" });
    const imported = await call<{ ledgerEntryId: string }>("POST", "/admin/inventory/batches", {
      token: admin.token,
      body: { productId: product.id, batchNumber: uniqueId("ACT-").toUpperCase(), expiryDate: addDays(TODAY, 400), initialQuantity: 20 },
    });
    if (imported.status !== 201) throw new Error(`batch import failed: ${imported.status}`);
    ledgerEntryId = imported.body.data.ledgerEntryId;
    const placed = await call<OrderDetailDTO>("POST", "/orders/checkout", {
      token: c2.token,
      body: {
        shippingAddress: {
          fullName: "Activity Buyer",
          phone: "01711000111",
          addressLine1: "Road 5",
          city: "Dhaka",
          district: "Dhaka",
          postalCode: "1207",
        },
        items: [{ productId: product.id, quantity: 2 }],
        paymentMethod: "COD",
      },
    });
    if (placed.status !== 201) throw new Error(`checkout failed: ${placed.status} ${JSON.stringify(placed.body.error)}`);
    order = placed.body.data;
    fx.trackOrder(order.id);
    for (const status of ["PROCESSING", "SHIPPED", "DELIVERED"]) {
      const res = await call("PATCH", `/admin/orders/${order.id}/status`, { token: admin.token, body: { status } });
      if (res.status !== 200) throw new Error(`status ${status} failed: ${res.status}`);
    }
  });

  it("lists real events newest first with admin links", async () => {
    const res = await call<ActivityItemDTO[]>("GET", "/admin/analytics/activity?limit=50", { token: inventoryManager.token });
    expect(res.status).toBe(200);
    const items = res.body.data;
    expect(items.length).toBeLessThanOrEqual(50);
    for (let i = 1; i < items.length; i++) {
      expect(new Date(items[i - 1]?.at ?? 0).getTime()).toBeGreaterThanOrEqual(new Date(items[i]?.at ?? 0).getTime());
    }
    expect(items.find((item) => item.id === `ORDER_PLACED:${order.id}`)).toMatchObject({
      type: "ORDER_PLACED",
      title: `New order ${order.orderNumber}`,
      href: `/admin/orders?orderId=${order.id}`,
    });
    const changes = items.filter((item) => item.type === "ORDER_STATUS_CHANGED" && item.title.includes(order.orderNumber));
    expect(changes.map((item) => item.title).sort()).toEqual(
      [
        `Order ${order.orderNumber} Pending → Processing`,
        `Order ${order.orderNumber} Processing → Shipped`,
        `Order ${order.orderNumber} Shipped → Delivered`,
      ].sort(),
    );
    const payment = items.find((item) => item.type === "PAYMENT_RECEIVED" && item.title.includes(order.orderNumber));
    expect(payment).toMatchObject({ description: "৳660 · Cash on delivery", href: `/admin/orders?orderId=${order.id}` });
    expect(items.find((item) => item.id === `STOCK_IMPORTED:${ledgerEntryId}`)?.description).toMatch(/^\+20 units · batch ACT-/);
  });

  it("honours and validates the limit", async () => {
    const res = await call<ActivityItemDTO[]>("GET", "/admin/analytics/activity?limit=3", { token: admin.token });
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeLessThanOrEqual(3);
    expect((await call("GET", "/admin/analytics/activity?limit=51", { token: admin.token })).status).toBe(422);
    expect((await call("GET", "/admin/analytics/activity?limit=0", { token: admin.token })).status).toBe(422);
    expect((await call("GET", "/admin/analytics/activity", { token: support.token })).status).toBe(403);
  });
});

describe("GET /admin/reports/products", () => {
  it("aggregates net revenue, units and orders per product with totals", async () => {
    const res = await call<ProductReportRowDTO[], PaginationMeta & { totals: { unitsSold: number; revenue: number } }>(
      "GET",
      `/admin/reports/products?from=${D}&to=${D1}&categoryId=${categoryId}`,
      { token: orderManager.token },
    );
    expect(res.status).toBe(200);
    const rows = res.body.data.filter((row) => [p1.id, p2.id, p3.id].includes(row.productId));
    expect(rows.map((row) => row.productId)).toEqual([p1.id, p2.id, p3.id]);
    expect(rows[0]).toMatchObject({
      title: p1.title,
      sku: p1.sku,
      slug: p1.slug,
      image: "/images/products/fixture.jpg",
      category: { id: categoryId, name: categoryName },
      unitsSold: 3,
      revenue: 1405,
      ordersCount: 2,
      avgSellingPrice: 468.33,
      currentStock: 0,
      lastSoldAt: dhakaTime(D1, "12:00").toISOString(),
      isActive: true,
    });
    expect(rows[1]).toMatchObject({ unitsSold: 3, revenue: 540, ordersCount: 1, avgSellingPrice: 180 });
    expect(rows[2]).toMatchObject({ unitsSold: 0, revenue: 0, ordersCount: 0, avgSellingPrice: 0, lastSoldAt: null });
    expect(res.body.meta).toMatchObject({ totals: { unitsSold: 6, revenue: 1945 } });
  });

  it("sorts and searches", async () => {
    const byTitle = await call<ProductReportRowDTO[]>("GET", `/admin/reports/products?from=${D}&to=${D1}&categoryId=${categoryId}&sort=title_asc`, {
      token: admin.token,
    });
    const titles = byTitle.body.data.map((row) => row.title);
    expect(titles).toEqual([...titles].sort((a, b) => a.localeCompare(b)));
    const search = await call<ProductReportRowDTO[]>("GET", `/admin/reports/products?q=${encodeURIComponent(p2.sku)}`, { token: admin.token });
    expect(search.body.data.map((row) => row.productId)).toEqual([p2.id]);
    expect((await call("GET", "/admin/reports/products?sort=nope", { token: admin.token })).status).toBe(422);
    expect((await call("GET", "/admin/reports/products?categoryId=abc", { token: admin.token })).status).toBe(422);
  });
});

describe("GET /admin/reports/customers", () => {
  it("computes customer KPIs, sign-ups, districts and top customers", async () => {
    const res = await call<CustomerReportDTO>("GET", `/admin/reports/customers?from=${D}&to=${D1}`, { token: admin.token });
    expect(res.status).toBe(200);
    const report = res.body.data;
    expect(report.kpis).toEqual({
      totalCustomers: { value: 4, previous: 3, changePercent: 33.33 },
      newCustomers: { value: 1, previous: 1, changePercent: 0 },
      returningCustomers: { value: 1, previous: 0, changePercent: null },
      repeatRatePercent: 100,
      avgOrderValue: { value: 1032.5, previous: 460, changePercent: 124.46 },
    });
    expect(report.signupSeries.map((point) => [point.period, point.count])).toEqual([
      [D, 1],
      [D1, 0],
    ]);
    expect(report.byDistrict).toEqual([{ district: "Dhaka", orders: 2, revenue: 2065 }]);
    expect(report.topCustomers).toEqual([
      {
        id: c1.id,
        fullName: "Rep Loyal Customer",
        phone: expect.any(String),
        email: expect.any(String),
        orders: 2,
        totalSpent: 2065,
        lastOrderAt: dhakaTime(D1, "12:00").toISOString(),
      },
    ]);
    expect(res.body.meta).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
  });
});

describe("GET /admin/reports/inventory", () => {
  it("values stock and lists low, expiring and dead stock", async () => {
    const category = await fx.category("Reports Inventory");
    const product = await fx.product({ categoryId: category.id, basePrice: "80.00", costPrice: "50.00", lowStockThreshold: 5 });
    const batch = await fx.batch(product.id, addDays(TODAY, 20), 3);

    const res = await call<InventoryReportDTO>("GET", "/admin/reports/inventory", { token: inventoryManager.token });
    expect(res.status).toBe(200);
    const report = res.body.data;
    expect(report.totals.productCount).toBeGreaterThanOrEqual(report.totals.activeCount);
    expect(report.byCategory.find((row) => row.categoryId === category.id)).toEqual({
      categoryId: category.id,
      name: category.name,
      stockUnits: 3,
      valueCost: 150,
      valueRetail: 240,
    });
    expect(report.lowStock.find((row) => row.productId === product.id)).toMatchObject({
      totalStock: 3,
      lowStockThreshold: 5,
      listingStatus: "ACTIVE",
    });
    expect(report.expiringSoon.find((row) => row.id === batch.id)).toMatchObject({ healthStatus: "EXPIRING_SOON", availableQuantity: 3 });
    expect(report.deadStock.find((row) => row.productId === product.id)).toMatchObject({
      totalStock: 3,
      lastSoldAt: null,
      daysSinceLastSale: null,
    });
  });
});

describe("GET /admin/reports/profit (SUPER_ADMIN)", () => {
  it("computes revenue, COGS, gross/net profit and margins against the previous period", async () => {
    const res = await call<ProfitSummaryDTO>("GET", `/admin/reports/profit?from=${D}&to=${D1}`, { token: admin.token });
    expect(res.status).toBe(200);
    const report = res.body.data;
    expect(report.range).toMatchObject({ from: D, to: D1, previousFrom: addDays(D, -2), previousTo: PREV, granularity: "day" });
    expect(report.kpis).toEqual({
      revenue: { value: 2065, previous: 460, changePercent: 348.91 },
      cogs: { value: 1270, previous: 200, changePercent: 535 },
      grossProfit: { value: 795, previous: 260, changePercent: 205.77 },
      grossMarginPercent: { value: 38.5, previous: 56.52, changePercent: -31.88 },
      expenses: { value: 450.5, previous: 1000, changePercent: -54.95 },
      netProfit: { value: 344.5, previous: -740, changePercent: 146.55 },
      netMarginPercent: { value: 16.68, previous: -160.87, changePercent: 110.37 },
    });
    expect(report.trend.map(({ period, revenue, cost, profit, marginPercent }) => ({ period, revenue, cost, profit, marginPercent }))).toEqual([
      { period: D, revenue: 1060, cost: 600, profit: 460, marginPercent: 43.4 },
      { period: D1, revenue: 1005, cost: 670, profit: 335, marginPercent: 33.33 },
    ]);
    expect(report.byCategory).toEqual([
      { categoryId, name: categoryName, revenue: 1945, cost: 1270, profit: 675, marginPercent: 34.7 },
    ]);
    expect(report.topProfitable).toEqual([
      { productId: p1.id, title: p1.title, image: "/images/products/fixture.jpg", profit: 495, marginPercent: 35.23 },
      { productId: p2.id, title: p2.title, image: "/images/products/fixture.jpg", profit: 180, marginPercent: 33.33 },
    ]);
    expect(report.expenseBreakdown).toEqual([
      { key: "PRODUCT_COST", label: "Product cost", amount: 1270, percent: 73.82 },
      { key: "MARKETING", label: "Marketing", amount: 300, percent: 17.44 },
      { key: "SHIPPING", label: "Shipping", amount: 150.5, percent: 8.75 },
    ]);
  });

  it("lists product profitability (unsold products use current prices) and sorts by margin", async () => {
    const res = await call<ProfitProductRowDTO[]>(
      "GET",
      `/admin/reports/profit/products?from=${D}&to=${D1}&categoryId=${categoryId}`,
      { token: admin.token },
    );
    expect(res.status).toBe(200);
    const rows = res.body.data.filter((row) => [p1.id, p2.id, p3.id].includes(row.productId));
    const unsold = await call<{ effectivePrice: number }>("GET", `/admin/catalog/products/${p3.id}`, { token: admin.token });
    const effective = unsold.body.data.effectivePrice;
    const unsoldMargin = Math.round(((effective - 400) / effective) * 10_000) / 100;

    expect(rows.find((row) => row.productId === p1.id)).toEqual({
      productId: p1.id,
      title: p1.title,
      sku: p1.sku,
      image: "/images/products/fixture.jpg",
      category: { id: categoryId, name: categoryName },
      sellingPrice: 468.33,
      avgCost: 303.33,
      profitPerUnit: 165,
      marginPercent: 35.23,
      unitsSold: 3,
      revenue: 1405,
      cogs: 910,
      profit: 495,
      isActive: true,
    });
    expect(rows.find((row) => row.productId === p2.id)).toMatchObject({
      sellingPrice: 180,
      avgCost: 120,
      profitPerUnit: 60,
      marginPercent: 33.33,
      revenue: 540,
      cogs: 360,
      profit: 180,
    });
    expect(rows.find((row) => row.productId === p3.id)).toMatchObject({
      sellingPrice: effective,
      avgCost: 400,
      unitsSold: 0,
      revenue: 0,
      cogs: 0,
      profit: 0,
      marginPercent: unsoldMargin,
    });
    const margins = res.body.data.map((row) => row.marginPercent);
    expect(margins).toEqual([...margins].sort((a, b) => b - a));

    const ascending = await call<ProfitProductRowDTO[]>(
      "GET",
      `/admin/reports/profit/products?from=${D}&to=${D1}&categoryId=${categoryId}&sort=margin_asc&limit=1`,
      { token: admin.token },
    );
    expect(ascending.body.data.map((row) => row.productId)).toEqual([p2.id]);
    expect(ascending.body.meta).toMatchObject({ page: 1, limit: 1, total: 3, totalPages: 3 });
  });

  it("explains one product: totals, cost breakdown and per-unit pricing", async () => {
    const res = await call<ProfitProductDetailDTO>("GET", `/admin/reports/profit/products/${p1.id}?from=${D}&to=${D1}`, {
      token: admin.token,
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      product: {
        id: p1.id,
        title: p1.title,
        sku: p1.sku,
        image: "/images/products/fixture.jpg",
        category: { id: categoryId, name: categoryName },
        isActive: true,
      },
      range: { from: D, to: D1, timezone: "Asia/Dhaka", previousFrom: addDays(D, -2), previousTo: PREV, granularity: "day" },
      unitsSold: 3,
      revenue: 1405,
      cogs: 910,
      grossProfit: 495,
      marginPercent: 35.23,
      costBreakdown: { supplierPrice: 250, shipping: 30, customsDuty: 10, packaging: 5, other: 5, landedCost: 300 },
      pricing: { basePrice: 500, avgDiscountPerUnit: 31.67, netSellingPrice: 468.33, profitPerUnit: 168.33, marginPercent: 35.94 },
    });
    expect((await call("GET", `/admin/reports/profit/products/00000000-0000-4000-8000-000000000000`, { token: admin.token })).status).toBe(404);
    expect((await call("GET", `/admin/reports/profit/products/not-a-uuid`, { token: admin.token })).status).toBe(422);
  });

  it("is SUPER_ADMIN only, while analytics roles keep the other reports", async () => {
    for (const token of [inventoryManager.token, orderManager.token, marketingManager.token]) {
      expect((await call("GET", "/admin/reports/profit", { token })).status).toBe(403);
      expect((await call("GET", "/admin/reports/profit/products", { token })).status).toBe(403);
      expect((await call("GET", `/admin/reports/profit/products/${p1.id}`, { token })).status).toBe(403);
      expect((await call("GET", `/admin/reports/products?from=${D}&to=${D1}&categoryId=${categoryId}`, { token })).status).toBe(200);
    }
    for (const path of ["/admin/reports/products", "/admin/reports/customers", "/admin/reports/inventory"]) {
      expect((await call("GET", path, { token: support.token })).status).toBe(403);
      expect((await call("GET", path, { token: c1.token })).status).toBe(403);
      expect((await call("GET", path)).status).toBe(401);
    }
    expect((await call("GET", "/admin/reports/profit")).status).toBe(401);
  });
});
