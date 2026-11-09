import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { addDays, todayInBusinessTz } from "../lib/dates";
import type { ExpenseDTO } from "../services/expense.service";
import type { PaginationMeta } from "../types";
import { call, isolatedDay, ReportFixtures } from "../tests/report-fixtures";

const fx = new ReportFixtures();
const D = isolatedDay(1960, 9);
const TODAY = todayInBusinessTz();

type ExpenseMeta = PaginationMeta & { totalAmount: number };

let admin: { id: string; token: string };
let orderManager: { token: string };
let customer: { token: string };

async function create(body: Record<string, unknown>) {
  const res = await call<ExpenseDTO>("POST", "/admin/expenses", { token: admin.token, body });
  if (res.status === 201) fx.trackExpense(res.body.data.id);
  return res;
}

beforeAll(async () => {
  admin = await fx.staff("SUPER_ADMIN");
  orderManager = await fx.staff("ORDER_MANAGER");
  customer = await fx.staff("CUSTOMER");
});

afterAll(async () => {
  await fx.cleanup();
});

describe("POST /admin/expenses", () => {
  it("creates an expense and returns the DTO", async () => {
    const res = await create({ category: "MARKETING", amount: "1250.75", incurredOn: D, vendor: "  Meta Ads  ", note: "Boosted post" });
    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({
      id: expect.any(String),
      category: "MARKETING",
      amount: 1250.75,
      incurredOn: D,
      vendor: "Meta Ads",
      note: "Boosted post",
      createdBy: { id: admin.id, fullName: expect.stringContaining("SUPER_ADMIN") },
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
  });

  it("accepts today and stores blank optional text as null", async () => {
    const res = await create({ category: "OTHER", amount: 10, incurredOn: TODAY, vendor: "", note: null });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ amount: 10, incurredOn: TODAY, vendor: null, note: null });
  });

  it("rejects invalid payloads with 422 field errors", async () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ category: "MARKETING", amount: 0, incurredOn: D }, "amount"],
      [{ category: "MARKETING", amount: -5, incurredOn: D }, "amount"],
      [{ category: "MARKETING", amount: 1.234, incurredOn: D }, "amount"],
      [{ category: "MARKETING", amount: "abc", incurredOn: D }, "amount"],
      [{ category: "MARKETING", amount: 10_000_000_000, incurredOn: D }, "amount"],
      [{ category: "COFFEE", amount: 10, incurredOn: D }, "category"],
      [{ category: "RENT", amount: 10, incurredOn: addDays(TODAY, 1) }, "incurredOn"],
      [{ category: "RENT", amount: 10, incurredOn: "2026-02-30" }, "incurredOn"],
      [{ category: "RENT", amount: 10, incurredOn: D, vendor: "x".repeat(121) }, "vendor"],
      [{ category: "RENT", amount: 10, incurredOn: D, note: "x".repeat(501) }, "note"],
      [{ amount: 10, incurredOn: D }, "category"],
    ];
    for (const [body, field] of cases) {
      const res = await create(body);
      expect(res.status).toBe(422);
      expect(res.body.error?.code).toBe("VALIDATION_ERROR");
      expect(Object.keys((res.body.error?.details as { fieldErrors: Record<string, unknown> }).fieldErrors)).toContain(field);
    }
    const unknownKey = await create({ category: "RENT", amount: 10, incurredOn: D, paidBy: "cash" });
    expect(unknownKey.status).toBe(422);
  });
});

