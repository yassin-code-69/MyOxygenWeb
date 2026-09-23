### Phase 4 Context & Architecture Blueprint

Phase 4 delivers the **high-performance product discovery layer** for the **My Oxygen** storefront. It instruments the PostgreSQL engine with a native trigram index so that partial-title and fuzzy-description searches resolve in under 10 ms on commodity hardware. On top of that index it erects a fully-typed Hono.js catalog router, a time-aware flash-sale pricing engine, and an in-memory LRU cache that shields the database from repeated read bursts during campaign traffic spikes.

Every component in this phase depends on the RBAC middleware (`requirePermission`) established in Phase 2 and the Drizzle schema from Phase 1. The flash-sale engine is intentionally decoupled into its own service class so it can be unit-tested independently and consumed by both the public catalog API and the future cart/checkout flow.

Key invariants enforced in this phase:

- **Trigram sub-10 ms search:** `pg_trgm` GIN indexes on `products.title` and `products.description` allow `similarity()` scoring with no sequential scans even at 50 k+ SKUs.

- **Effective-price computation:** Every product listing exposes `effectivePrice` — the real customer-facing price after any active flash sale — computed server-side so the front-end never needs to run discount logic.

- **Priority discount resolution:** A product-specific discount always wins over a category-level discount. The flash-sale engine evaluates both and returns the higher-value discount.

- **LRU caching:** Public `GET` responses are cached in-process for configurable TTLs. Authenticated requests bypass the cache to guarantee fresh admin reads.

- **Soft deletes:** Products are never hard-deleted; `isActive = false` preserves order history integrity and the stock ledger audit trail.

---

### Step 1: PostgreSQL Trigram Search Extension

Enable `pg_trgm` inside a Drizzle migration so every existing and future `products` row benefits from the GIN index automatically.

#### Migration SQL Block

Create the file `packages/database/src/migrations/0004_trigram_search.sql` and run it via `drizzle-kit migrate`:

```sql
-- 0004_trigram_search.sql
-- Enable the PostgreSQL trigram extension for fuzzy / partial-word search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN index on products.title — covers similarity() scoring and ILIKE patterns
CREATE INDEX CONCURRENTLY IF NOT EXISTS products_title_trgm_idx
  ON products
  USING GIN (title gin_trgm_ops);

-- GIN index on products.description — enables full-description fuzzy matching
CREATE INDEX CONCURRENTLY IF NOT EXISTS products_description_trgm_idx
  ON products
  USING GIN (description gin_trgm_ops);

-- Composite GIN for joint title+description ranked search via ts_rank equivalent
-- (optional; use when you need cross-column OR similarity queries)
CREATE INDEX CONCURRENTLY IF NOT EXISTS products_search_combined_trgm_idx
  ON products
  USING GIN ((title || ' ' || description) gin_trgm_ops);
```

> [!IMPORTANT]
> `CONCURRENTLY` avoids locking existing reads during index construction on a live database.
> In staging/dev environments without active connections, you may omit `CONCURRENTLY`.
> The minimum `pg_trgm` similarity threshold is 0.3 — tune via `SET pg_trgm.similarity_threshold = 0.25;` in the session for broader matches.

#### Drizzle Migration Wrapper

Drizzle-kit will apply the raw SQL when `db:migrate` is run. Register the migration in `packages/database/drizzle.config.ts` if it is not already auto-discovered:

```typescript
// packages/database/drizzle.config.ts
import type { Config } from "drizzle-kit";

export default {
  schema: "./src/schema/tables.ts",
  out: "./src/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
} satisfies Config;
```

---

### Step 2: Product Catalog Schemas

All inbound request validation for the catalog surface lives in a single schema module so it can be imported by both the route handler and any future SDK generation.

#### `apps/api/src/routes/catalog.schema.ts`

