/**
 * Catalog, pricing, search, cache, admin products and discounts.
 * Real local test database; every fixture is run-unique (own categories and
 * brands) and removed in afterAll. Never creates store-wide automatic
 * discounts (they would change prices for other suites).
 */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { db } from "../db/client";
import { discounts } from "../db/schema/tables";
import { addDays, todayInBusinessTz } from "../lib/dates";
import {
  cacheMiddleware,
  cacheStore,
  clearCache,
  invalidateCatalogCache,
  MemoryLRUCache,
} from "../middleware/cache";
import { api } from "../tests/http-client";
import { FixtureRegistry, uniqueId, type TestUser } from "../tests/inventory-fixtures";
import type { PaginationMeta } from "../types";
import type {
  AdminProductDTO,
  CatalogFacets,
  CatalogProductDetailDTO,
  CatalogProductDTO,
  CategoryDTO,
  FlashSaleDTO,
  ProductSuggestionsDTO,
} from "./catalog.service";
import type { DiscountDTO } from "./discount.service";
import { flashSaleService, type Discount } from "./flash-sale.service";
import type { ImportBatchResult } from "./inventory.service";
import type { AdminProductDetailDTO } from "./product.service";

type ListMeta = PaginationMeta & { facets: CatalogFacets };

const fixtures = new FixtureRegistry();
const today = todayInBusinessTz();
const tag = uniqueId();
const brandA = `Alpha ${tag}`;
const brandB = `Beta ${tag}`;
const inDays = (days: number): Date => new Date(Date.now() + days * 24 * 60 * 60 * 1000);

let admin: TestUser;
let marketing: TestUser;
let inventory: TestUser;
let customer: TestUser;
let c1: { id: string; slug: string; name: string };
let c2: { id: string; slug: string; name: string };
let c3: { id: string; slug: string; name: string };

interface Fx {
  id: string;
  slug: string;
  sku: string;
  title: string;
}
let p1: Fx; // C1, brand A, 1000, product flash sale 20% → 800
let p2: Fx; // C1, brand B, 500, category 10% → 450, batch-tracked
let p3: Fx; // C1, brand B, inactive
let p4: Fx; // C2, brand A, 800, coupon only → 800
let p5: Fx; // C2, brand B, 333.33, product 15% → 283.33
let p6: Fx; // C2, brand A, 650, active but no stock
let p7: Fx; // C3, discount admin tests
let flashSaleId: string;
let categorySaleId: string;
let couponCode: string;

async function insertDiscount(values: typeof discounts.$inferInsert): Promise<string> {
  const [row] = await db.insert(discounts).values(values).returning({ id: discounts.id });
  if (!row) throw new Error("discount insert failed");
  fixtures.trackDiscount(row.id);
  return row.id;
}

beforeAll(async () => {
  clearCache();
  [admin, marketing, inventory, customer] = await Promise.all([
    fixtures.user("SUPER_ADMIN"),
    fixtures.user("MARKETING_MANAGER"),
    fixtures.user("INVENTORY_MANAGER"),
    fixtures.user("CUSTOMER"),
  ]);
  c1 = await fixtures.category("Catalog One", 9001);
  c2 = await fixtures.category("Catalog Two", 9002);
  c3 = await fixtures.category("Catalog Three", 9003);

  p1 = await fixtures.product({
    categoryId: c1.id,
    title: `Velvetine Baby Lotion ${tag}`,
    brand: brandA,
    basePrice: "1000.00",
    requiresBatchTracking: false,
    createdAt: new Date(Date.now() - 60_000),
  });
  await fixtures.batch(p1.id, addDays(today, 400), 50);
  p2 = await fixtures.product({
    categoryId: c1.id,
    title: `Calmora Glow Serum ${tag}`,
    brand: brandB,
    basePrice: "500.00",
    requiresBatchTracking: true,
  });
  await fixtures.batch(p2.id, addDays(today, 100), 10);
  await fixtures.batch(p2.id, addDays(today, 10), 3);
  p3 = await fixtures.product({ categoryId: c1.id, title: `Nimbus Wipes ${tag}`, brand: brandB, isActive: false });
  await fixtures.batch(p3.id, addDays(today, 100), 4);
  p4 = await fixtures.product({ categoryId: c2.id, title: `Orchid Nipple Balm ${tag}`, brand: brandA, basePrice: "800.00" });
  await fixtures.batch(p4.id, addDays(today, 200), 5);
  p5 = await fixtures.product({ categoryId: c2.id, title: `Quokka Feeding Set ${tag}`, brand: brandB, basePrice: "333.33" });
  await fixtures.batch(p5.id, addDays(today, 200), 7);
  p6 = await fixtures.product({ categoryId: c2.id, title: `Zephyr Romper ${tag}`, brand: brandA, basePrice: "650.00" });
  p7 = await fixtures.product({ categoryId: c3.id, title: `Discount Target ${tag}`, basePrice: "200.00" });
  await fixtures.batch(p7.id, addDays(today, 200), 9);

  flashSaleId = await insertDiscount({
    name: `Flash ${tag}`,
    type: "PERCENTAGE",
    value: "20.00",
    productId: p1.id,
    startsAt: inDays(-1),
    endsAt: inDays(2),
    isFlashSale: true,
  });
  categorySaleId = await insertDiscount({
    name: `Category sale ${tag}`,
    type: "PERCENTAGE",
    value: "10.00",
    categoryId: c1.id,
    startsAt: inDays(-1),
    endsAt: inDays(30),
  });
  couponCode = `CPN${tag}`.toUpperCase().slice(0, 60);
  await insertDiscount({
    code: couponCode,
    name: `Coupon ${tag}`,
    type: "PERCENTAGE",
    value: "50.00",
    productId: p4.id,
    startsAt: inDays(-1),
    endsAt: inDays(30),
  });
  await insertDiscount({
    name: `Odd cents ${tag}`,
    type: "PERCENTAGE",
    value: "15.00",
    productId: p5.id,
    startsAt: inDays(-1),
    endsAt: inDays(30),
  });
  // Expired and disabled automatic discounts must be ignored.
  await insertDiscount({ type: "PERCENTAGE", value: "90.00", productId: p4.id, startsAt: inDays(-10), endsAt: inDays(-1) });
  await insertDiscount({
    type: "PERCENTAGE",
    value: "90.00",
    productId: p5.id,
    startsAt: inDays(-1),
    endsAt: inDays(5),
    isActive: false,
  });
});