describe("GET /admin/expenses", () => {
  beforeAll(async () => {
    await create({ category: "SHIPPING", amount: 100, incurredOn: addDays(D, 1) });
    await create({ category: "SHIPPING", amount: "200.50", incurredOn: addDays(D, 2) });
    await create({ category: "RENT", amount: 5000, incurredOn: addDays(D, 2) });
  });

  it("filters by range and category, newest first, with the total amount", async () => {
    const all = await call<ExpenseDTO[], ExpenseMeta>("GET", `/admin/expenses?from=${D}&to=${addDays(D, 2)}`, { token: admin.token });
    expect(all.status).toBe(200);
    expect(all.body.data.map((row) => row.incurredOn)).toEqual([addDays(D, 2), addDays(D, 2), addDays(D, 1), D]);
    expect(all.body.meta).toMatchObject({ page: 1, limit: 20, total: 4, totalPages: 1, totalAmount: 6551.25 });
    const byCategory = (all.body.meta as unknown as { byCategory: Array<{ category: string; count: number; amount: number }> })
      .byCategory;
    expect(byCategory[0]).toEqual({ category: "RENT", count: 1, amount: 5000 });
    expect(byCategory.find((row) => row.category === "SHIPPING")).toEqual({ category: "SHIPPING", count: 2, amount: 300.5 });
    expect(byCategory.reduce((sum, row) => sum + row.amount, 0)).toBeCloseTo(6551.25, 2);
    expect(byCategory.reduce((sum, row) => sum + row.count, 0)).toBe(4);

    const shipping = await call<ExpenseDTO[], ExpenseMeta>(
      "GET",
      `/admin/expenses?from=${D}&to=${addDays(D, 2)}&category=SHIPPING&limit=1`,
      { token: admin.token },
    );
    expect(shipping.body.data).toHaveLength(1);
    expect(shipping.body.meta).toMatchObject({ page: 1, limit: 1, total: 2, totalPages: 2, totalAmount: 300.5 });
    // The category breakdown ignores the category filter so charts stay complete.
    const filteredBreakdown = (shipping.body.meta as unknown as { byCategory: Array<{ category: string }> }).byCategory;
    expect(filteredBreakdown.map((row) => row.category)).toContain("RENT");

    const allCategories = await call<ExpenseDTO[], ExpenseMeta>("GET", `/admin/expenses?from=${D}&to=${D}&category=ALL`, {
      token: admin.token,
    });
    expect(allCategories.body.meta?.totalAmount).toBe(1250.75);
    expect((await call("GET", `/admin/expenses?from=${addDays(D, 2)}&to=${D}`, { token: admin.token })).status).toBe(422);
    expect((await call("GET", "/admin/expenses?category=COFFEE", { token: admin.token })).status).toBe(422);
  });
});

describe("PATCH / DELETE /admin/expenses/:id", () => {
  it("updates any subset and deletes", async () => {
    const created = await create({ category: "UTILITIES", amount: 700, incurredOn: addDays(D, 3), vendor: "DESCO" });
    const id = created.body.data.id;

    const patched = await call<ExpenseDTO>("PATCH", `/admin/expenses/${id}`, {
      token: admin.token,
      body: { amount: "725.40", vendor: null, note: "Late fee included" },
    });
    expect(patched.status).toBe(200);
    expect(patched.body.data).toMatchObject({
      id,
      category: "UTILITIES",
      amount: 725.4,
      incurredOn: addDays(D, 3),
      vendor: null,
      note: "Late fee included",
    });
    expect(new Date(patched.body.data.updatedAt).getTime()).toBeGreaterThanOrEqual(new Date(patched.body.data.createdAt).getTime());

    expect((await call("PATCH", `/admin/expenses/${id}`, { token: admin.token, body: {} })).status).toBe(422);
    expect((await call("PATCH", `/admin/expenses/${id}`, { token: admin.token, body: { amount: 0 } })).status).toBe(422);
    expect(
      (await call("PATCH", `/admin/expenses/${id}`, { token: admin.token, body: { incurredOn: addDays(TODAY, 2) } })).status,
    ).toBe(422);
    expect((await call("PATCH", `/admin/expenses/${id}`, { token: admin.token, body: { createdBy: admin.id } })).status).toBe(422);
    expect(
      (await call("PATCH", "/admin/expenses/00000000-0000-4000-8000-000000000000", { token: admin.token, body: { amount: 1 } })).status,
    ).toBe(404);
    expect((await call("PATCH", "/admin/expenses/nope", { token: admin.token, body: { amount: 1 } })).status).toBe(422);

    const removed = await call("DELETE", `/admin/expenses/${id}`, { token: admin.token });
    expect(removed.status).toBe(204);
    expect((await call("DELETE", `/admin/expenses/${id}`, { token: admin.token })).status).toBe(404);
  });
});

describe("Expense access control", () => {
  it("is SUPER_ADMIN only", async () => {
    for (const token of [orderManager.token, customer.token]) {
      expect((await call("GET", "/admin/expenses", { token })).status).toBe(403);
      expect((await call("POST", "/admin/expenses", { token, body: { category: "RENT", amount: 1, incurredOn: D } })).status).toBe(403);
      expect((await call("PATCH", "/admin/expenses/00000000-0000-4000-8000-000000000000", { token, body: { amount: 1 } })).status).toBe(403);
      expect((await call("DELETE", "/admin/expenses/00000000-0000-4000-8000-000000000000", { token })).status).toBe(403);
    }
    expect((await call("GET", "/admin/expenses")).status).toBe(401);
  });
});