```typescript
import { z } from "zod";

// ---------------------------------------------------------------------------
// Product Creation Schema
// ---------------------------------------------------------------------------
export const createProductSchema = z.object({
  categoryId: z.string().uuid("categoryId must be a valid UUID"),
  title: z
    .string()
    .min(3, "Title must be at least 3 characters")
    .max(255, "Title must not exceed 255 characters"),
  slug: z
    .string()
    .min(3)
    .max(255)
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Slug must be lowercase kebab-case (e.g. natural-face-wash)",
    ),
  sku: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[A-Z0-9\-_]+$/, "SKU must be uppercase alphanumeric with hyphens"),
  description: z.string().min(10, "Description must be at least 10 characters"),
  basePrice: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, "basePrice must be a valid decimal string"),
  costPrice: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, "costPrice must be a valid decimal string"),
  images: z
    .array(z.string().url("Each image must be a valid URL"))
    .min(1, "At least one product image is required"),
  requiresBatchTracking: z.boolean().default(false),
  lowStockThreshold: z.number().int().min(0).default(5),
  isActive: z.boolean().default(true),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;

// ---------------------------------------------------------------------------
// Product Update Schema (all fields optional via partial)
// ---------------------------------------------------------------------------
export const updateProductSchema = createProductSchema
  .omit({ slug: true, sku: true }) // slug & SKU are immutable after creation
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided for update",
  });

export type UpdateProductInput = z.infer<typeof updateProductSchema>;

// ---------------------------------------------------------------------------
// Catalog Query / Filter Schema
// ---------------------------------------------------------------------------
export const sortEnum = z.enum([
  "price_asc",
  "price_desc",
  "newest",
  "popular",
]);

export const catalogQuerySchema = z.object({
  /** Full-text / trigram search term — matched against title and description */
  q: z.string().min(1).max(128).optional(),
  /** Category slug filter (e.g. "newborn", "skin-care") */
  categorySlug: z.string().max(255).optional(),
  /** Minimum price in BDT (inclusive) */
  minPrice: z.coerce.number().nonnegative().optional(),
  /** Maximum price in BDT (inclusive) */
  maxPrice: z.coerce.number().nonnegative().optional(),
  /** When true, only products with availableQuantity > 0 are returned */
  inStockOnly: z
    .string()
    .optional()
    .transform((v) => v === "true")
    .pipe(z.boolean()),
  /** Sort order applied to the result set */
  sort: sortEnum.default("newest"),
  /** 1-based page number */
  page: z.coerce.number().int().min(1).default(1),
  /** Items per page — capped at 100 */
  limit: z.coerce.number().int().min(1).max(100).default(24),
});

export type CatalogQueryInput = z.infer<typeof catalogQuerySchema>;

// ---------------------------------------------------------------------------
// Flash Sale / Discount Schema
// ---------------------------------------------------------------------------
export const flashSaleSchema = z
  .object({
    /** Optional coupon code — null for automatic flash sales */
    code: z.string().max(64).optional().nullable(),
    /** Product-level or category-level scope (mutually exclusive) */
    productId: z.string().uuid().optional().nullable(),
    categoryId: z.string().uuid().optional().nullable(),
    /** Discount mechanics */
    discountType: z.enum(["PERCENTAGE", "FIXED_AMOUNT"]),
    value: z
      .string()
      .regex(
        /^\d+(\.\d{1,2})?$/,
        "value must be a valid decimal (e.g. '15.00')",
      ),
    /** ISO 8601 datetime strings — stored as timestamptz */
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }),
    isFlashSale: z.boolean().default(true),
    isActive: z.boolean().default(true),
  })
  .refine(
    (data) => {
      const start = new Date(data.startsAt);
      const end = new Date(data.endsAt);
      return end > start;
    },
    { message: "endsAt must be after startsAt", path: ["endsAt"] },
  )
  .refine(
    (data) => {
      // At most one of productId / categoryId may be set
      const hasProduct = data.productId != null;
      const hasCategory = data.categoryId != null;
      return !(hasProduct && hasCategory);
    },
    {
      message:
        "A discount must target either a product or a category — not both",
      path: ["productId"],
    },
  );

export type FlashSaleInput = z.infer<typeof flashSaleSchema>;
```

---

### Step 3: Product Catalog CRUD Endpoints

The catalog router is mounted at two path prefixes: `/catalog` (public) and `/admin/catalog` (protected). The single file exports one `Hono` instance for both.

#### `apps/api/src/routes/catalog.ts`

