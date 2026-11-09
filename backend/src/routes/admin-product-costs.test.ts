/**
 * Product cost breakdown rules (POST/PATCH /admin/catalog/products) and the
 * order_items.unit_cost snapshot written by checkout.
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { asc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { orderItems } from "../db/schema/tables";
import { addDays, todayInBusinessTz } from "../lib/dates";
import type { OrderDetailDTO } from "../services/order-dto";
import type { AdminProductWithCostDTO } from "../services/product.service";
import { uniqueId } from "../tests/inventory-fixtures";
import { call, ReportFixtures } from "../tests/report-fixtures";

const fx = new ReportFixtures();
const TODAY = todayInBusinessTz();

let admin: { token: string };
let inventoryManager: { token: string };
let categoryId: string;

type FieldErrors = { fieldErrors: Record<string, string[] | undefined> };

function productBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const tag = uniqueId();
  return {
    categoryId,
    title: `Cost Product ${tag}`,
    sku: `COST-${tag}`.toUpperCase(),
    description: "Cost breakdown fixture",
    basePrice: 100,
    ...overrides,
  };
}

async function createProduct(body: Record<string, unknown>) {
  const res = await call<AdminProductWithCostDTO>("POST", "/admin/catalog/products", { token: admin.token, body });
  if (res.status === 201) fx.trackProduct(res.body.data.id);
  return res;
}

beforeAll(async () => {
  admin = await fx.staff("SUPER_ADMIN");
  inventoryManager = await fx.staff("INVENTORY_MANAGER");
  categoryId = (await fx.category("Costs")).id;
});

afterAll(async () => {
  await fx.cleanup();
});

describe("costBreakdown on admin products", () => {
  it("derives costPrice from the breakdown on create and exposes it everywhere", async () => {
    const res = await createProduct(
      productBody({ costBreakdown: { supplierPrice: 10.5, shipping: "2.10", customsDuty: 1.25, packaging: 0.25, other: 1 } }),
    );
    expect(res.status).toBe(201);
    expect(res.body.data.costPrice).toBe(15.1);
    expect(res.body.data.costBreakdown).toEqual({ supplierPrice: 10.5, shipping: 2.1, customsDuty: 1.25, packaging: 0.25, other: 1 });

    const id = res.body.data.id;
    const detail = await call<AdminProductWithCostDTO>("GET", `/admin/catalog/products/${id}`, { token: inventoryManager.token });
    expect(detail.body.data.costBreakdown).toEqual(res.body.data.costBreakdown);
    const list = await call<AdminProductWithCostDTO[]>("GET", `/admin/catalog/products?q=${encodeURIComponent(res.body.data.sku)}`, {
      token: inventoryManager.token,
    });
    expect(list.body.data.find((row) => row.id === id)?.costBreakdown).toEqual(res.body.data.costBreakdown);
    // Products without a breakdown expose null.
    const plain = await createProduct(productBody({ costPrice: 40 }));
    expect(plain.body.data).toMatchObject({ costPrice: 40, costBreakdown: null });
  });

  it("treats omitted components as 0 and accepts a matching costPrice", async () => {
    const res = await createProduct(productBody({ costPrice: "60.00", costBreakdown: { supplierPrice: 55, shipping: 5 } }));
    expect(res.status).toBe(201);
    expect(res.body.data.costBreakdown).toEqual({ supplierPrice: 55, shipping: 5, customsDuty: 0, packaging: 0, other: 0 });
    expect(res.body.data.costPrice).toBe(60);
  });

  it("rejects conflicting or invalid cost input with 422", async () => {
    const conflict = await createProduct(productBody({ costPrice: 20, costBreakdown: { supplierPrice: 10, shipping: 5 } }));
    expect(conflict.status).toBe(422);
    expect((conflict.body.error?.details as FieldErrors).fieldErrors.costPrice?.[0]).toContain("15.00");

    const missing = await createProduct(productBody());
    expect(missing.status).toBe(422);
    expect((missing.body.error?.details as FieldErrors).fieldErrors.costPrice).toBeDefined();

    for (const costBreakdown of [
      { supplierPrice: -1 },
      { supplierPrice: 1.234 },
      { supplierPrice: "abc" },
      { supplierPrice: 1, freight: 2 },
    ]) {
      const res = await createProduct(productBody({ costBreakdown }));
      expect(res.status).toBe(422);
      expect(res.body.error?.code).toBe("VALIDATION_ERROR");
    }
  });

  it("keeps costPrice = SUM(breakdown) on update, and clearing keeps the cost", async () => {
    const created = await createProduct(productBody({ costBreakdown: { supplierPrice: 40, shipping: 10 } }));
    const id = created.body.data.id;
    const patch = (body: Record<string, unknown>) =>
      call<AdminProductWithCostDTO>("PATCH", `/admin/catalog/products/${id}`, { token: admin.token, body });

    const replaced = await patch({ costBreakdown: { supplierPrice: 45, shipping: 10, customsDuty: 2.5 } });
    expect(replaced.status).toBe(200);
    expect(replaced.body.data).toMatchObject({ costPrice: 57.5, costBreakdown: { supplierPrice: 45, shipping: 10, customsDuty: 2.5, packaging: 0, other: 0 } });

    const conflicting = await patch({ costPrice: 50, costBreakdown: { supplierPrice: 45 } });
    expect(conflicting.status).toBe(422);
    expect((conflicting.body.error?.details as FieldErrors).fieldErrors.costPrice).toBeDefined();

    // costPrice alone must not silently break the invariant...
    const alone = await patch({ costPrice: 70 });
    expect(alone.status).toBe(422);
    expect((alone.body.error?.details as FieldErrors).fieldErrors.costPrice?.[0]).toContain("57.50");
    // ...but re-sending the same value is fine.
    expect((await patch({ costPrice: 57.5 })).status).toBe(200);

    const cleared = await patch({ costBreakdown: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.data).toMatchObject({ costPrice: 57.5, costBreakdown: null });

    const rebuilt = await patch({ costBreakdown: { supplierPrice: 1 } });
    expect(rebuilt.body.data.costPrice).toBe(1);
    const reset = await patch({ costBreakdown: null, costPrice: 99 });
    expect(reset.body.data).toMatchObject({ costPrice: 99, costBreakdown: null });
    expect((await patch({ costPrice: 80 })).body.data.costPrice).toBe(80);
  });
});

describe("order_items.unit_cost snapshot", () => {
  it("records the cost price in force at checkout and never rewrites it", async () => {
    const product = await fx.product({ categoryId, basePrice: "250.00", costPrice: "37.25" });
    await fx.batch(product.id, addDays(TODAY, 300), 2, uniqueId("UC-").toUpperCase());
    await fx.batch(product.id, addDays(TODAY, 600), 10, uniqueId("UC-").toUpperCase());
    const buyer = await fx.customer("Unit Cost Buyer", new Date());
    const checkout = (quantity: number) =>
      call<OrderDetailDTO>("POST", "/orders/checkout", {
        token: buyer.token,
        body: {
          shippingAddress: {
            fullName: "Unit Cost Buyer",
            phone: "01711222333",
            addressLine1: "Road 9",
            city: "Dhaka",
            district: "Dhaka",
            postalCode: "1212",
          },
          items: [{ productId: product.id, quantity }],
          paymentMethod: "COD",
        },
      });

    const first = await checkout(3); // FEFO split: 2 + 1 units from two batches
    expect(first.status).toBe(201);
    fx.trackOrder(first.body.data.id);
    const firstItems = await db
      .select({ quantity: orderItems.quantity, unitCost: orderItems.unitCost })
      .from(orderItems)
      .where(eq(orderItems.orderId, first.body.data.id))
      .orderBy(asc(orderItems.quantity));
    expect(firstItems).toEqual([
      { quantity: 1, unitCost: "37.25" },
      { quantity: 2, unitCost: "37.25" },
    ]);

    const repriced = await call("PATCH", `/admin/catalog/products/${product.id}`, { token: admin.token, body: { costPrice: 41 } });
    expect(repriced.status).toBe(200);

    const second = await checkout(1);
    expect(second.status).toBe(201);
    fx.trackOrder(second.body.data.id);
    const [secondItem] = await db.select({ unitCost: orderItems.unitCost }).from(orderItems).where(eq(orderItems.orderId, second.body.data.id));
    expect(secondItem?.unitCost).toBe("41.00");

    const unchanged = await db.select({ unitCost: orderItems.unitCost }).from(orderItems).where(eq(orderItems.orderId, first.body.data.id));
    expect(unchanged.every((row) => row.unitCost === "37.25")).toBe(true);
  });
});
