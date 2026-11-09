import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { addDays } from "../lib/dates";
import type { DeliverySummaryDTO } from "../services/delivery.service";
import { resolveDeliveryRange } from "../services/delivery.service";
import { call, dhakaTime, ManagementFixtures, RUN, type OrderFixture, type TestUser } from "../tests/management-fixtures";

const fixtures = new ManagementFixtures("dlv");
// Random historic window: no other suite delivers or cancels orders there.
const BASE = addDays("2012-01-01", Math.floor(Math.random() * 1500));
const FROM = BASE;
const TO = addDays(BASE, 9);
const COURIER = `r1b-courier-${RUN}`;

let admin: TestUser;
let support: TestUser;
let buyer: TestUser;

function at(dayOffset: number, hhmm: string): Date {
  return dhakaTime(addDays(BASE, dayOffset), hhmm);
}

function delivered(shipped: Date | null, deliveredAt: Date, courierProvider: string | null = COURIER): OrderFixture {
  return {
    status: "DELIVERED",
    total: 100,
    createdAt: new Date((shipped ?? deliveredAt).getTime() - 3_600_000),
    shippedAt: shipped,
    deliveredAt,
    courierProvider,
  };
}

function cancelled(shipped: Date | null, cancelledAt: Date): OrderFixture {
  return {
    status: "CANCELLED",
    total: 100,
    createdAt: new Date((shipped ?? cancelledAt).getTime() - 3_600_000),
    shippedAt: shipped,
    cancelledAt,
    courierProvider: shipped === null ? null : COURIER,
  };
}

async function summary(query: string): Promise<DeliverySummaryDTO> {
  const res = await call<DeliverySummaryDTO>("GET", `/admin/delivery/summary${query}`, { token: support.token });
  expect(res.status).toBe(200);
  return res.body.data;
}

beforeAll(async () => {
  admin = await fixtures.user("SUPER_ADMIN");
  support = await fixtures.user("SUPPORT_STAFF");
  buyer = await fixtures.user("CUSTOMER");

  const plan: OrderFixture[] = [
    // In range — shipped → delivered hours: 24, 12, 30 (later refunded), 3 (no courier), 2, 2
    delivered(at(1, "10:00"), at(2, "10:00")),
    delivered(at(3, "08:00"), at(3, "20:00")),
    { ...delivered(at(4, "00:00"), at(5, "06:00")), status: "REFUNDED" },
    delivered(at(5, "10:00"), at(5, "13:00"), null),
    delivered(at(9, "21:30"), at(9, "23:30")), // last 30 minutes of `to` (Dhaka)
    delivered(at(-1, "22:30"), at(0, "00:30")), // first 30 minutes of `from` (still the previous day in UTC)
    // In range but without a usable duration: counted as deliveries, excluded from the average
    delivered(at(6, "12:00"), at(6, "10:00")), // delivered_at before shipped_at (bad data)
    delivered(null, at(7, "10:00")), // never recorded as shipped
    // Out of range
    delivered(at(-2, "10:00"), at(-1, "23:30")), // previous Dhaka day (same UTC day as `from`)
    delivered(at(9, "22:00"), at(10, "00:30")), // next Dhaka day (still `to` in UTC)
    delivered(at(14, "10:00"), at(15, "10:00")),
    // Cancellations
    cancelled(at(2, "10:00"), at(3, "10:00")), // after shipping, in range → counted
    cancelled(null, at(3, "11:00")), // never shipped → not counted
    cancelled(at(-5, "10:00"), at(-2, "10:00")), // before the range
    cancelled(at(8, "10:00"), at(10, "00:30")), // after the range
  ];
  for (const fixture of plan) {
    await fixtures.order(buyer.id, fixture);
  }
}, 60_000);

afterAll(async () => {
  await fixtures.cleanup();
});