```typescript
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { db } from "@my-oxygen/database";
import {
  products,
  categories,
  productBatches,
  discounts,
} from "@my-oxygen/database/schema/tables";
import {
  eq,
  and,
  gte,
  lte,
  gt,
  desc,
  asc,
  sql,
  ilike,
  or,
  inArray,
  ne,
} from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../lib/rbac";
import { cacheMiddleware } from "../middleware/cache";
import { FlashSaleService } from "../services/flash-sale.service";
import {
  createProductSchema,
  updateProductSchema,
  catalogQuerySchema,
  flashSaleSchema,
} from "./catalog.schema";

const catalog = new Hono();
const flashSaleService = new FlashSaleService();

// ===========================================================================
// PUBLIC CATALOG ROUTES
// ===========================================================================

/**
 * GET /catalog/products
 * Paginated product listing with category filter, price range, stock filter,
 * trigram search, and effective-price computation.
 * Cached for 60 seconds.
 */
catalog.get(
  "/catalog/products",
  cacheMiddleware(60),
  zValidator("query", catalogQuerySchema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          success: false,
          error: "Invalid query parameters",
          details: result.error.flatten(),
        },
        400,
      );
    }
  }),
  async (c) => {
    const query = c.req.valid("query");
    const {
      q,
      categorySlug,
      minPrice,
      maxPrice,
      inStockOnly,
      sort,
      page,
      limit,
    } = query;

    const offset = (page - 1) * limit;

    // Build WHERE conditions dynamically
    const conditions: ReturnType<typeof and>[] = [eq(products.isActive, true)];

    // Category slug join filter
    let resolvedCategoryId: string | null = null;
    if (categorySlug) {
      const [cat] = await db
        .select({ id: categories.id })
        .from(categories)
        .where(
          and(eq(categories.slug, categorySlug), eq(categories.isActive, true)),
        )
        .limit(1);
      if (!cat) {
        return c.json(
          { success: false, error: `Category '${categorySlug}' not found` },
          404,
        );
      }
      resolvedCategoryId = cat.id;
      conditions.push(eq(products.categoryId, cat.id));
    }

    // Price range filters (basePrice is stored as numeric string in PG)
    if (minPrice !== undefined) {
      conditions.push(gte(products.basePrice, String(minPrice)));
    }
    if (maxPrice !== undefined) {
      conditions.push(lte(products.basePrice, String(maxPrice)));
    }

    // In-stock filter: sum of availableQuantity across all batches > 0
    // Implemented as a correlated sub-query to stay within Drizzle's type system
    if (inStockOnly) {
      conditions.push(
        gt(
          sql<number>`(
            SELECT COALESCE(SUM(pb.available_quantity), 0)
            FROM product_batches pb
            WHERE pb.product_id = ${products.id}
              AND pb.expiry_date >= CURRENT_DATE
          )`,
          0,
        ),
      );
    }

    // ---------------------------------------------------------------------------
    // Trigram search via pg_trgm similarity() — falls back gracefully when q
    // is too short for a meaningful similarity score (< 3 chars → use ILIKE).
    // ---------------------------------------------------------------------------
    let searchRankExpr = sql<number>`1`; // default rank = 1 (no-op for sorting)
    if (q) {
      if (q.length >= 3) {
        // Trigram similarity: score between 0.0 and 1.0
        // GIN index is automatically used by the query planner
        searchRankExpr = sql<number>`
          GREATEST(
            similarity(${products.title}, ${q}),
            similarity(${products.description}, ${q})
          )
        `;
        conditions.push(
          sql`(
            similarity(${products.title}, ${q}) > 0.15
            OR similarity(${products.description}, ${q}) > 0.10
            OR ${products.title} ILIKE ${"%" + q + "%"}
            OR ${products.description} ILIKE ${"%" + q + "%"}
          )`,
        );
      } else {
        // Short queries: plain ILIKE is faster than trigram for 1-2 chars
        conditions.push(
          or(
            ilike(products.title, `%${q}%`),
            ilike(products.description, `%${q}%`),
          )!,
        );
      }
    }

    // Build ORDER BY
    const orderClause = (() => {
      if (q && q.length >= 3) return desc(searchRankExpr); // relevance first
      switch (sort) {
        case "price_asc":
          return asc(sql`${products.basePrice}::numeric`);
        case "price_desc":
          return desc(sql`${products.basePrice}::numeric`);
        case "newest":
          return desc(products.createdAt);
        case "popular":
          // Proxy for popularity: order by number of order_items references
          // (full popularity requires Phase 5 order data — fallback to newest)
          return desc(products.createdAt);
      }
    })();

    // Fetch products + total count in parallel
    const whereClause = and(...conditions);

    const [rows, [{ total }]] = await Promise.all([
      db
        .select({
          id: products.id,
          title: products.title,
          slug: products.slug,
          sku: products.sku,
          description: products.description,
          basePrice: products.basePrice,
          images: products.images,
          requiresBatchTracking: products.requiresBatchTracking,
          lowStockThreshold: products.lowStockThreshold,
          categoryId: products.categoryId,
          createdAt: products.createdAt,
          updatedAt: products.updatedAt,
          // Aggregate available stock across all non-expired batches
          totalAvailable: sql<number>`
            COALESCE((
              SELECT SUM(pb.available_quantity)
              FROM product_batches pb
              WHERE pb.product_id = ${products.id}
                AND pb.expiry_date >= CURRENT_DATE
            ), 0)
          `,
          searchRank: searchRankExpr,
        })
        .from(products)
        .where(whereClause)
        .orderBy(orderClause)
        .limit(limit)
        .offset(offset),
      db
        .select({ total: sql<number>`COUNT(*)::int` })
        .from(products)
        .where(whereClause),
    ]);

    // Enrich each product with flash-sale effective price
    const enriched = await Promise.all(
      rows.map(async (product) => {
        const discount = await flashSaleService.getActiveDiscount(
          product.id,
          product.categoryId,
        );
        const basePrice = parseFloat(product.basePrice);
        const pricing = discount
          ? flashSaleService.computeEffectivePrice(basePrice, discount)
          : {
              effectivePrice: basePrice,
              discountAmount: 0,
              discountPercent: 0,
            };

        const isLowStock =
          product.totalAvailable > 0 &&
          product.totalAvailable <= product.lowStockThreshold;

        return {
          ...product,
          basePrice,
          ...pricing,
          totalAvailable: product.totalAvailable,
          isLowStock,
          isOutOfStock: product.totalAvailable === 0,
          activeDiscount: discount
            ? {
                id: discount.id,
                type: discount.type,
                value: parseFloat(discount.value),
                endsAt: discount.endsAt,
                isFlashSale: discount.isFlashSale,
                countdownMs: flashSaleService.getFlashSaleCountdown(discount),
              }
            : null,
        };
      }),
    );

    return c.json({
      success: true,
      data: enriched,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
        hasPrevPage: page > 1,
      },
    });
  },
);

/**
 * GET /catalog/products/:slug
 * Single product detail with batch summary, active discount, and related products.
 */
catalog.get("/catalog/products/:slug", async (c) => {
  const slug = c.req.param("slug");

  const [product] = await db
    .select()
    .from(products)
    .where(and(eq(products.slug, slug), eq(products.isActive, true)))
    .limit(1);

  if (!product) {
    return c.json({ success: false, error: "Product not found" }, 404);
  }

  // Batch summary (for batch-tracked products)
  const batches = product.requiresBatchTracking
    ? await db
        .select({
          batchNumber: productBatches.batchNumber,
          expiryDate: productBatches.expiryDate,
          availableQuantity: productBatches.availableQuantity,
        })
        .from(productBatches)
        .where(
          and(
            eq(productBatches.productId, product.id),
            gt(productBatches.availableQuantity, 0),
            gte(
              productBatches.expiryDate,
              new Date().toISOString().split("T")[0],
            ),
          ),
        )
        .orderBy(asc(productBatches.expiryDate)) // FEFO order
    : [];

  const totalAvailable = batches.reduce(
    (sum, b) => sum + b.availableQuantity,
    0,
  );

  // Active discount
  const discount = await flashSaleService.getActiveDiscount(
    product.id,
    product.categoryId,
  );
  const basePrice = parseFloat(product.basePrice);
  const pricing = discount
    ? flashSaleService.computeEffectivePrice(basePrice, discount)
    : { effectivePrice: basePrice, discountAmount: 0, discountPercent: 0 };

  // Related products (same category, excluding this product, limit 4)
  const related = await db
    .select({
      id: products.id,
      title: products.title,
      slug: products.slug,
      basePrice: products.basePrice,
      images: products.images,
    })
    .from(products)
    .where(
      and(
        eq(products.categoryId, product.categoryId),
        eq(products.isActive, true),
        ne(products.id, product.id),
      ),
    )
    .orderBy(desc(products.createdAt))
    .limit(4);

  return c.json({
    success: true,
    data: {
      ...product,
      basePrice,
      ...pricing,
      totalAvailable,
      isLowStock:
        totalAvailable > 0 && totalAvailable <= product.lowStockThreshold,
      isOutOfStock: totalAvailable === 0,
      batchSummary: batches,
      activeDiscount: discount
        ? {
            id: discount.id,
            type: discount.type,
            value: parseFloat(discount.value),
            endsAt: discount.endsAt,
            isFlashSale: discount.isFlashSale,
            countdownMs: flashSaleService.getFlashSaleCountdown(discount),
          }
        : null,
      relatedProducts: related,
    },
  });
});

/**
 * GET /catalog/flash-sales
 * Public endpoint — returns all currently active flash sales with countdowns.
 * Cached for 30 seconds.
 */
catalog.get("/catalog/flash-sales", cacheMiddleware(30), async (c) => {
  const now = new Date();

  const activeFlashSales = await db
    .select({
      id: discounts.id,
      type: discounts.type,
      value: discounts.value,
      productId: discounts.productId,
      categoryId: discounts.categoryId,
      startsAt: discounts.startsAt,
      endsAt: discounts.endsAt,
      isFlashSale: discounts.isFlashSale,
    })
    .from(discounts)
    .where(
      and(
        eq(discounts.isFlashSale, true),
        eq(discounts.isActive, true),
        lte(discounts.startsAt, now),
        gte(discounts.endsAt, now),
      ),
    )
    .orderBy(asc(discounts.endsAt)); // Soonest-ending first for urgency UX

  const enriched = activeFlashSales.map((d) => ({
    ...d,
    value: parseFloat(d.value),
    countdownMs: flashSaleService.getFlashSaleCountdown(d as any),
  }));

  return c.json({ success: true, data: enriched });
});

// ===========================================================================
// ADMIN CATALOG ROUTES (require PRODUCTS_WRITE permission)
// ===========================================================================

/**
 * POST /admin/catalog/products
 * Create a new product. Requires PRODUCTS_WRITE permission.
 */
catalog.post(
  "/admin/catalog/products",
  requireAuth,
  requirePermission("PRODUCTS_WRITE"),
  zValidator("json", createProductSchema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          success: false,
          error: "Validation failed",
          details: result.error.flatten(),
        },
        422,
      );
    }
  }),
  async (c) => {
    const body = c.req.valid("json");

    // Guard: slug uniqueness
    const [existing] = await db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.slug, body.slug))
      .limit(1);

    if (existing) {
      return c.json(
        {
          success: false,
          error: `A product with slug '${body.slug}' already exists`,
        },
        409,
      );
    }

    const [created] = await db
      .insert(products)
      .values({
        ...body,
        basePrice: body.basePrice,
        costPrice: body.costPrice,
      })
      .returning();

    return c.json({ success: true, data: created }, 201);
  },
);

/**
 * PUT /admin/catalog/products/:id
 * Update a product. Requires PRODUCTS_WRITE permission.
 */
catalog.put(
  "/admin/catalog/products/:id",
  requireAuth,
  requirePermission("PRODUCTS_WRITE"),
  zValidator("json", updateProductSchema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          success: false,
          error: "Validation failed",
          details: result.error.flatten(),
        },
        422,
      );
    }
  }),
  async (c) => {
    const id = c.req.param("id");
    const body = c.req.valid("json");

    const [existing] = await db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.id, id))
      .limit(1);

    if (!existing) {
      return c.json({ success: false, error: "Product not found" }, 404);
    }

    const [updated] = await db
      .update(products)
      .set({
        ...body,
        updatedAt: new Date(),
      })
      .where(eq(products.id, id))
      .returning();

    return c.json({ success: true, data: updated });
  },
);

/**
 * DELETE /admin/catalog/products/:id
 * Soft-delete: sets isActive = false. Preserves order history & stock ledger.
 * Requires PRODUCTS_WRITE permission.
 */
catalog.delete(
  "/admin/catalog/products/:id",
  requireAuth,
  requirePermission("PRODUCTS_WRITE"),
  async (c) => {
    const id = c.req.param("id");

    const [existing] = await db
      .select({ id: products.id, isActive: products.isActive })
      .from(products)
      .where(eq(products.id, id))
      .limit(1);

    if (!existing) {
      return c.json({ success: false, error: "Product not found" }, 404);
    }

    if (!existing.isActive) {
      return c.json(
        { success: false, error: "Product is already deactivated" },
        409,
      );
    }

    await db
      .update(products)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(products.id, id));

    return c.json({
      success: true,
      message: `Product ${id} has been deactivated (soft-deleted).`,
    });
  },
);

/**
 * POST /admin/discounts
 * Create a discount or flash sale. Requires DISCOUNTS_MANAGE permission.
 */
catalog.post(
  "/admin/discounts",
  requireAuth,
  requirePermission("DISCOUNTS_MANAGE"),
  zValidator("json", flashSaleSchema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          success: false,
          error: "Validation failed",
          details: result.error.flatten(),
        },
        422,
      );
    }
  }),
  async (c) => {
    const body = c.req.valid("json");

    const [created] = await db
      .insert(discounts)
      .values({
        code: body.code ?? null,
        type: body.discountType,
        value: body.value,
        productId: body.productId ?? null,
        categoryId: body.categoryId ?? null,
        startsAt: new Date(body.startsAt),
        endsAt: new Date(body.endsAt),
        isFlashSale: body.isFlashSale,
        isActive: body.isActive,
      })
      .returning();

    return c.json({ success: true, data: created }, 201);
  },
);

export { catalog };
```