afterAll(async () => {
  clearCache();
  await fixtures.cleanup();
});

// ===========================================================================
// Pricing engine (TypeScript)
// ===========================================================================

describe("FlashSaleService pricing", () => {
  const product = { id: "prod-1", categoryId: "cat-1", basePrice: "1000.00" };
  const base: Omit<Discount, "id" | "type" | "value"> = {
    startsAt: new Date(Date.now() - 1000),
    endsAt: new Date(Date.now() + 3_600_000),
    isActive: true,
    code: null,
  };

  it("applies percentage and fixed discounts with number + legacy string outputs", () => {
    const pct = flashSaleService.calculateEffectivePrice(product, [
      { ...base, id: "d1", type: "PERCENTAGE", value: "20.00", productId: "prod-1" },
    ]);
    expect(pct).toMatchObject({
      effectivePrice: "800.00",
      effectivePriceValue: 800,
      discountAmount: 200,
      discountPercent: 20,
      basePriceValue: 1000,
    });
    const fixed = flashSaleService.calculateEffectivePrice(product, [
      { ...base, id: "d2", type: "FIXED_AMOUNT", value: "150.00", productId: "prod-1" },
    ]);
    expect(fixed.effectivePrice).toBe("850.00");
    expect(fixed.discount?.id).toBe("d2");
  });

  it("prefers product > category > store-wide scope, then the largest saving, then the earliest end", () => {
    const productLevel: Discount = { ...base, id: "p", type: "PERCENTAGE", value: "10.00", productId: "prod-1" };
    const categoryLevel: Discount = { ...base, id: "c", type: "PERCENTAGE", value: "50.00", categoryId: "cat-1" };
    const storeWide: Discount = { ...base, id: "s", type: "PERCENTAGE", value: "70.00" };
    expect(flashSaleService.calculateEffectivePrice(product, [storeWide, categoryLevel, productLevel]).discount?.id).toBe("p");
    expect(flashSaleService.calculateEffectivePrice(product, [storeWide, categoryLevel]).discount?.id).toBe("c");
    expect(flashSaleService.calculateEffectivePrice(product, [storeWide]).discount?.id).toBe("s");

    const small: Discount = { ...base, id: "a", type: "PERCENTAGE", value: "5.00", productId: "prod-1" };
    const big: Discount = { ...base, id: "b", type: "FIXED_AMOUNT", value: "300.00", productId: "prod-1" };
    expect(flashSaleService.calculateEffectivePrice(product, [small, big]).discount?.id).toBe("b");

    const later: Discount = { ...base, id: "x", type: "FIXED_AMOUNT", value: "100.00", productId: "prod-1", endsAt: new Date(Date.now() + 9_000_000) };
    const sooner: Discount = { ...base, id: "y", type: "FIXED_AMOUNT", value: "100.00", productId: "prod-1" };
    expect(flashSaleService.calculateEffectivePrice(product, [later, sooner]).discount?.id).toBe("y");
  });

  it("ignores coupons, disabled and out-of-window discounts; caps and floors amounts", () => {
    const coupon: Discount = { ...base, id: "k", code: "SAVE50", type: "PERCENTAGE", value: "50.00", productId: "prod-1" };
    const disabled: Discount = { ...base, id: "d", isActive: false, type: "PERCENTAGE", value: "50.00", productId: "prod-1" };
    const expired: Discount = { ...base, id: "e", endsAt: new Date(Date.now() - 1), type: "PERCENTAGE", value: "50.00", productId: "prod-1" };
    expect(flashSaleService.calculateEffectivePrice(product, [coupon, disabled, expired])).toMatchObject({
      effectivePrice: "1000.00",
      discount: null,
      discountAmount: 0,
    });
    const capped: Discount = { ...base, id: "m", type: "PERCENTAGE", value: "50.00", productId: "prod-1", maxDiscountAmount: "120.00" };
    expect(flashSaleService.calculateEffectivePrice(product, [capped]).effectivePriceValue).toBe(880);
    const huge: Discount = { ...base, id: "h", type: "FIXED_AMOUNT", value: "5000.00", productId: "prod-1" };
    expect(flashSaleService.calculateEffectivePrice(product, [huge]).effectivePriceValue).toBe(0);
  });

  it("rounds half-up to cents exactly like Postgres numeric", () => {
    const odd = flashSaleService.calculateEffectivePrice({ id: "o", categoryId: "c", basePrice: "333.33" }, [
      { ...base, id: "r", type: "PERCENTAGE", value: "15.00", productId: "o" },
    ]);
    // 333.33 × 15% = 49.9995 → 50.00
    expect(odd.discountAmount).toBe(50);
    expect(odd.effectivePrice).toBe("283.33");
  });

  it("computes countdowns", () => {
    expect(flashSaleService.getFlashSaleCountdown({ endsAt: new Date(Date.now() - 5) })).toBe(0);
    const remaining = flashSaleService.getFlashSaleCountdown({ endsAt: new Date(Date.now() + 60_000) });
    expect(remaining).toBeGreaterThan(59_000);
    expect(remaining).toBeLessThanOrEqual(60_000);
  });
});

