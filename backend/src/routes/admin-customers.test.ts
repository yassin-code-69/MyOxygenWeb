import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { addDays } from "../lib/dates";
import type { OrderStatus } from "../services/order-state-machine";
import type { ShippingAddress } from "../types";
import type { CustomerDTO, CustomerDetailDTO, CustomerListItemDTO } from "../services/customer.service";
import { phoneSearchDigits } from "../services/customer.service";
import {
  address,
  call,
  dhakaTime,
  ManagementFixtures,
  RUN,
  type TestUser,
} from "../tests/management-fixtures";

const fixtures = new ManagementFixtures("cust");
// Historic dates: these orders never touch "today"-based figures of other suites.
const BASE = addDays("2008-01-01", Math.floor(Math.random() * 1500));
const NAME = `R1b Shopper ${RUN}`;

let admin: TestUser;
let support: TestUser;
let staffMember: TestUser;
let alpha: TestUser;
let beta: TestUser;
let gamma: TestUser;
const alphaOrderIds: string[] = [];
let alphaFirstAt: Date;
let alphaLastAt: Date;

beforeAll(async () => {
  admin = await fixtures.user("SUPER_ADMIN");
  support = await fixtures.user("SUPPORT_STAFF");
  staffMember = await fixtures.user("INVENTORY_MANAGER", { fullName: `R1b Staff Not Customer ${RUN}` });

  const now = Date.now();
  alpha = await fixtures.user("CUSTOMER", {
    fullName: `${NAME} Alpha`,
    email: `r1b-shopper-alpha-${RUN}@test.myoxygen.local`,
    createdAt: new Date(now - 3 * 3_600_000),
  });
  beta = await fixtures.user("CUSTOMER", {
    fullName: `${NAME} Beta`,
    email: `r1b-shopper-beta-${RUN}@test.myoxygen.local`,
    createdAt: new Date(now - 2 * 3_600_000),
  });
  gamma = await fixtures.user("CUSTOMER", {
    fullName: `${NAME} Gamma`,
    email: `r1b-shopper-gamma-${RUN}@test.myoxygen.local`,
    createdAt: new Date(now - 3_600_000),
  });

  // alpha: 12 orders → 4 statuses + 8 PROCESSING orders at 8 distinct addresses.
  const x = address("X");
  const y = address("Y");
  const plan: Array<{ status: OrderStatus; total: number; at: Date; addr: ShippingAddress }> = [
    { status: "DELIVERED", total: 1000, at: dhakaTime(BASE, "10:00"), addr: x },
    { status: "CANCELLED", total: 500, at: dhakaTime(addDays(BASE, 1), "10:00"), addr: x },
    { status: "REFUNDED", total: 300, at: dhakaTime(addDays(BASE, 2), "10:00"), addr: y },
    { status: "PENDING", total: 250.5, at: dhakaTime(addDays(BASE, 3), "10:00"), addr: y },
    ...Array.from({ length: 8 }, (_, i) => ({
      status: "PROCESSING" as const,
      total: 10,
      at: dhakaTime(addDays(BASE, 4 + i), "10:00"),
      addr: address(`Z${i + 1}`),
    })),
  ];
  for (const entry of plan) {
    alphaOrderIds.push(
      await fixtures.order(alpha.id, {
        status: entry.status,
        total: entry.total,
        createdAt: entry.at,
        shippingAddress: entry.addr,
      }),
    );
  }
  alphaFirstAt = dhakaTime(BASE, "10:00");
  alphaLastAt = dhakaTime(addDays(BASE, 11), "10:00");

  // beta: the same address twice, differing only in case / whitespace → one distinct address.
  const w = address("W");
  await fixtures.order(beta.id, { status: "PENDING", total: 2000, createdAt: dhakaTime(addDays(BASE, 5), "09:00"), shippingAddress: w });
  await fixtures.order(beta.id, {
    status: "DELIVERED",
    total: 1500,
    createdAt: dhakaTime(addDays(BASE, 6), "09:00"),
    shippingAddress: { ...w, fullName: `${w.fullName.toUpperCase()} `, city: "dhaka" },
  });
}, 60_000);

afterAll(async () => {
  await fixtures.cleanup();
});

function ids(rows: Array<{ id: string }>): string[] {
  return rows.map((row) => row.id);
}

