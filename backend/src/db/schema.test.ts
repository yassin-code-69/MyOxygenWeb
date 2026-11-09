/**
 * Integration checks for the migrated schema and the seed (local test DB).
 * Every write happens inside a transaction that is rolled back.
 */
import { describe, expect, it } from "bun:test";
import { eq, inArray, sql } from "drizzle-orm";
import { findPgError } from "../lib/db-errors";
import { db, type DatabaseTransaction } from "./client";
import { categories, discounts, orders, productBatches, products, users } from "./schema/tables";
import { SEEDED_CATEGORY_SLUGS, SEEDED_PRODUCT_SLUGS } from "./seed";

class Rollback extends Error {}

/** Runs `fn` in a transaction that is always rolled back. */
async function inRolledBackTx(fn: (tx: DatabaseTransaction) => Promise<void>): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      await fn(tx);
      throw new Rollback();
    });
  } catch (error) {
    if (!(error instanceof Rollback)) throw error;
  }
}

/** Expects `fn` to fail with the given SQLSTATE (inside a savepoint so the outer tx survives). */
async function expectSqlState(tx: DatabaseTransaction, code: string, fn: (sp: DatabaseTransaction) => Promise<unknown>) {
  let caught: unknown;
  try {
    await tx.transaction(async (sp) => {
      await fn(sp);
    });
  } catch (error) {
    caught = error;
  }
  expect(findPgError(caught)?.code).toBe(code);
}

describe("database schema", () => {
  it("has pg_trgm in the extensions schema and RLS on every public table", async () => {
    const ext = await db.execute<{ schema: string }>(
      sql`SELECT extnamespace::regnamespace::text AS schema FROM pg_extension WHERE extname = 'pg_trgm'`,
    );
    expect(ext.rows[0]?.schema).toBe("extensions");

    const rls = await db.execute<{ relname: string; relrowsecurity: boolean }>(
      sql`SELECT relname, relrowsecurity FROM pg_class
          WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'`,
    );
    expect(rls.rows.length).toBeGreaterThanOrEqual(10);
    expect(rls.rows.filter((r) => !r.relrowsecurity)).toEqual([]);

    const sim = await db.execute<{ sim: number }>(sql`SELECT extensions.similarity('Baby Lotion', 'lotion') AS sim`);
    expect(Number(sim.rows[0]?.sim)).toBeGreaterThan(0.2);
  });

  it("indexes every foreign key column", async () => {
    const missing = await db.execute<{ table_name: string; fk_column: string }>(sql`
      SELECT c.conrelid::regclass::text AS table_name, a.attname AS fk_column
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
      WHERE c.contype = 'f'
        AND c.connamespace = 'public'::regnamespace
        AND NOT EXISTS (
          SELECT 1 FROM pg_index i WHERE i.indrelid = c.conrelid AND i.indkey[0] = a.attnum
        )`);
    expect(missing.rows).toEqual([]);
  });

  it("enforces CHECK and uniqueness constraints", async () => {
    await inRolledBackTx(async (tx) => {
      const [category] = await tx.select({ id: categories.id }).from(categories).limit(1);
      const [product] = await tx.select({ id: products.id }).from(products).limit(1);
      if (!category || !product) throw new Error("seed data missing");
      const now = new Date();
      const later = new Date(now.getTime() + 86_400_000);

      // Lower-case emails only.
      await expectSqlState(tx, "23514", (sp) =>
        sp.insert(users).values({ fullName: "Upper", phone: "+8801999000001", email: "UPPER@EXAMPLE.COM" }),
      );
      // Percentage discounts cannot exceed 100, values must be positive, windows must be ordered.
      await expectSqlState(tx, "23514", (sp) =>
        sp.insert(discounts).values({ type: "PERCENTAGE", value: "150.00", startsAt: now, endsAt: later }),
      );
      await expectSqlState(tx, "23514", (sp) =>
        sp.insert(discounts).values({ type: "FIXED_AMOUNT", value: "0.00", startsAt: now, endsAt: later }),
      );
      await expectSqlState(tx, "23514", (sp) =>
        sp.insert(discounts).values({ type: "FIXED_AMOUNT", value: "10.00", startsAt: later, endsAt: now }),
      );
      // Coupon codes are unique case-insensitively.
      await expectSqlState(tx, "23505", (sp) =>
        sp.insert(discounts).values({ code: "welcome10", type: "FIXED_AMOUNT", value: "10.00", startsAt: now, endsAt: later }),
      );
      // Batches: no negative stock, positive initial quantity, manufacture before expiry.
      await expectSqlState(tx, "23514", (sp) =>
        sp.insert(productBatches).values({
          productId: product.id,
          batchNumber: "CHK-1",
          expiryDate: "2030-01-01",
          initialQuantity: 5,
          availableQuantity: -1,
        }),
      );
      await expectSqlState(tx, "23514", (sp) =>
        sp.insert(productBatches).values({
          productId: product.id,
          batchNumber: "CHK-2",
          manufactureDate: "2031-01-01",
          expiryDate: "2030-01-01",
          initialQuantity: 5,
          availableQuantity: 5,
        }),
      );
      // Money cannot be negative.
      await expectSqlState(tx, "23514", (sp) =>
        sp.insert(products).values({
          categoryId: category.id,
          title: "Negative",
          slug: "negative-price-check",
          sku: "CHK-NEG-1",
          description: "x",
          basePrice: "-1.00",
          costPrice: "0.00",
        }),
      );
    });
  });

  it("stores shipping addresses as jsonb objects", async () => {
    await inRolledBackTx(async (tx) => {
      const [customer] = await tx.select({ id: users.id }).from(users).where(eq(users.email, "admin@myoxygen.com"));
      if (!customer) throw new Error("seeded admin missing");
      const address = {
        fullName: "Ayesha Rahman",
        phone: "01711223344",
        addressLine1: "House 12, Road 5",
        city: "Dhaka",
        district: "Dhaka",
        postalCode: "1212",
      };
      const [order] = await tx
        .insert(orders)
        .values({
          orderNumber: `CHK-${Date.now()}`,
          userId: customer.id,
          paymentMethod: "COD",
          shippingAddress: address,
          subtotal: "100.00",
          deliveryFee: "60.00",
          total: "160.00",
        })
        .returning({ id: orders.id, shippingAddress: orders.shippingAddress });
      expect(order?.shippingAddress).toEqual(address);

      const typed = await tx.execute<{ kind: string }>(
        sql`SELECT jsonb_typeof(shipping_address) AS kind FROM orders WHERE id = ${order?.id}`,
      );
      expect(typed.rows[0]?.kind).toBe("object");
    });
  });
});