// ===========================================================================
// Public listing
// ===========================================================================

describe("GET /catalog/products", () => {
  it("returns priced items (numbers) and facets for a category", async () => {
    const res = await api<CatalogProductDTO[], ListMeta>("GET", `/catalog/products?category=${c1.slug}`);
    expect(res.status).toBe(200);
    expect(res.body.meta).toMatchObject({ page: 1, limit: 24, total: 2, totalPages: 1 });
    const ids = res.body.data.map((p) => p.id);
    expect(ids.sort()).toEqual([p1.id, p2.id].sort());

    const one = res.body.data.find((p) => p.id === p1.id);
    expect(one).toMatchObject({
      basePrice: 1000,
      effectivePrice: 800,
      discountAmount: 200,
      discountPercent: 20,
      totalStock: 50,
      isLowStock: false,
      isOutOfStock: false,
      earliestExpiry: null,
      brand: brandA,
      category: { id: c1.id, slug: c1.slug, name: c1.name },
      isActive: true,
    });
    expect(one?.activeDiscount).toMatchObject({ id: flashSaleId, type: "PERCENTAGE", value: 20, isFlashSale: true });
    expect(one?.activeDiscount?.countdownMs).toBeGreaterThan(0);
    expect(one).not.toHaveProperty("costPrice");
    expect(one).not.toHaveProperty("rating");

    const two = res.body.data.find((p) => p.id === p2.id);
    expect(two).toMatchObject({ effectivePrice: 450, discountAmount: 50, totalStock: 13, earliestExpiry: addDays(today, 10) });
    expect(two?.activeDiscount).toMatchObject({ id: categorySaleId, isFlashSale: false, value: 10 });

    const facets = res.body.meta?.facets;
    expect(facets?.brands).toEqual(
      expect.arrayContaining([
        { value: brandA, count: 1 },
        { value: brandB, count: 1 },
      ]),
    );
    expect(facets?.priceRange).toEqual({ min: 450, max: 800 });
    // Category facet ignores the category filter (disjunctive faceting).
    expect(facets?.categories).toEqual(
      expect.arrayContaining([
        { id: c1.id, slug: c1.slug, name: c1.name, count: 2 },
        { id: c2.id, slug: c2.slug, name: c2.name, count: 3 },
      ]),
    );
  });

  it("sorts and filters by the EFFECTIVE price", async () => {
    const asc = await api<CatalogProductDTO[]>("GET", `/catalog/products?category=${c1.slug}&sort=price_asc`);
    expect(asc.body.data.map((p) => p.id)).toEqual([p2.id, p1.id]);
    const desc = await api<CatalogProductDTO[]>("GET", `/catalog/products?category=${c1.slug}&sort=price_desc`);
    expect(desc.body.data.map((p) => p.id)).toEqual([p1.id, p2.id]);

    // Base 500 ≥ 460 but effective 450 < 460 → excluded.
    const min = await api<CatalogProductDTO[]>("GET", `/catalog/products?category=${c1.slug}&minPrice=460`);
    expect(min.body.data.map((p) => p.id)).toEqual([p1.id]);
    // Base 1000 > 850 but effective 800 ≤ 850 → included.
    const max = await api<CatalogProductDTO[]>("GET", `/catalog/products?category=${c1.slug}&maxPrice=850`);
    expect(max.body.data).toHaveLength(2);

    const invalid = await api<null>("GET", `/catalog/products?minPrice=10&maxPrice=5`);
    expect(invalid.status).toBe(422);
    expect((await api<null>("GET", "/catalog/products?sort=cheapest")).status).toBe(422);
  });

  it("filters by one or many brands (case-insensitive) and by stock", async () => {
    const one = await api<CatalogProductDTO[]>(
      "GET",
      `/catalog/products?category=${c2.slug}&brand=${encodeURIComponent(brandA.toUpperCase())}`,
    );
    expect(one.body.data.map((p) => p.id).sort()).toEqual([p4.id, p6.id].sort());
    const many = await api<CatalogProductDTO[]>(
      "GET",
      `/catalog/products?category=${c2.slug}&brand=${encodeURIComponent(brandA)}&brand=${encodeURIComponent(brandB)}`,
    );
    expect(many.body.data).toHaveLength(3);

    const all = await api<CatalogProductDTO[]>("GET", `/catalog/products?category=${c2.slug}`);
    expect(all.body.data.find((p) => p.id === p6.id)).toMatchObject({ totalStock: 0, isOutOfStock: true });
    const inStock = await api<CatalogProductDTO[]>("GET", `/catalog/products?category=${c2.slug}&inStockOnly=true`);
    expect(inStock.body.data.map((p) => p.id).sort()).toEqual([p4.id, p5.id].sort());

    expect((await api<null>("GET", "/catalog/products?category=no-such-category-zz")).status).toBe(404);
  });

  it("never applies coupons to public prices", async () => {
    const res = await api<CatalogProductDTO[]>("GET", `/catalog/products?category=${c2.slug}`);
    expect(res.body.data.find((p) => p.id === p4.id)).toMatchObject({
      basePrice: 800,
      effectivePrice: 800,
      discountAmount: 0,
      discountPercent: 0,
      activeDiscount: null,
    });
  });

  it("matches the checkout pricing engine exactly (SQL ≡ TypeScript)", async () => {
    const res = await api<CatalogProductDTO[]>("GET", `/catalog/products?category=${c2.slug}`);
    const listed = [...res.body.data];
    const c1List = await api<CatalogProductDTO[]>("GET", `/catalog/products?category=${c1.slug}`);
    listed.push(...c1List.body.data);
    for (const item of listed) {
      const candidates = await flashSaleService.getActiveDiscounts(item.id, item.category.id);
      const engine = flashSaleService.calculateEffectivePrice(
        { id: item.id, categoryId: item.category.id, basePrice: item.basePrice },
        candidates,
      );
      expect(engine.effectivePriceValue).toBe(item.effectivePrice);
      expect(engine.discount?.id ?? null).toBe(item.activeDiscount?.id ?? null);
    }
    expect(listed.find((p) => p.id === p5.id)?.effectivePrice).toBe(283.33);
  });

  it("requires PRODUCTS_READ for includeInactive", async () => {
    const anonymous = await api<null>("GET", `/catalog/products?category=${c1.slug}&includeInactive=true`);
    expect(anonymous.status).toBe(401);
    const asCustomer = await api<null>("GET", `/catalog/products?category=${c1.slug}&includeInactive=1`, {
      token: customer.token,
    });
    expect(asCustomer.status).toBe(403);
    const asStaff = await api<CatalogProductDTO[]>("GET", `/catalog/products?category=${c1.slug}&includeInactive=true`, {
      token: marketing.token,
    });
    expect(asStaff.status).toBe(200);
    expect(asStaff.body.data.find((p) => p.id === p3.id)).toMatchObject({ isActive: false });
    expect(asStaff.headers.get("Cache-Control")).toBe("private, no-store");

    const publicList = await api<CatalogProductDTO[]>("GET", `/catalog/products?category=${c1.slug}&includeInactive=false`);
    expect(publicList.body.data.some((p) => p.id === p3.id)).toBe(false);
  });

  it("searches with trigram typo tolerance (documented behaviour)", async () => {
    const search = async (q: string) =>
      (await api<CatalogProductDTO[]>("GET", `/catalog/products?category=${c1.slug}&q=${encodeURIComponent(q)}`)).body.data.map(
        (p) => p.id,
      );
    // Exact word and substring.
    expect(await search("Velvetine")).toEqual([p1.id]);
    expect(await search("glow ser")).toEqual([p2.id]);
    // One missing letter: word similarity ≥ 0.45 → found.
    expect(await search("Velvetin")).toEqual([p1.id]);
    expect(await search("serm")).toEqual([p2.id]);
    // Transposed letters in a short word ("seurm" ≈ 0.33) are NOT matched.
    expect(await search("seurm")).toEqual([]);
    // Wildcards are literal.
    expect(await search("%")).toEqual([]);
    // Relevance ranking puts the title match first.
    const ranked = await api<CatalogProductDTO[]>("GET", `/catalog/products?q=${encodeURIComponent(`Calmora Glow Serum ${tag}`)}`);
    expect(ranked.body.data[0]?.id).toBe(p2.id);
  });
});