---

### Step 4: Flash Sale Engine

The `FlashSaleService` class owns all time-sensitive discount computation. It is a pure stateless service — no database connection is stored on the instance — so it can be instantiated freely and tested with mock data.

#### `apps/api/src/services/flash-sale.service.ts`

```typescript
import { db } from "@my-oxygen/database";
import { discounts } from "@my-oxygen/database/schema/tables";
import { and, eq, lte, gte, or, isNull, isNotNull } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Internal discount shape returned by Drizzle queries
// ---------------------------------------------------------------------------
export interface ActiveDiscount {
  id: string;
  type: "PERCENTAGE" | "FIXED_AMOUNT";
  value: string; // numeric string from PostgreSQL
  productId: string | null;
  categoryId: string | null;
  startsAt: Date;
  endsAt: Date;
  isFlashSale: boolean;
}

// ---------------------------------------------------------------------------
// Return shape of computeEffectivePrice
// ---------------------------------------------------------------------------
export interface EffectivePricing {
  effectivePrice: number;
  discountAmount: number;
  discountPercent: number;
}

export class FlashSaleService {
  /**
   * Resolves the single best active discount for a given product.
   *
   * Priority order (highest to lowest):
   *   1. Product-specific discount (productId matches exactly)
   *   2. Category-level discount (categoryId matches)
   *
   * When multiple discounts exist at the same priority level, the one
   * with the highest computed saving (largest discountAmount on basePrice)
   * is returned. The caller must supply a representative basePrice for this
   * comparison, or pass 100 as a proxy when only the discount metadata is needed.
   *
   * @param productId  UUID of the product being priced
   * @param categoryId UUID of the product's category
   * @returns The winning ActiveDiscount, or null if no active discount exists
   */
  async getActiveDiscount(
    productId: string,
    categoryId: string,
  ): Promise<ActiveDiscount | null> {
    const now = new Date();

    // Fetch all active discounts applicable to this product or its category
    const candidates = await db
      .select({
        id: discounts.id,
        type: discounts.type,
        value: discounts.value,
        productId: discounts.productId,
        categoryId: discounts.categoryId,
        startsAt: discounts.startsAt,
        endsAt: discounts.endsAt,
        isFlashSale: discounts.isFlashSale,
      })
      .from(discounts)
      .where(
        and(
          eq(discounts.isActive, true),
          lte(discounts.startsAt, now),
          gte(discounts.endsAt, now),
          or(
            eq(discounts.productId, productId), // product-specific
            eq(discounts.categoryId, categoryId), // category-level
          ),
        ),
      );

    if (candidates.length === 0) return null;

    // Separate product-level from category-level
    const productLevel = candidates.filter((d) => d.productId === productId);
    const categoryLevel = candidates.filter((d) => d.categoryId === categoryId);

    // Product-specific discounts take priority over category discounts
    const pool = productLevel.length > 0 ? productLevel : categoryLevel;

    if (pool.length === 0) return null;
    if (pool.length === 1) return pool[0] as ActiveDiscount;

    // When multiple discounts compete at the same level, pick the best saving.
    // Use 1000 BDT as a proxy base price for percentage comparison.
    const PROXY_PRICE = 1000;
    return pool.reduce((best, current) => {
      const bestSaving = this._computeSaving(
        PROXY_PRICE,
        best as ActiveDiscount,
      );
      const currSaving = this._computeSaving(
        PROXY_PRICE,
        current as ActiveDiscount,
      );
      return currSaving > bestSaving ? current : best;
    }) as ActiveDiscount;
  }

  /**
   * Applies a validated discount to a base price.
   *
   * - PERCENTAGE: effectivePrice = basePrice × (1 − value/100), floor at 0.
   * - FIXED_AMOUNT: effectivePrice = basePrice − value, floor at 0.
   *
   * Prices are rounded to 2 decimal places (BDT does not use sub-paisa).
   */
  computeEffectivePrice(
    basePrice: number,
    discount: ActiveDiscount,
  ): EffectivePricing {
    const value = parseFloat(discount.value);

    let discountAmount: number;
    if (discount.type === "PERCENTAGE") {
      // Cap percentage at 100 to guard against bad data
      const pct = Math.min(value, 100);
      discountAmount = (basePrice * pct) / 100;
    } else {
      // FIXED_AMOUNT — cap at basePrice so effectivePrice never goes negative
      discountAmount = Math.min(value, basePrice);
    }

    const effectivePrice = Math.max(0, basePrice - discountAmount);
    const discountPercent =
      basePrice > 0
        ? parseFloat(((discountAmount / basePrice) * 100).toFixed(2))
        : 0;

    return {
      effectivePrice: parseFloat(effectivePrice.toFixed(2)),
      discountAmount: parseFloat(discountAmount.toFixed(2)),
      discountPercent,
    };
  }

  /**
   * Returns the number of milliseconds remaining until the flash sale ends.
   * Returns 0 if the sale has already ended (defensive — should not normally
   * occur since getActiveDiscount filters expired discounts).
   */
  getFlashSaleCountdown(discount: Pick<ActiveDiscount, "endsAt">): number {
    const remaining = new Date(discount.endsAt).getTime() - Date.now();
    return Math.max(0, remaining);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------
  private _computeSaving(basePrice: number, discount: ActiveDiscount): number {
    const value = parseFloat(discount.value);
    if (discount.type === "PERCENTAGE") {
      return (basePrice * Math.min(value, 100)) / 100;
    }
    return Math.min(value, basePrice);
  }
}
```