describe("seed data", () => {
  it("seeds the four storefront categories in navigation order", async () => {
    const rows = await db
      .select({ slug: categories.slug })
      .from(categories)
      .where(inArray(categories.slug, [...SEEDED_CATEGORY_SLUGS]))
      .orderBy(categories.sortOrder);
    expect(rows.map((r) => r.slug)).toEqual(["newborn", "mother-care", "skin-care", "inner-wear"]);
  });

  it("has no expired seeded stock and at least one seeded batch expiring within 30 days", async () => {
    const seededProductIds = db
      .select({ id: products.id })
      .from(products)
      .where(inArray(products.slug, [...SEEDED_PRODUCT_SLUGS]));
    const result = await db
      .select({
        expired: sql<number>`count(*) FILTER (WHERE ${productBatches.expiryDate} <= current_date)::int`,
        soon: sql<number>`count(*) FILTER (WHERE ${productBatches.expiryDate} > current_date AND ${productBatches.expiryDate} <= current_date + 30)::int`,
        total: sql<number>`count(*)::int`,
      })
      .from(productBatches)
      .where(inArray(productBatches.productId, seededProductIds));
    expect(Number(result[0]?.total)).toBeGreaterThanOrEqual(SEEDED_PRODUCT_SLUGS.length);
    expect(Number(result[0]?.expired)).toBe(0);
    expect(Number(result[0]?.soon)).toBeGreaterThanOrEqual(1);
  });

  it("seeds active flash sales and the documented coupons", async () => {
    const flash = await db.execute<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM discounts
      WHERE code IS NULL AND is_flash_sale AND is_active AND starts_at <= now() AND ends_at > now()`);
    expect(Number(flash.rows[0]?.n)).toBeGreaterThanOrEqual(2);

    const coupons = await db
      .select({ code: discounts.code, minOrderAmount: discounts.minOrderAmount, perCustomerLimit: discounts.perCustomerLimit })
      .from(discounts)
      .where(sql`${discounts.code} IS NOT NULL`);
    const byCode = new Map(coupons.map((c) => [c.code, c]));
    expect(byCode.get("WELCOME10")?.minOrderAmount).toBe("500.00");
    expect(byCode.get("WELCOME10")?.perCustomerLimit).toBe(1);
    expect(byCode.get("FLAT100")?.minOrderAmount).toBe("1500.00");
  });
});