describe("GET /catalog/search/suggestions", () => {
  const suggest = (q: string, limit?: number) =>
    api<ProductSuggestionsDTO>(
      "GET",
      `/catalog/search/suggestions?q=${encodeURIComponent(q)}${limit === undefined ? "" : `&limit=${limit}`}`,
    );

  it("returns lean, priced, relevance-ranked items with the total match count", async () => {
    const res = await suggest(`Velvetine Baby Lotion ${tag}`);
    expect(res.status).toBe(200);
    const first = res.body.data.items[0];
    expect(first).toMatchObject({
      id: p1.id,
      slug: p1.slug,
      title: p1.title,
      brand: brandA,
      category: { id: c1.id, slug: c1.slug },
      basePrice: 1000,
      effectivePrice: 800,
      discountPercent: 20,
      isOutOfStock: false,
    });
    expect(first && "image" in first).toBe(true);
    // Lean payload: none of the heavy listing fields.
    expect(first && "description" in first).toBe(false);
    expect(first && "activeDiscount" in first).toBe(false);
    expect(res.body.data.total).toBeGreaterThanOrEqual(1);
  });

  it("is typo tolerant, hides inactive products and keeps out-of-stock ones flagged", async () => {
    expect((await suggest("Velvetin")).body.data.items[0]?.id).toBe(p1.id);

    const all = (await suggest(tag, 10)).body.data;
    const ids = all.items.map((item) => item.id);
    expect(ids).not.toContain(p3.id); // inactive
    expect(ids).toEqual(expect.arrayContaining([p1.id, p2.id, p4.id, p5.id, p6.id, p7.id]));
    expect(all.items.find((item) => item.id === p6.id)?.isOutOfStock).toBe(true);
    expect(all.total).toBeGreaterThanOrEqual(6);
  });

  it("caps the list at limit while still counting every match", async () => {
    const res = (await suggest(tag, 2)).body.data;
    expect(res.items).toHaveLength(2);
    expect(res.total).toBeGreaterThanOrEqual(6);
  });

  it("validates q and limit", async () => {
    expect((await suggest("a")).status).toBe(422);
    expect((await suggest("   ")).status).toBe(422);
    expect((await suggest("lotion", 11)).status).toBe(422);
    expect((await suggest("lotion", 0)).status).toBe(422);
    expect((await suggest("%%")).body.data).toEqual({ items: [], total: 0 });
  });
});