describe("GET /admin/customers", () => {
  it("lists CUSTOMER accounts with SQL aggregates (spend excludes CANCELLED/REFUNDED)", async () => {
    const res = await call<CustomerListItemDTO[]>("GET", `/admin/customers?q=${encodeURIComponent(NAME)}`, {
      token: admin.token,
    });
    expect(res.status).toBe(200);
    expect(res.body.meta).toEqual({ page: 1, limit: 20, total: 3, totalPages: 1 });

    const byId = new Map(res.body.data.map((row) => [row.id, row]));
    expect(byId.get(alpha.id)).toEqual({
      id: alpha.id,
      fullName: `${NAME} Alpha`,
      phone: alpha.phone,
      email: `r1b-shopper-alpha-${RUN}@test.myoxygen.local`,
      isActive: true,
      createdAt: expect.any(String),
      ordersCount: 12,
      totalSpent: 1330.5,
      lastOrderAt: alphaLastAt.toISOString(),
    });
    expect(byId.get(beta.id)).toMatchObject({ ordersCount: 2, totalSpent: 3500 });
    expect(byId.get(gamma.id)).toMatchObject({ ordersCount: 0, totalSpent: 0, lastOrderAt: null });
  });

  it("sorts by newest (default), spend_desc and orders_desc", async () => {
    const q = encodeURIComponent(NAME);
    const newest = await call<CustomerListItemDTO[]>("GET", `/admin/customers?q=${q}`, { token: admin.token });
    expect(ids(newest.body.data)).toEqual([gamma.id, beta.id, alpha.id]);

    const spend = await call<CustomerListItemDTO[]>("GET", `/admin/customers?q=${q}&sort=spend_desc`, { token: admin.token });
    expect(ids(spend.body.data)).toEqual([beta.id, alpha.id, gamma.id]);

    const byOrders = await call<CustomerListItemDTO[]>("GET", `/admin/customers?q=${q}&sort=orders_desc`, {
      token: admin.token,
    });
    expect(ids(byOrders.body.data)).toEqual([alpha.id, beta.id, gamma.id]);
  });

  it("paginates", async () => {
    const res = await call<CustomerListItemDTO[]>("GET", `/admin/customers?q=${encodeURIComponent(NAME)}&limit=2&page=2`, {
      token: admin.token,
    });
    expect(res.status).toBe(200);
    expect(ids(res.body.data)).toEqual([alpha.id]);
    expect(res.body.meta).toEqual({ page: 2, limit: 2, total: 3, totalPages: 2 });
  });

  it("finds a customer by phone in every Bangladeshi format and by partial digits", async () => {
    const local = alpha.phone; // 01XXXXXXXXX
    const formats = [
      local,
      `+880${local.slice(1)}`,
      `880${local.slice(1)}`,
      local.slice(1),
      `+880 ${local.slice(1, 5)}-${local.slice(5)}`,
      `${local.slice(0, 5)} ${local.slice(5)}`,
      `(+880) ${local.slice(1)}`,
    ];
    for (const format of formats) {
      const res = await call<CustomerListItemDTO[]>("GET", `/admin/customers?q=${encodeURIComponent(format)}`, {
        token: admin.token,
      });
      expect(res.status).toBe(200);
      expect(ids(res.body.data)).toEqual([alpha.id]);
    }

    const partial = await call<CustomerListItemDTO[]>("GET", `/admin/customers?q=${local.slice(-7)}&limit=100`, {
      token: admin.token,
    });
    expect(ids(partial.body.data)).toContain(alpha.id);
  });

  it("finds customers by name (case-insensitive) and email, treats LIKE wildcards literally, never lists staff", async () => {
    const byName = await call<CustomerListItemDTO[]>(
      "GET",
      `/admin/customers?q=${encodeURIComponent(`shopper ${RUN} BETA`)}`,
      { token: admin.token },
    );
    expect(ids(byName.body.data)).toEqual([beta.id]);

    const byEmail = await call<CustomerListItemDTO[]>("GET", `/admin/customers?q=r1b-shopper-gamma-${RUN}`, {
      token: admin.token,
    });
    expect(ids(byEmail.body.data)).toEqual([gamma.id]);

    const wildcard = await call<CustomerListItemDTO[]>("GET", `/admin/customers?q=${encodeURIComponent(`${RUN}%`)}`, {
      token: admin.token,
    });
    expect(wildcard.body.meta?.total).toBe(0);

    const staff = await call<CustomerListItemDTO[]>("GET", `/admin/customers?q=${encodeURIComponent(staffMember.fullName)}`, {
      token: admin.token,
    });
    expect(staff.body.meta?.total).toBe(0);
  });

  it("validates the query", async () => {
    const badSort = await call("GET", "/admin/customers?sort=alphabetical", { token: admin.token });
    expect(badSort.status).toBe(422);
    const badLimit = await call("GET", "/admin/customers?limit=500", { token: admin.token });
    expect(badLimit.status).toBe(422);
  });
});

describe("phoneSearchDigits", () => {
  it("normalises phone-like terms to local digits and ignores other text", () => {
    expect(phoneSearchDigits("+880 1712-345")).toBe("01712345");
    expect(phoneSearchDigits("1712")).toBe("1712");
    expect(phoneSearchDigits("12")).toBeNull();
    expect(phoneSearchDigits("Rahim")).toBeNull();
  });
});