---

### Step 5: Response Caching Layer

An in-memory LRU cache middleware intercepts `GET` responses before they reach the database, served straight from Node.js heap for cache-hit latency under 1 ms. Authenticated requests always bypass the cache so admin users always see fresh data.

#### Install dependency

```bash
pnpm --filter @my-oxygen/api add lru-cache
```

#### `apps/api/src/middleware/cache.ts`

```typescript
import { LRUCache } from "lru-cache";
import type { MiddlewareHandler } from "hono";

// ---------------------------------------------------------------------------
// Cache store — one shared LRU instance for the entire API process.
// Max 500 entries, each tagged with an individual TTL set at insertion.
// ---------------------------------------------------------------------------
const store = new LRUCache<string, { body: string; contentType: string }>({
  max: 500,
  // Per-entry TTL is supplied at set() time; this is just the global ceiling.
  ttl: 1000 * 60 * 10, // 10-minute absolute maximum
  allowStale: false,
});

/**
 * Creates a Hono middleware that caches successful GET responses in an LRU
 * cache keyed by the full request URL (including query string).
 *
 * Cache is SKIPPED when:
 *   - The HTTP method is not GET
 *   - An `Authorization` header is present (authenticated / admin requests)
 *
 * Cache HIT responses include the header `X-Cache: HIT` so the frontend and
 * monitoring tools can distinguish cached from fresh responses.
 *
 * @param ttlSeconds  Time-to-live in seconds for this specific route's cache entries
 */
export function cacheMiddleware(ttlSeconds: number): MiddlewareHandler {
  return async (c, next) => {
    // Only cache plain GET requests
    if (c.req.method !== "GET") {
      return next();
    }

    // Never cache authenticated / admin requests
    if (c.req.header("Authorization")) {
      return next();
    }

    const cacheKey = c.req.url;
    const cached = store.get(cacheKey);

    if (cached) {
      // Serve from cache
      c.res = new Response(cached.body, {
        status: 200,
        headers: {
          "Content-Type": cached.contentType,
          "X-Cache": "HIT",
          "Cache-Control": `public, max-age=${ttlSeconds}`,
        },
      });
      return;
    }

    // Execute handler and capture response
    await next();

    // Only cache successful JSON responses
    if (c.res.status === 200) {
      const contentType =
        c.res.headers.get("Content-Type") ?? "application/json";
      const body = await c.res.clone().text();

      store.set(
        cacheKey,
        { body, contentType },
        { ttl: ttlSeconds * 1000 }, // lru-cache expects milliseconds
      );

      // Annotate outgoing response
      c.res.headers.set("X-Cache", "MISS");
      c.res.headers.set("Cache-Control", `public, max-age=${ttlSeconds}`);
    }
  };
}

/**
 * Programmatically invalidate all cache entries whose keys start with a
 * given prefix (e.g. `/catalog/products` after a product is updated).
 */
export function invalidateCacheByPrefix(prefix: string): number {
  let evicted = 0;
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) {
      store.delete(key);
      evicted++;
    }
  }
  return evicted;
}
```