describe("GET /catalog/products/:idOrSlug, /catalog/categories, /catalog/flash-sales", () => {
  it("returns detail with FEFO batch summary, related products and no cost price", async () => {
    const res = await api<CatalogProductDetailDTO>("GET", `/catalog/products/${p2.slug}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: p2.id, effectivePrice: 450, earliestExpiry: addDays(today, 10) });
    expect(res.body.data).not.toHaveProperty("costPrice");
    expect(res.body.data.batchSummary).toEqual([
      expect.objectContaining({ expiryDate: addDays(today, 10), availableQuantity: 3, daysUntilExpiry: 10 }),
      expect.objectContaining({ expiryDate: addDays(today, 100), availableQuantity: 10, daysUntilExpiry: 100 }),
    ]);
    expect(res.body.data.relatedProducts.map((p) => p.id)).toEqual([p1.id]);
    expect(res.body.data.relatedProducts[0]).toMatchObject({ effectivePrice: 800, basePrice: 1000 });

    const byId = await api<CatalogProductDetailDTO>("GET", `/catalog/products/${p1.id}`);
    expect(byId.body.data).toMatchObject({ slug: p1.slug, batchSummary: [] });
    expect((await api<null>("GET", `/catalog/products/${p3.slug}`)).status).toBe(404);
    expect((await api<null>("GET", "/catalog/products/bad%20slug!")).status).toBe(422);
  });

  it("lists active categories sorted by sort_order with public product counts", async () => {
    const res = await api<CategoryDTO[]>("GET", "/catalog/categories");
    expect(res.status).toBe(200);
    const orders = res.body.data.map((c) => c.sortOrder);
    expect([...orders].sort((a, b) => a - b)).toEqual(orders);
    expect(res.body.data.find((c) => c.id === c1.id)).toMatchObject({ slug: c1.slug, productCount: 2 });
  });

  it("lists only running automatic flash sales with countdowns", async () => {
    const res = await api<FlashSaleDTO[]>("GET", "/catalog/flash-sales");
    expect(res.status).toBe(200);
    const sale = res.body.data.find((s) => s.id === flashSaleId);
    expect(sale).toMatchObject({ scope: "PRODUCT", productId: p1.id, type: "PERCENTAGE", value: 20 });
    expect(sale?.countdownMs).toBeGreaterThan(0);
    expect(sale?.product).toMatchObject({ id: p1.id, effectivePrice: 800 });
    expect(res.body.data.some((s) => s.id === categorySaleId)).toBe(false); // not a flash sale
    expect(res.body.data.some((s) => s.productId === p4.id)).toBe(false); // coupon / expired
  });
});

// ===========================================================================
// Cache
// ===========================================================================

describe("public response cache", () => {
  it("serves MISS then HIT, bypasses authenticated callers and invalidates on product changes", async () => {
    clearCache();
    const path = `/catalog/products?category=${c2.slug}`;
    const first = await api<CatalogProductDTO[]>("GET", path);
    expect(first.headers.get("X-Cache")).toBe("MISS");
    expect(first.headers.get("Vary")).toContain("Authorization");
    const second = await api<CatalogProductDTO[]>("GET", path);
    expect(second.headers.get("X-Cache")).toBe("HIT");
    expect(second.headers.get("Cache-Control")).toBe("public, max-age=60");

    const authed = await api<CatalogProductDTO[]>("GET", path, { token: customer.token });
    expect(authed.headers.get("X-Cache")).toBeNull();
    expect(authed.headers.get("Cache-Control")).toBe("private, no-store");

    const patch = await api<AdminProductDTO>("PATCH", `/admin/catalog/products/${p4.id}`, {
      token: inventory.token,
      body: { basePrice: 900 },
    });
    expect(patch.status).toBe(200);
    const after = await api<CatalogProductDTO[]>("GET", path);
    expect(after.headers.get("X-Cache")).toBe("MISS");
    expect(after.body.data.find((p) => p.id === p4.id)?.effectivePrice).toBe(900);
  });

  it("does not store a response computed across an invalidation", async () => {
    const probe = new Hono();
    probe.get("/catalog/probe", cacheMiddleware(60), (c) => {
      invalidateCatalogCache(); // a write committed while this request was running
      return c.json({ success: true, data: 1 });
    });
    expect((await probe.request("/catalog/probe")).headers.get("X-Cache")).toBe("MISS");
    expect((await probe.request("/catalog/probe")).headers.get("X-Cache")).toBe("MISS");
    const generation = cacheStore.generation;
    invalidateCatalogCache();
    expect(cacheStore.generation).toBe(generation + 1);
  });

  it("evicts least-recently-used entries and expires by TTL", async () => {
    const lru = new MemoryLRUCache(2);
    lru.set("a", { body: "1", contentType: "application/json" }, 60);
    lru.set("b", { body: "2", contentType: "application/json" }, 60);
    lru.get("a");
    lru.set("c", { body: "3", contentType: "application/json" }, 60);
    expect(lru.get("b")).toBeUndefined();
    expect(lru.get("a")?.body).toBe("1");

    lru.set("short", { body: "x", contentType: "application/json" }, 0.01);
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(lru.get("short")).toBeUndefined();
  });
});

// ===========================================================================
// Admin products
// ===========================================================================

describe("admin products", () => {
  let createdId: string;

  it("creates a product (slug generated) that waits for stock, then goes live on import", async () => {
    const res = await api<AdminProductDTO>("POST", "/admin/catalog/products", {
      token: inventory.token,
      body: {
        categoryId: c3.id,
        title: `Fresh Arrival ${tag}`,
        sku: `new-${tag}`,
        brand: brandA,
        description: "Gentle, fragrance-free.",
        basePrice: "1250.00",
        costPrice: 780,
        images: ["https://cdn.example.com/a.jpg", "/images/products/a.jpg"],
        requiresBatchTracking: true,
        lowStockThreshold: 8,
      },
    });
    expect(res.status).toBe(201);
    createdId = res.body.data.id;
    fixtures.trackProduct(createdId);
    expect(res.body.data).toMatchObject({
      slug: `fresh-arrival-${tag}`,
      sku: `NEW-${tag}`.toUpperCase(),
      basePrice: 1250,
      costPrice: 780,
      isActive: false,
      listingStatus: "AWAITING_STOCK",
      totalStock: 0,
      lowStockThreshold: 8,
    });
    expect(res.body.data.autoDeactivatedAt).not.toBeNull();

    const imported = await api<ImportBatchResult>("POST", "/admin/inventory/batches", {
      token: inventory.token,
      body: { productId: createdId, batchNumber: "FA-1", expiryDate: addDays(today, 300), initialQuantity: 10 },
    });
    expect(imported.body.data.product.listingStatus).toBe("ACTIVE");
  });

  it("rejects invalid payloads with 422 field errors", async () => {
    const valid = {
      categoryId: c3.id,
      title: "Valid Title",
      sku: `v-${uniqueId()}`,
      description: "desc",
      basePrice: 10,
      costPrice: 5,
    };
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ ...valid, basePrice: "abc" }, "basePrice"],
      [{ ...valid, basePrice: -5 }, "basePrice"],
      [{ ...valid, basePrice: 0 }, "basePrice"],
      [{ ...valid, basePrice: "12.345" }, "basePrice"],
      [{ ...valid, costPrice: -1 }, "costPrice"],
      [{ ...valid, images: ["javascript:alert(1)"] }, "images"],
      [{ ...valid, images: ["/images/../secret"] }, "images"],
      [{ ...valid, slug: "Not A Slug" }, "slug"],
      [{ ...valid, sku: undefined }, "sku"],
      [{ ...valid, categoryId: "not-a-uuid" }, "categoryId"],
    ];
    for (const [body, field] of cases) {
      const res = await api<null>("POST", "/admin/catalog/products", { token: admin.token, body });
      expect(res.status).toBe(422);
      expect(res.body.error?.code).toBe("VALIDATION_ERROR");
      expect(res.body.error?.details).toMatchObject({ fieldErrors: { [field]: expect.any(Array) } });
    }
    const unknownKey = await api<null>("POST", "/admin/catalog/products", {
      token: admin.token,
      body: { ...valid, rating: 5 },
    });
    expect(unknownKey.status).toBe(422);
    const missingCategory = await api<null>("POST", "/admin/catalog/products", {
      token: admin.token,
      body: { ...valid, categoryId: "00000000-0000-4000-8000-000000000000" },
    });
    expect(missingCategory.status).toBe(422);
    expect(missingCategory.body.error?.details).toMatchObject({ fieldErrors: { categoryId: expect.any(Array) } });
  });

  it("rejects duplicate slug / sku with 409 and enforces PRODUCTS_WRITE", async () => {
    const dupSku = await api<null>("POST", "/admin/catalog/products", {
      token: admin.token,
      body: { categoryId: c3.id, title: "Dup", sku: p7.sku.toLowerCase(), description: "d", basePrice: 1, costPrice: 1 },
    });
    expect(dupSku.status).toBe(409);
    const dupSlug = await api<null>("POST", "/admin/catalog/products", {
      token: admin.token,
      body: { categoryId: c3.id, title: "Dup", slug: p7.slug, sku: `d-${uniqueId()}`, description: "d", basePrice: 1, costPrice: 1 },
    });
    expect(dupSlug.status).toBe(409);
    expect(dupSlug.body.error?.code).toBe("CONFLICT");
    const forbidden = await api<null>("POST", "/admin/catalog/products", {
      token: marketing.token,
      body: { categoryId: c3.id, title: "Nope", sku: `n-${uniqueId()}`, description: "d", basePrice: 1, costPrice: 1 },
    });
    expect(forbidden.status).toBe(403);
  });

  it("lists and reads admin products with cost price, status and batches", async () => {
    const list = await api<AdminProductDTO[]>("GET", `/admin/catalog/products?category=${c1.id}&sort=title_asc`, {
      token: marketing.token,
    });
    expect(list.status).toBe(200);
    expect(list.body.meta).toMatchObject({ total: 3 });
    expect(list.body.data.map((p) => p.id)).toEqual([p2.id, p3.id, p1.id]);
    expect(list.body.data.find((p) => p.id === p3.id)).toMatchObject({ listingStatus: "INACTIVE", costPrice: 50 });

    const inactive = await api<AdminProductDTO[]>("GET", `/admin/catalog/products?category=${c1.slug}&status=inactive`, {
      token: admin.token,
    });
    expect(inactive.body.data.map((p) => p.id)).toEqual([p3.id]);

    const detail = await api<AdminProductDetailDTO>("GET", `/admin/catalog/products/${p2.id}`, { token: admin.token });
    expect(detail.body.data.batches.map((b) => b.expiryDate)).toEqual([addDays(today, 10), addDays(today, 100)]);
    expect(detail.body.data.costPrice).toBe(50);

    expect((await api<null>("GET", "/admin/catalog/products/not-a-uuid", { token: admin.token })).status).toBe(422);
    expect(
      (await api<null>("GET", "/admin/catalog/products/00000000-0000-4000-8000-000000000000", { token: admin.token })).status,
    ).toBe(404);
    expect((await api<null>("GET", "/admin/catalog/products", { token: customer.token })).status).toBe(403);
  });

  it("keeps slug and sku immutable and toggles visibility explicitly", async () => {
    const slugChange = await api<null>("PATCH", `/admin/catalog/products/${p7.id}`, {
      token: admin.token,
      body: { slug: "something-else" },
    });
    expect(slugChange.status).toBe(422);
    expect(slugChange.body.error?.details).toMatchObject({ fieldErrors: { slug: expect.any(Array) } });
    const skuChange = await api<null>("PATCH", `/admin/catalog/products/${p7.id}`, {
      token: admin.token,
      body: { sku: "OTHER-SKU" },
    });
    expect(skuChange.status).toBe(422);
    const same = await api<AdminProductDTO>("PATCH", `/admin/catalog/products/${p7.id}`, {
      token: admin.token,
      body: { slug: p7.slug, sku: p7.sku, title: `Renamed ${tag}` },
    });
    expect(same.status).toBe(200);
    expect(same.body.data.title).toBe(`Renamed ${tag}`);
    expect((await api<null>("PATCH", `/admin/catalog/products/${p7.id}`, { token: admin.token, body: {} })).status).toBe(422);

    const off = await api<AdminProductDTO>("PATCH", `/admin/catalog/products/${p7.id}`, {
      token: admin.token,
      body: { isActive: false },
    });
    expect(off.body.data).toMatchObject({ isActive: false, listingStatus: "INACTIVE", autoDeactivatedAt: null });
    const on = await api<AdminProductDTO>("PATCH", `/admin/catalog/products/${p7.id}`, {
      token: admin.token,
      body: { isActive: true },
    });
    expect(on.body.data).toMatchObject({ isActive: true, listingStatus: "ACTIVE" });

    // Re-activating a product without stock leaves it waiting for stock.
    const empty = await api<AdminProductDTO>("PATCH", `/admin/catalog/products/${p6.id}`, {
      token: admin.token,
      body: { isActive: true },
    });
    expect(empty.body.data.listingStatus).toBe("AWAITING_STOCK");
  });

  it("soft-deletes (409 when already inactive) and clears the auto marker", async () => {
    const removed = await api<AdminProductDTO>("DELETE", `/admin/catalog/products/${p6.id}`, { token: admin.token });
    expect(removed.status).toBe(200);
    expect(removed.body.data).toMatchObject({ isActive: false, listingStatus: "INACTIVE", autoDeactivatedAt: null });
    const again = await api<null>("DELETE", `/admin/catalog/products/${p6.id}`, { token: admin.token });
    expect(again.status).toBe(409);
    expect(again.body.error?.code).toBe("CONFLICT");
  });
});

// ===========================================================================
// Discounts admin
// ===========================================================================

describe("admin discounts", () => {
  const endsAt = inDays(10).toISOString();

  it("creates an automatic category discount that immediately reprices the catalog", async () => {
    const res = await api<DiscountDTO>("POST", "/admin/discounts", {
      token: marketing.token,
      body: { name: `C3 sale ${tag}`, type: "PERCENTAGE", value: 25, categoryId: c3.id, endsAt },
    });
    expect(res.status).toBe(201);
    fixtures.trackDiscount(res.body.data.id);
    expect(res.body.data).toMatchObject({
      kind: "AUTOMATIC",
      code: null,
      scope: "CATEGORY",
      value: 25,
      status: "ACTIVE",
      isFlashSale: false,
      usageCount: 0,
      category: { id: c3.id, slug: c3.slug },
    });

    const listed = await api<CatalogProductDTO[]>("GET", `/catalog/products?category=${c3.slug}`);
    expect(listed.body.data.find((p) => p.id === p7.id)?.effectivePrice).toBe(150);
  });

  it("validates discounts", async () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ type: "PERCENTAGE", value: 150, productId: p7.id, endsAt }, "value"],
      [{ type: "PERCENTAGE", value: 0, productId: p7.id, endsAt }, "value"],
      [{ type: "FIXED_AMOUNT", value: 10, productId: p7.id, usageLimit: 5, endsAt }, "usageLimit"],
      [{ type: "FIXED_AMOUNT", value: 10, productId: p7.id, categoryId: c3.id, endsAt }, "productId"],
      [{ type: "FIXED_AMOUNT", value: 10, startsAt: inDays(5).toISOString(), endsAt: inDays(4).toISOString() }, "endsAt"],
      [{ type: "FIXED_AMOUNT", value: 10, code: "FLASHY", isFlashSale: true, endsAt }, "isFlashSale"],
      [{ type: "FIXED_AMOUNT", value: 10, endsAt: "tomorrow" }, "endsAt"],
    ];
    for (const [body, field] of cases) {
      const res = await api<null>("POST", "/admin/discounts", { token: marketing.token, body });
      expect(res.status).toBe(422);
      expect(res.body.error?.details).toMatchObject({ fieldErrors: { [field]: expect.any(Array) } });
    }
    const missingProduct = await api<null>("POST", "/admin/discounts", {
      token: marketing.token,
      body: { type: "FIXED_AMOUNT", value: 10, productId: "00000000-0000-4000-8000-000000000000", endsAt },
    });
    expect(missingProduct.status).toBe(422);
    const duplicateCoupon = await api<null>("POST", "/admin/discounts", {
      token: marketing.token,
      body: { code: couponCode.toLowerCase(), type: "FIXED_AMOUNT", value: 10, endsAt },
    });
    expect(duplicateCoupon.status).toBe(409);
    expect((await api<null>("GET", "/admin/discounts", { token: inventory.token })).status).toBe(403);
  });

  it("lists, updates and deactivates coupons", async () => {
    const code = `T${uniqueId()}`.slice(0, 20);
    const created = await api<DiscountDTO>("POST", "/admin/discounts", {
      token: admin.token,
      body: { code, type: "FIXED_AMOUNT", value: "100", minOrderAmount: 1500, usageLimit: 10, perCustomerLimit: 1, endsAt },
    });
    expect(created.status).toBe(201);
    fixtures.trackDiscount(created.body.data.id);
    expect(created.body.data).toMatchObject({ kind: "COUPON", code: code.toUpperCase(), minOrderAmount: 1500, scope: "STORE" });

    const coupons = await api<DiscountDTO[]>("GET", `/admin/discounts?type=coupon&q=${code}`, { token: admin.token });
    expect(coupons.body.data.map((d) => d.id)).toEqual([created.body.data.id]);
    const automaticOnly = await api<DiscountDTO[]>("GET", `/admin/discounts?type=automatic&q=${code}`, { token: admin.token });
    expect(automaticOnly.body.data).toHaveLength(0);
    const running = await api<DiscountDTO[]>("GET", `/admin/discounts?active=true&q=${code}`, { token: admin.token });
    expect(running.body.meta?.total).toBe(1);

    const updated = await api<DiscountDTO>("PATCH", `/admin/discounts/${created.body.data.id}`, {
      token: admin.token,
      body: { value: 120, name: "Renamed coupon" },
    });
    expect(updated.body.data).toMatchObject({ value: 120, name: "Renamed coupon" });
    const codeChange = await api<null>("PATCH", `/admin/discounts/${created.body.data.id}`, {
      token: admin.token,
      body: { code: "DIFFERENT" },
    });
    expect(codeChange.status).toBe(422);
    const readOnly = await api<null>("PATCH", `/admin/discounts/${created.body.data.id}`, {
      token: admin.token,
      body: { usageCount: 0 },
    });
    expect(readOnly.status).toBe(422);

    const removed = await api<DiscountDTO>("DELETE", `/admin/discounts/${created.body.data.id}`, { token: admin.token });
    expect(removed.body.data).toMatchObject({ isActive: false, status: "DISABLED" });
    expect((await api<null>("DELETE", `/admin/discounts/${created.body.data.id}`, { token: admin.token })).status).toBe(409);
    expect((await api<DiscountDTO>("GET", `/admin/discounts/${created.body.data.id}`, { token: admin.token })).status).toBe(200);
  });

  it("keeps the legacy POST /admin/catalog/flash-sales payload working", async () => {
    const res = await api<DiscountDTO>("POST", "/admin/catalog/flash-sales", {
      token: marketing.token,
      body: {
        productId: p7.id,
        discountType: "FIXED_AMOUNT",
        type: "FIXED_AMOUNT",
        value: "30",
        startsAt: new Date().toISOString(),
        endsAt,
        isFlashSale: true,
      },
    });
    expect(res.status).toBe(201);
    fixtures.trackDiscount(res.body.data.id);
    expect(res.body.data).toMatchObject({ kind: "AUTOMATIC", isFlashSale: true, scope: "PRODUCT", value: 30 });

    const sales = await api<FlashSaleDTO[]>("GET", "/catalog/flash-sales");
    expect(sales.body.data.find((s) => s.id === res.body.data.id)?.product?.id).toBe(p7.id);
  });
});
