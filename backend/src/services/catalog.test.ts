import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { app } from "../index";
import { db, products, categories, discounts, productBatches } from "../db";
import { eq, or, sql } from "drizzle-orm";
import { signAccessToken } from "../lib/jwt";
import { FlashSaleService, type Discount } from "./flash-sale.service";
import {
  cacheStore,
  clearCache,
  invalidateCacheByPrefix,
  MemoryLRUCache,
} from "../middleware/cache";

describe("Phase 4: Catalog Discovery, Trigram Search & Flash Sales", () => {
  const flashSaleService = new FlashSaleService();
  const testRunId = Date.now().toString().slice(-6);

  let superAdminToken: string;
  let customerToken: string;

  let testCategoryId: string;
  let testProductId: string;
  const testSku = `SKU-TST-${testRunId}`;
  const testSlug = `test-serum-${testRunId}`;

  beforeAll(async () => {
    clearCache();

    // Generate tokens
    superAdminToken = await signAccessToken({
      sub: "00000000-0000-0000-0000-000000000001",
      role: "SUPER_ADMIN",
      phone: "+8801700000000",
    });

    customerToken = await signAccessToken({
      sub: "00000000-0000-0000-0000-000000000002",
      role: "CUSTOMER",
      phone: "+8801900000000",
    });

    // Fetch existing category or use Skin Care
    const [existingCat] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.slug, "skin-care"))
      .limit(1);

    if (existingCat) {
      testCategoryId = existingCat.id;
    } else {
      const [newCat] = await db
        .insert(categories)
        .values({
          name: "Test Skin Care",
          slug: `test-cat-${testRunId}`,
        })
        .returning();
      testCategoryId = newCat.id;
    }
  });

  afterAll(async () => {
    clearCache();
    // Clean up test discounts and products created in tests
    if (testProductId) {
      await db
        .delete(productBatches)
        .where(eq(productBatches.productId, testProductId));
      await db
        .delete(discounts)
        .where(eq(discounts.productId, testProductId));
      await db.delete(products).where(eq(products.id, testProductId));
    }
    await db.delete(products).where(eq(products.sku, testSku));
  });

  // ===========================================================================
  // 1. FlashSaleService Discount Calculations & Priority Resolution
  // ===========================================================================
  describe("1. FlashSaleService", () => {
    const mockProduct = {
      id: "prod-100",
      categoryId: "cat-skincare",
      basePrice: "1000.00",
    };

    it("should return base price when no active discounts are provided", () => {
      const result = flashSaleService.calculateEffectivePrice(mockProduct, []);
      expect(result.effectivePrice).toBe("1000.00");
      expect(result.discount).toBeNull();
    });

    it("should correctly compute percentage discount", () => {
      const activeDiscounts: Discount[] = [
        {
          id: "disc-1",
          type: "PERCENTAGE",
          value: "20.00",
          productId: "prod-100",
          startsAt: new Date(),
          endsAt: new Date(Date.now() + 3600000),
          isFlashSale: true,
          isActive: true,
        },
      ];

      const result = flashSaleService.calculateEffectivePrice(
        mockProduct,
        activeDiscounts,
      );
      // 1000 - 20% = 800.00
      expect(result.effectivePrice).toBe("800.00");
      expect(result.discount?.id).toBe("disc-1");
    });

    it("should correctly compute fixed amount discount", () => {
      const activeDiscounts: Discount[] = [
        {
          id: "disc-2",
          type: "FIXED_AMOUNT",
          value: "150.00",
          productId: "prod-100",
          startsAt: new Date(),
          endsAt: new Date(Date.now() + 3600000),
          isFlashSale: true,
          isActive: true,
        },
      ];

      const result = flashSaleService.calculateEffectivePrice(
        mockProduct,
        activeDiscounts,
      );
      // 1000 - 150 = 850.00
      expect(result.effectivePrice).toBe("850.00");
      expect(result.discount?.id).toBe("disc-2");
    });

    it("should enforce priority resolution: Product-specific discount wins over Category-level", () => {
      // Product-specific: 10% off (saving 100, price 900)
      // Category-level: 50% off (saving 500, price 500)
      // Requirement: Product-specific MUST win over Category-level
      const activeDiscounts: Discount[] = [
        {
          id: "cat-disc",
          type: "PERCENTAGE",
          value: "50.00",
          categoryId: "cat-skincare",
          productId: null,
          startsAt: new Date(),
          endsAt: new Date(Date.now() + 3600000),
          isFlashSale: true,
          isActive: true,
        },
        {
          id: "prod-disc",
          type: "PERCENTAGE",
          value: "10.00",
          productId: "prod-100",
          categoryId: null,
          startsAt: new Date(),
          endsAt: new Date(Date.now() + 3600000),
          isFlashSale: true,
          isActive: true,
        },
      ];

      const result = flashSaleService.calculateEffectivePrice(
        mockProduct,
        activeDiscounts,
      );
      expect(result.discount?.id).toBe("prod-disc");
      expect(result.effectivePrice).toBe("900.00");
    });

    it("should pick the highest savings when multiple discounts exist at the same level", () => {
      // Two product-level discounts: 15% off vs $200 fixed off 1000.00
      // 15% off 1000 = 850.00
      // $200 off 1000 = 800.00 (better saving)
      const activeDiscounts: Discount[] = [
        {
          id: "prod-15pct",
          type: "PERCENTAGE",
          value: "15.00",
          productId: "prod-100",
          isActive: true,
        },
        {
          id: "prod-200fixed",
          type: "FIXED_AMOUNT",
          value: "200.00",
          productId: "prod-100",
          isActive: true,
        },
      ];

      const result = flashSaleService.calculateEffectivePrice(
        mockProduct,
        activeDiscounts,
      );
      expect(result.discount?.id).toBe("prod-200fixed");
      expect(result.effectivePrice).toBe("800.00");
    });

    it("should never reduce effective price below 0 (zero-floor constraint)", () => {
      const activeDiscounts: Discount[] = [
        {
          id: "huge-disc",
          type: "FIXED_AMOUNT",
          value: "1500.00", // Exceeds base price of 1000.00
          productId: "prod-100",
          isActive: true,
        },
      ];

      const result = flashSaleService.calculateEffectivePrice(
        mockProduct,
        activeDiscounts,
      );
      expect(result.effectivePrice).toBe("0.00");
    });

    it("should round effective price to 2 decimal places", () => {
      const oddProduct = {
        id: "prod-odd",
        categoryId: "cat-1",
        basePrice: "125.55",
      };
      const activeDiscounts: Discount[] = [
        {
          id: "disc-fraction",
          type: "PERCENTAGE",
          value: "15.00", // 125.55 * 0.15 = 18.8325 -> effective 106.7175 -> 106.72
          productId: "prod-odd",
          isActive: true,
        },
      ];

      const result = flashSaleService.calculateEffectivePrice(
        oddProduct,
        activeDiscounts,
      );
      expect(result.effectivePrice).toBe("106.72");
    });

    it("should ignore discounts marked isActive: false", () => {
      const activeDiscounts: Discount[] = [
        {
          id: "inactive-disc",
          type: "PERCENTAGE",
          value: "50.00",
          productId: "prod-100",
          isActive: false,
        },
      ];

      const result = flashSaleService.calculateEffectivePrice(
        mockProduct,
        activeDiscounts,
      );
      expect(result.effectivePrice).toBe("1000.00");
      expect(result.discount).toBeNull();
    });

    it("should calculate countdown in milliseconds correctly", () => {
      const futureDate = new Date(Date.now() + 60000);
      const countdown = flashSaleService.getFlashSaleCountdown({
        endsAt: futureDate,
      });
      expect(countdown).toBeGreaterThan(0);
      expect(countdown).toBeLessThanOrEqual(60000);

      const pastDate = new Date(Date.now() - 60000);
      expect(
        flashSaleService.getFlashSaleCountdown({ endsAt: pastDate }),
      ).toBe(0);
    });

    it("should compute detailed effective pricing numbers", () => {
      const discount: Discount = {
        id: "d1",
        type: "PERCENTAGE",
        value: "25.00",
      };
      const pricing = flashSaleService.computeEffectivePrice(400, discount);
      expect(pricing.effectivePrice).toBe(300);
      expect(pricing.discountAmount).toBe(100);
      expect(pricing.discountPercent).toBe(25);
    });
  });

  // ===========================================================================
  // 2. Cache Middleware Caching Behavior
  // ===========================================================================
  describe("2. Cache Middleware & LRU Cache", () => {
    beforeAll(() => {
      clearCache();
    });

    it("should serve MISS on initial request and HIT on subsequent request", async () => {
      clearCache();

      // First request - MISS
      const res1 = await app.request("/catalog/products");
      expect(res1.status).toBe(200);
      expect(res1.headers.get("X-Cache")).toBe("MISS");
      expect(res1.headers.get("Cache-Control")).toContain("public, max-age=");

      // Second request - HIT
      const res2 = await app.request("/catalog/products");
      expect(res2.status).toBe(200);
      expect(res2.headers.get("X-Cache")).toBe("HIT");

      const body1 = await res1.json();
      const body2 = await res2.json();
      expect(body2).toEqual(body1);
    });

    it("should bypass cache when Authorization header is present", async () => {
      clearCache();

      // Seed cache with public request
      await app.request("/catalog/products");

      // Authenticated request with Bearer token
      const authRes = await app.request("/catalog/products", {
        headers: {
          Authorization: `Bearer ${customerToken}`,
        },
      });

      expect(authRes.status).toBe(200);
      // Cache header should be absent when bypassed
      expect(authRes.headers.get("X-Cache")).toBeNull();
    });

    it("should invalidate cache entries by prefix", async () => {
      clearCache();

      // Populate cache
      const res1 = await app.request("/catalog/products");
      expect(res1.headers.get("X-Cache")).toBe("MISS");

      const resHit = await app.request("/catalog/products");
      expect(resHit.headers.get("X-Cache")).toBe("HIT");

      // Invalidate prefix
      const evictedCount = invalidateCacheByPrefix("/catalog");
      expect(evictedCount).toBeGreaterThan(0);

      // Next request should be MISS again
      const resAfterEvict = await app.request("/catalog/products");
      expect(resAfterEvict.headers.get("X-Cache")).toBe("MISS");
    });

    it("should evict least-recently-used entry when capacity is exceeded", () => {
      const smallCache = new MemoryLRUCache(2);

      smallCache.set("key1", { body: "val1", contentType: "text/plain" }, 60);
      smallCache.set("key2", { body: "val2", contentType: "text/plain" }, 60);

      // Access key1 to make key2 the least recently used
      expect(smallCache.get("key1")?.body).toBe("val1");

      // Add key3, should evict key2
      smallCache.set("key3", { body: "val3", contentType: "text/plain" }, 60);

      expect(smallCache.get("key1")?.body).toBe("val1");
      expect(smallCache.get("key2")).toBeUndefined();
      expect(smallCache.get("key3")?.body).toBe("val3");
    });

    it("should expire items when TTL has elapsed", async () => {
      const shortCache = new MemoryLRUCache(10);
      // TTL = 0.01 seconds (10ms)
      shortCache.set(
        "expiring-key",
        { body: "hello", contentType: "text/plain" },
        0.01,
      );

      // Wait 25ms
      await new Promise((r) => setTimeout(r, 25));

      expect(shortCache.get("expiring-key")).toBeUndefined();
    });
  });

  // ===========================================================================
  // 3. Trigram Search & PostgreSQL GIN Indexes
  // ===========================================================================
  describe("3. Trigram Search & PostgreSQL Indexing", () => {
    it("should verify pg_trgm extension and similarity function are operational", async () => {
      const result = await db.execute(sql`
        SELECT similarity('Organic Rose Hip Serum', 'rosehip') AS sim;
      `);

      const sim = Number((result.rows[0] as any).sim);
      expect(sim).toBeGreaterThan(0.2);
    });

    it("should execute trigram fuzzy search and find products matching partial titles or typos", async () => {
      // Search for 'wash' or 'hydrat' (matches "Natural Hydrating Face Wash")
      const res = await app.request("/catalog/products?q=hydrat");
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(Array.isArray(json.data)).toBe(true);

      const matching = json.data.some((p: any) =>
        p.title.toLowerCase().includes("hydrat"),
      );
      expect(matching).toBe(true);
    });

    it("should fallback gracefully to ILIKE for short search queries (< 3 chars)", async () => {
      const res = await app.request("/catalog/products?q=fa");
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(Array.isArray(json.data)).toBe(true);
      // Should find "Face Wash" via ILIKE
      const matching = json.data.some((p: any) =>
        p.title.toLowerCase().includes("fa"),
      );
      expect(matching).toBe(true);
    });

    it("should rank trigram similarity matches and calculate effectivePrice in public listing", async () => {
      const res = await app.request("/catalog/products?q=diaper");
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.length).toBeGreaterThan(0);

      const item = json.data[0];
      expect(item.effectivePrice).toBeDefined();
      expect(typeof item.effectivePrice).toBe("string");
      expect(item.totalAvailable).toBeDefined();
      expect(typeof item.isLowStock).toBe("boolean");
      expect(typeof item.isOutOfStock).toBe("boolean");
    });
  });

  // ===========================================================================
  // 4. Catalog Endpoints: Detail with Batch Expiry & Admin Operations
  // ===========================================================================
  describe("4. Catalog Endpoints & Admin Operations", () => {
    it("should create a new product via POST /admin/catalog/products (require PRODUCTS_WRITE)", async () => {
      const res = await app.request("/admin/catalog/products", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${superAdminToken}`,
        },
        body: JSON.stringify({
          categoryId: testCategoryId,
          title: "Organic Rose Hip Serum",
          slug: testSlug,
          sku: testSku,
          description:
            "Cold-pressed rosehip oil serum for post-natal skin recovery. Dermatologist tested.",
          basePrice: "1250.00",
          costPrice: "780.00",
          images: [
            "https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?w=800",
          ],
          requiresBatchTracking: true,
          lowStockThreshold: 8,
          isActive: true,
        }),
      });

      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.slug).toBe(testSlug);
      testProductId = json.data.id;

      // Add a batch for FEFO expiry transparency verification
      await db.insert(productBatches).values({
        productId: testProductId,
        batchNumber: `BAT-${testRunId}-1`,
        manufactureDate: "2026-01-01",
        expiryDate: "2027-06-30",
        initialQuantity: 20,
        availableQuantity: 20,
      });
    });

    it("should reject product creation without PRODUCTS_WRITE permission", async () => {
      const res = await app.request("/admin/catalog/products", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${customerToken}`,
        },
        body: JSON.stringify({
          categoryId: testCategoryId,
          title: "Unauthorized Product",
          slug: `unauth-${testRunId}`,
          sku: `UNAUTH-${testRunId}`,
          description: "This should fail due to RBAC guard.",
          basePrice: "500.00",
          costPrice: "300.00",
          images: ["https://example.com/img.jpg"],
        }),
      });

      expect(res.status).toBe(403);
    });

    it("should get product detail with batch expiry info via GET /catalog/products/:idOrSlug", async () => {
      // Query by slug
      const resSlug = await app.request(`/catalog/products/${testSlug}`);
      expect(resSlug.status).toBe(200);
      const jsonSlug = await resSlug.json();
      expect(jsonSlug.success).toBe(true);
      expect(jsonSlug.data.id).toBe(testProductId);
      expect(jsonSlug.data.earliestExpiry).toBe("2027-06-30");
      expect(jsonSlug.data.totalAvailable).toBe(20);
      expect(Array.isArray(jsonSlug.data.batchSummary)).toBe(true);
      expect(jsonSlug.data.batchSummary.length).toBe(1);

      // Query by UUID
      const resUuid = await app.request(`/catalog/products/${testProductId}`);
      expect(resUuid.status).toBe(200);
      const jsonUuid = await resUuid.json();
      expect(jsonUuid.data.slug).toBe(testSlug);
    });

    it("should create a flash sale discount via POST /admin/catalog/flash-sales (require DISCOUNTS_MANAGE)", async () => {
      const startsAt = new Date().toISOString();
      const endsAt = new Date(Date.now() + 86400000).toISOString();

      const res = await app.request("/admin/catalog/flash-sales", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${superAdminToken}`,
        },
        body: JSON.stringify({
          productId: testProductId,
          discountType: "PERCENTAGE",
          value: "20.00",
          startsAt,
          endsAt,
          isFlashSale: true,
          isActive: true,
        }),
      });

      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.type).toBe("PERCENTAGE");
      expect(json.data.value).toBe("20.00");

      // Verify that the product detail now reflects effectivePrice (1250 - 20% = 1000.00)
      const detailRes = await app.request(`/catalog/products/${testSlug}`);
      expect(detailRes.status).toBe(200);
      const detailJson = await detailRes.json();
      expect(detailJson.data.effectivePrice).toBe("1000.00");
      expect(detailJson.data.activeDiscount).not.toBeNull();
      expect(detailJson.data.activeDiscount.countdownMs).toBeGreaterThan(0);
    });

    it("should update a product via PATCH /admin/catalog/products/:id", async () => {
      const res = await app.request(
        `/admin/catalog/products/${testProductId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${superAdminToken}`,
          },
          body: JSON.stringify({
            title: "Organic Rose Hip Serum (Premium)",
            basePrice: "1400.00",
          }),
        },
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.title).toBe("Organic Rose Hip Serum (Premium)");
      expect(json.data.basePrice).toBe("1400.00");
    });

    it("should soft-delete a product via DELETE /admin/catalog/products/:id (isActive = false)", async () => {
      const res = await app.request(
        `/admin/catalog/products/${testProductId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${superAdminToken}`,
          },
        },
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.message).toContain("deactivated");

      // Confirm product no longer appears in public detail
      const detailRes = await app.request(`/catalog/products/${testSlug}`);
      expect(detailRes.status).toBe(404);

      // Confirm product row still exists in DB with isActive = false (audit preservation)
      const [dbRow] = await db
        .select({ isActive: products.isActive })
        .from(products)
        .where(eq(products.id, testProductId));
      expect(dbRow.isActive).toBe(false);
    });
  });
});