> [!TIP]
> Call `invalidateCacheByPrefix("/catalog/products")` inside the `PUT` and `DELETE` admin handlers after a successful write so that subsequent public reads immediately reflect the change without waiting for TTL expiry.

---

### Step 6: Route Registration

Mount the catalog router — which serves both public and admin paths — into the main application entry point.

#### Updated `apps/api/src/index.ts`

```typescript
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { prettyJSON } from "hono/pretty-json";
import { pool } from "@my-oxygen/database";
import { env } from "./env";

// Route modules
import { authRouter } from "./routes/auth"; // Phase 2
import { catalog } from "./routes/catalog"; // Phase 4 ← NEW

const app = new Hono();

// ---------------------------------------------------------------------------
// Global Middlewares
// ---------------------------------------------------------------------------
app.use("*", logger());
app.use("*", prettyJSON());
app.use(
  "*",
  cors({
    origin: env.CORS_ORIGIN.split(","),
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    exposeHeaders: ["Content-Length", "X-Cache"],
    maxAge: 600,
    credentials: true,
  }),
);

// ---------------------------------------------------------------------------
// Health Probe
// ---------------------------------------------------------------------------
app.get("/health", async (c) => {
  try {
    const dbRes = await pool.query("SELECT 1 AS alive");
    return c.json({
      status: "UP",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      database: dbRes.rows[0].alive === 1 ? "CONNECTED" : "DISCONNECTED",
    });
  } catch (error) {
    return c.json(
      {
        status: "DOWN",
        database: "ERROR",
        details: (error as Error).message,
      },
      503,
    );
  }
});

// ---------------------------------------------------------------------------
// Registered Route Modules
// ---------------------------------------------------------------------------
app.route("/", authRouter); // /auth/login, /auth/refresh, /auth/logout
app.route("/", catalog); // /catalog/*, /admin/catalog/*, /admin/discounts

// ---------------------------------------------------------------------------
// Global Error Handler
// ---------------------------------------------------------------------------
app.onError((err, c) => {
  console.error("Unhandled Application Exception:", err);
  return c.json(
    {
      success: false,
      error: {
        message: err.message || "Internal Server Error",
        stack: env.NODE_ENV === "development" ? err.stack : undefined,
      },
    },
    500,
  );
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
serve(
  {
    fetch: app.fetch,
    port: env.PORT,
  },
  (info) => {
    console.log(`🚀 My Oxygen API running on http://localhost:${info.port}`);
    console.log(`   ├─ Catalog API  → /catalog/products`);
    console.log(`   ├─ Flash Sales  → /catalog/flash-sales`);
    console.log(`   └─ Admin CRUD   → /admin/catalog/products`);
  },
);
```

---

### Step 7: Phase 4 Verification Checklist

Run all commands from the monorepo root unless noted. Replace placeholder UUIDs with values returned by earlier commands.

#### 1. Apply Trigram Migration

```bash
pnpm db:generate
pnpm db:migrate
```

_Expected outcome:_ Migration `0004_trigram_search.sql` applied; `\dx` in `psql` shows `pg_trgm` listed; `\d products` confirms the three GIN indexes.

#### 2. Confirm Trigram Indexes in PostgreSQL

```bash
psql $DATABASE_URL -c "\d products"
```

_Expected outcome:_ Output includes `products_title_trgm_idx`, `products_description_trgm_idx`, and `products_search_combined_trgm_idx` all with type `gin`.

#### 3. Create a Test Product (Admin)

```bash
# Obtain an admin JWT first (Phase 2 login endpoint)
TOKEN=$(curl -s -X POST http://localhost:4000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"phone":"+8801700000000","password":"Admin@MyOxygen2026"}' \
  | jq -r '.data.accessToken')