describe("GET /admin/customers/:id", () => {
  it("returns profile, stats, the 10 latest orders and up to 5 distinct addresses", async () => {
    const res = await call<CustomerDetailDTO>("GET", `/admin/customers/${alpha.id}`, { token: support.token });
    expect(res.status).toBe(200);
    const detail = res.body.data;

    expect(detail.customer).toEqual({
      id: alpha.id,
      fullName: `${NAME} Alpha`,
      phone: alpha.phone,
      email: `r1b-shopper-alpha-${RUN}@test.myoxygen.local`,
      isActive: true,
      createdAt: expect.any(String),
    });
    expect(detail.stats).toEqual({
      ordersCount: 12,
      totalSpent: 1330.5,
      avgOrderValue: 133.05, // 1330.50 over the 10 orders that count as revenue
      firstOrderAt: alphaFirstAt.toISOString(),
      lastOrderAt: alphaLastAt.toISOString(),
    });

    expect(detail.recentOrders).toHaveLength(10);
    expect(detail.recentOrders.map((order) => order.id)).toEqual(alphaOrderIds.slice(2).reverse());
    expect(detail.recentOrders[0]).toMatchObject({
      status: "PROCESSING",
      paymentMethod: "COD",
      total: 10,
      itemCount: 0,
      items: [],
      trackingId: null,
    });

    expect(detail.addresses).toHaveLength(5);
    expect(detail.addresses.map((entry) => entry.addressLine1)).toEqual(
      ["Z8", "Z7", "Z6", "Z5", "Z4"].map((label) => `House ${label}, Road 7`),
    );
  });

  it("de-duplicates addresses that differ only in case or whitespace", async () => {
    const res = await call<CustomerDetailDTO>("GET", `/admin/customers/${beta.id}`, { token: admin.token });
    expect(res.status).toBe(200);
    expect(res.body.data.addresses).toHaveLength(1);
    expect(res.body.data.stats).toMatchObject({ ordersCount: 2, totalSpent: 3500, avgOrderValue: 1750 });
  });

  it("returns empty stats for a customer without orders", async () => {
    const res = await call<CustomerDetailDTO>("GET", `/admin/customers/${gamma.id}`, { token: admin.token });
    expect(res.status).toBe(200);
    expect(res.body.data.stats).toEqual({
      ordersCount: 0,
      totalSpent: 0,
      avgOrderValue: 0,
      firstOrderAt: null,
      lastOrderAt: null,
    });
    expect(res.body.data.recentOrders).toEqual([]);
    expect(res.body.data.addresses).toEqual([]);
  });

  it("answers 404 for staff accounts and unknown ids, 422 for malformed ids", async () => {
    expect((await call("GET", `/admin/customers/${staffMember.id}`, { token: admin.token })).status).toBe(404);
    expect((await call("GET", `/admin/customers/${crypto.randomUUID()}`, { token: admin.token })).status).toBe(404);
    expect((await call("GET", "/admin/customers/not-a-uuid", { token: admin.token })).status).toBe(422);
  });
});

describe("PATCH /admin/customers/:id", () => {
  it("requires STAFF_MANAGE (ORDERS_READ is not enough)", async () => {
    const res = await call("PATCH", `/admin/customers/${gamma.id}`, { token: support.token, body: { isActive: false } });
    expect(res.status).toBe(403);
  });

  it("deactivates a customer (effective immediately) and re-activates it", async () => {
    expect((await call("GET", "/auth/me", { token: gamma.token })).status).toBe(200);

    const off = await call<CustomerDTO>("PATCH", `/admin/customers/${gamma.id}`, {
      token: admin.token,
      body: { isActive: false },
    });
    expect(off.status).toBe(200);
    expect(off.body.data).toEqual({
      id: gamma.id,
      fullName: `${NAME} Gamma`,
      phone: gamma.phone,
      email: `r1b-shopper-gamma-${RUN}@test.myoxygen.local`,
      isActive: false,
      createdAt: expect.any(String),
    });
    expect((await call("GET", "/auth/me", { token: gamma.token })).status).toBe(401);

    const on = await call<CustomerDTO>("PATCH", `/admin/customers/${gamma.id}`, {
      token: admin.token,
      body: { isActive: true },
    });
    expect(on.status).toBe(200);
    expect(on.body.data.isActive).toBe(true);
    expect((await call("GET", "/auth/me", { token: gamma.token })).status).toBe(200);
  });

  it("only touches CUSTOMER accounts (404 for staff ids)", async () => {
    const res = await call("PATCH", `/admin/customers/${staffMember.id}`, { token: admin.token, body: { isActive: false } });
    expect(res.status).toBe(404);
    expect((await call("GET", "/auth/me", { token: staffMember.token })).status).toBe(200);
  });

  it("rejects unknown keys and missing isActive", async () => {
    const extra = await call("PATCH", `/admin/customers/${gamma.id}`, {
      token: admin.token,
      body: { isActive: true, role: "SUPER_ADMIN" },
    });
    expect(extra.status).toBe(422);
    expect((await call("PATCH", `/admin/customers/${gamma.id}`, { token: admin.token, body: {} })).status).toBe(422);
  });
});