describe("GET /admin/delivery/summary", () => {
  it("computes deliveries, cancellations after shipping and the average delivery time in the business range", async () => {
    const data = await summary(`?from=${FROM}&to=${TO}`);
    expect(data.deliveredInRange).toBe(8);
    expect(data.cancelledAfterShipping).toBe(1);
    // (24 + 12 + 30 + 3 + 2 + 2) / 6 = 12.1666… → 12.2
    expect(data.avgDeliveryHours).toBe(12.2);

    expect(data.byCourier.find((entry) => entry.provider === COURIER)).toEqual({
      provider: COURIER,
      inTransit: 0,
      delivered: 7,
    });
    expect(data.byCourier.find((entry) => entry.provider === "unknown")?.delivered).toBe(1);
  });

  it("defaults `from` to the 30 days ending at `to`", async () => {
    const data = await summary(`?to=${TO}`); // BASE-20 … BASE+9
    expect(data.deliveredInRange).toBe(9); // + the delivery on the evening before BASE
    expect(data.cancelledAfterShipping).toBe(2); // + the cancellation two days before BASE
  });

  it("returns zeros and a null average for a range without deliveries", async () => {
    const data = await summary(`?from=${addDays(BASE, 20)}&to=${addDays(BASE, 21)}`);
    expect(data.deliveredInRange).toBe(0);
    expect(data.cancelledAfterShipping).toBe(0);
    expect(data.avgDeliveryHours).toBeNull();
    expect(data.byCourier.find((entry) => entry.provider === COURIER)).toBeUndefined();
  });

  it("counts live PROCESSING (ready to ship) and SHIPPED (in transit) orders per courier", async () => {
    const before = await summary("");
    await fixtures.order(buyer.id, { status: "PROCESSING", total: 100 });
    await fixtures.order(buyer.id, { status: "SHIPPED", total: 100, shippedAt: new Date(), courierProvider: COURIER });
    await fixtures.order(buyer.id, { status: "SHIPPED", total: 100, shippedAt: new Date(), courierProvider: COURIER });
    const after = await summary("");

    expect(after.readyToShip - before.readyToShip).toBe(1);
    expect(after.inTransit - before.inTransit).toBe(2);
    expect(after.byCourier.find((entry) => entry.provider === COURIER)).toEqual({
      provider: COURIER,
      inTransit: 2,
      delivered: 0, // the fixture deliveries are years outside the default 30-day range
    });

    // Live counters do not depend on the range.
    const historic = await summary(`?from=${FROM}&to=${TO}`);
    expect(historic.readyToShip).toBe(after.readyToShip);
    expect(historic.byCourier.find((entry) => entry.provider === COURIER)).toEqual({
      provider: COURIER,
      inTransit: 2,
      delivered: 7,
    });
  });

  it("validates the range (order, calendar dates, ≤ 366 days)", async () => {
    const reversed = await call("GET", `/admin/delivery/summary?from=${TO}&to=${FROM}`, { token: admin.token });
    expect(reversed.status).toBe(422);
    expect((await call("GET", "/admin/delivery/summary?from=2021-02-30", { token: admin.token })).status).toBe(422);
    expect((await call("GET", "/admin/delivery/summary?from=09-01-2021", { token: admin.token })).status).toBe(422);
    expect(
      (await call("GET", "/admin/delivery/summary?from=2020-01-01&to=2021-01-01", { token: admin.token })).status,
    ).toBe(422); // 367 days
    expect(
      (await call("GET", "/admin/delivery/summary?from=2020-01-01&to=2020-12-31", { token: admin.token })).status,
    ).toBe(200); // 366 days (leap year)
  });
});

describe("resolveDeliveryRange", () => {
  it("defaults to the 30 days ending today and validates explicit ranges", () => {
    expect(resolveDeliveryRange({}, "2026-11-09")).toEqual({ from: "2026-10-11", to: "2026-11-09" });
    expect(resolveDeliveryRange({ from: "2026-11-01" }, "2026-11-09")).toEqual({ from: "2026-11-01", to: "2026-11-09" });
    expect(() => resolveDeliveryRange({ from: "2026-12-01" }, "2026-11-09")).toThrow("from must be on or before to");
  });
});

describe("GET /admin/orders date-field and courier filters", () => {
  async function total(query: string): Promise<number> {
    const res = await call<unknown[]>("GET", `/admin/orders?limit=1&${query}`, { token: support.token });
    expect(res.status).toBe(200);
    return res.body.meta?.total ?? -1;
  }

  it("filters the range on deliveredAt when asked, so lists match the delivery KPIs", async () => {
    const range = `from=${FROM}&to=${TO}&status=DELIVERED&courier=${COURIER}`;
    // Delivered in range by this courier: rows 1, 2, 5, 6 (first 30 min of `from`), 7 and 8.
    expect(await total(`${range}&dateField=deliveredAt`)).toBe(6);
    // Courier filter is case-insensitive; "unknown" selects orders without a courier.
    expect(await total(`${range.replace(COURIER, COURIER.toUpperCase())}&dateField=deliveredAt`)).toBe(6);
    expect(await total(`from=${FROM}&to=${TO}&status=DELIVERED&courier=unknown&dateField=deliveredAt`)).toBe(1);
  });

  it("defaults to createdAt, which selects a different set of orders", async () => {
    const byCreated = await call<Array<{ id: string }>>(
      "GET",
      `/admin/orders?limit=100&from=${FROM}&to=${TO}&status=DELIVERED&courier=${COURIER}`,
      { token: support.token },
    );
    const byDelivered = await call<Array<{ id: string }>>(
      "GET",
      `/admin/orders?limit=100&from=${FROM}&to=${TO}&status=DELIVERED&courier=${COURIER}&dateField=deliveredAt`,
      { token: support.token },
    );
    const createdIds = new Set(byCreated.body.data.map((row) => row.id));
    const deliveredIds = new Set(byDelivered.body.data.map((row) => row.id));
    // Placed late on `to` but delivered the next day: in the createdAt list only.
    expect([...createdIds].some((id) => !deliveredIds.has(id))).toBe(true);
    // Placed before `from` but delivered in range: in the deliveredAt list only.
    expect([...deliveredIds].some((id) => !createdIds.has(id))).toBe(true);
    expect((await call("GET", "/admin/orders?dateField=paidAt", { token: support.token })).status).toBe(422);
  });
});