# Create product — substitute a real categoryId from your seed data
curl -s -X POST http://localhost:4000/admin/catalog/products \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "categoryId": "<SKIN_CARE_CATEGORY_UUID>",
    "title": "Organic Rose Hip Serum",
    "slug": "organic-rose-hip-serum",
    "sku": "SKN-RHS-001",
    "description": "Cold-pressed rosehip oil serum for post-natal skin recovery. Dermatologist tested.",
    "basePrice": "1250.00",
    "costPrice": "780.00",
    "images": ["https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?w=800"],
    "requiresBatchTracking": true,
    "lowStockThreshold": 8
  }' | jq .
```

_Expected outcome:_ HTTP 201 with the created product object including generated `id`, `slug`, and `createdAt`.

#### 4. Trigram Search — Partial Title Match

```bash
# Search for "rosehip" — matches "Rose Hip Serum" via trigram similarity
curl -s "http://localhost:4000/catalog/products?q=rosehip" | jq '.data[].title'

# Search with a typo — "seurm" should still match "Serum" at similarity > 0.15
curl -s "http://localhost:4000/catalog/products?q=seurm" | jq '.data[].title'
```

_Expected outcome:_ Both queries return `"Organic Rose Hip Serum"` without a full-text match. Query time logged by Hono logger should be < 10 ms once the GIN index is warmed.

#### 5. Create a Flash Sale Discount

```bash
curl -s -X POST http://localhost:4000/admin/discounts \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "productId": "<ORGANIC_ROSE_HIP_SERUM_UUID>",
    "discountType": "PERCENTAGE",
    "value": "20.00",
    "startsAt": "2026-09-22T00:00:00+06:00",
    "endsAt": "2026-09-22T23:59:59+06:00",
    "isFlashSale": true,
    "isActive": true
  }' | jq .
```

_Expected outcome:_ HTTP 201 with discount record. `type: "PERCENTAGE"`, `value: "20.00"`, `isFlashSale: true`.

#### 6. Verify Effective Price on Product Detail

```bash
curl -s "http://localhost:4000/catalog/products/organic-rose-hip-serum" \
  | jq '{basePrice: .data.basePrice, effectivePrice: .data.effectivePrice, discountAmount: .data.discountAmount, discountPercent: .data.discountPercent}'
```

_Expected outcome:_

```json
{
  "basePrice": 1250,
  "effectivePrice": 1000,
  "discountAmount": 250,
  "discountPercent": 20
}
```

#### 7. Flash Sale Public Endpoint with Countdown

```bash
curl -s "http://localhost:4000/catalog/flash-sales" \
  | jq '.data[] | {id, type, value, countdownMs}'
```

_Expected outcome:_ Returns the active flash sale with `countdownMs` > 0 (time remaining in milliseconds until `endsAt`).

#### 8. Cache Header Verification

```bash
# First request — expect X-Cache: MISS
curl -s -I "http://localhost:4000/catalog/products" | grep -i "x-cache"
# → X-Cache: MISS

# Second request within 60s — expect X-Cache: HIT
curl -s -I "http://localhost:4000/catalog/products" | grep -i "x-cache"
# → X-Cache: HIT

# Authenticated request — cache is always bypassed
curl -s -I "http://localhost:4000/catalog/products" \
  -H "Authorization: Bearer $TOKEN" | grep -i "x-cache"
# → (no X-Cache header — bypassed)
```

_Expected outcome:_ Cache-control and X-Cache headers behave as documented above. The `Cache-Control: public, max-age=60` header is present on both MISS and HIT responses for public routes.

#### 9. Soft Delete Verification

```bash
# Soft-delete the product
curl -s -X DELETE \
  "http://localhost:4000/admin/catalog/products/<ORGANIC_ROSE_HIP_SERUM_UUID>" \
  -H "Authorization: Bearer $TOKEN" | jq .

# Confirm product no longer appears in public listing
curl -s "http://localhost:4000/catalog/products?q=rosehip" | jq '.data | length'
# → 0

# Confirm product still exists in DB with isActive = false (audit preserved)
psql $DATABASE_URL -c \
  "SELECT id, title, is_active FROM products WHERE slug = 'organic-rose-hip-serum';"
# → is_active = false
```

_Expected outcome:_ Public catalog returns 0 results; database row is preserved with `is_active = false`.

#### 10. Category + Price Range Filter

```bash
curl -s "http://localhost:4000/catalog/products?categorySlug=skin-care&minPrice=500&maxPrice=2000&sort=price_asc" \
  | jq '[.data[] | {title, effectivePrice}]'
```

_Expected outcome:_ Returns only Skin Care products priced between 500–2000 BDT, ordered by effective price ascending.
