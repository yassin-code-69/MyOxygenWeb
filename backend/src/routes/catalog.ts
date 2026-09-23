import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { db } from "../db";
import {
  products,
  categories,
  productBatches,
  discounts,
  orderItems,
} from "../db/schema/tables";
import {
  eq,
  and,
  desc,
  asc,
  sql,
  ilike,
  or,
  ne,
  gte,
} from "drizzle-orm";
import { requireAuth, type AuthContext } from "../middleware/auth";
import { requirePermission, Permissions } from "../lib/rbac";
import { cacheMiddleware, invalidateCacheByPrefix } from "../middleware/cache";
import { FlashSaleService } from "../services/flash-sale.service";
import {
  createProductSchema,
  updateProductSchema,
  catalogQuerySchema,
  flashSaleSchema,
} from "./catalog.schema";

const catalog = new Hono<AuthContext>();
const flashSaleService = new FlashSaleService();

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ===========================================================================
// PUBLIC CATALOG ROUTES
// ===========================================================================

/**
 * GET /catalog/categories
 * Listing of active categories for navigation and admin dropdowns.
 */
catalog.get("/catalog/categories", cacheMiddleware(300), async (c) => {
  const allCategories = await db
    .select({
      id: categories.id,
      name: categories.name,
      slug: categories.slug,
      iconUrl: categories.iconUrl,
      isActive: categories.isActive,
    })
    .from(categories)
    .where(eq(categories.isActive, true))
    .orderBy(asc(categories.name));

  return c.json({ success: true, data: allCategories });
});

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
      includeInactive,
      sort,
      page,
      limit,
    } = query;

    const offset = (page - 1) * limit;

    // Base condition: only active products unless includeInactive is explicitly true
    const conditions: ReturnType<typeof and>[] = [];
    if (!includeInactive) {
      conditions.push(eq(products.isActive, true));
    }

    // Category filter
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
      conditions.push(eq(products.categoryId, cat.id));
    }

    // Price range filters
    if (minPrice !== undefined) {
      conditions.push(sql`${products.basePrice}::numeric >= ${minPrice}`);
    }
    if (maxPrice !== undefined) {
      conditions.push(sql`${products.basePrice}::numeric <= ${maxPrice}`);
    }

    // In-stock filter
    if (inStockOnly) {
      conditions.push(
        sql`(
          SELECT COALESCE(SUM(pb.available_quantity), 0)
          FROM product_batches pb
          WHERE pb.product_id = ${products.id}
            AND pb.expiry_date >= CURRENT_DATE
        ) > 0`,
      );
    }

    // Trigram search via pg_trgm similarity()
    let searchRankExpr = sql<number>`1`;
    if (q) {
      if (q.length >= 3) {
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
        conditions.push(
          or(
            ilike(products.title, `%${q}%`),
            ilike(products.description, `%${q}%`),
          )!,
        );
      }
    }

    // Sort order
    const orderClause = (() => {
      if (q && q.length >= 3) return desc(searchRankExpr);
      switch (sort) {
        case "price_asc":
          return asc(sql`${products.basePrice}::numeric`);
        case "price_desc":
          return desc(sql`${products.basePrice}::numeric`);
        case "newest":
        case "popular":
        default:
          return desc(products.createdAt);
      }
    })();

    const whereClause = and(...conditions);

    // Query products and total count in parallel
    const [rows, countResult] = await Promise.all([
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
          isActive: products.isActive,
          createdAt: products.createdAt,
          updatedAt: products.updatedAt,
          totalAvailable: sql<number>`
            COALESCE((
              SELECT SUM(pb.available_quantity)
              FROM product_batches pb
              WHERE pb.product_id = ${products.id}
                AND pb.expiry_date >= CURRENT_DATE
            ), 0)::int
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

    const total = countResult[0]?.total ?? 0;

    // Fetch active discounts once to compute effectivePrice
    const activeDiscounts = await flashSaleService.getActiveDiscounts();

    const data = rows.map((product) => {
      const { effectivePrice, discount } =
        flashSaleService.calculateEffectivePrice(product, activeDiscounts);
      const isLowStock =
        product.totalAvailable > 0 &&
        product.totalAvailable <= product.lowStockThreshold;

      return {
        ...product,
        effectivePrice,
        discount,
        isLowStock,
        isOutOfStock: product.totalAvailable === 0,
      };
    });

    return c.json({
      success: true,
      data,
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
 * GET /catalog/products/:idOrSlug
 * Single product detail with batch expiry info (earliest expiry for customer transparency).
 */
catalog.get("/catalog/products/:idOrSlug", async (c) => {
  const idOrSlug = c.req.param("idOrSlug");

  const isUuid = UUID_REGEX.test(idOrSlug);
  const condition = isUuid
    ? or(eq(products.id, idOrSlug), eq(products.slug, idOrSlug))
    : eq(products.slug, idOrSlug);

  const [product] = await db
    .select()
    .from(products)
    .where(and(condition, eq(products.isActive, true)))
    .limit(1);

  if (!product) {
    return c.json({ success: false, error: "Product not found" }, 404);
  }

  // Fetch batches with expiry information
  const batches = await db
    .select({
      batchNumber: productBatches.batchNumber,
      expiryDate: productBatches.expiryDate,
      availableQuantity: productBatches.availableQuantity,
    })
    .from(productBatches)
    .where(
      and(
        eq(productBatches.productId, product.id),
        sql`${productBatches.availableQuantity} > 0`,
        gte(
          productBatches.expiryDate,
          new Date().toISOString().split("T")[0],
        ),
      ),
    )
    .orderBy(asc(productBatches.expiryDate));

  const totalAvailable = batches.reduce(
    (sum, b) => sum + (b.availableQuantity || 0),
    0,
  );

  const earliestExpiry = batches.length > 0 ? batches[0].expiryDate : null;

  // Active discount & effective price
  const activeDiscounts = await flashSaleService.getActiveDiscounts();
  const { effectivePrice, discount } =
    flashSaleService.calculateEffectivePrice(product, activeDiscounts);

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

  const { costPrice: _costPrice, ...publicProduct } = product;

  return c.json({
    success: true,
    data: {
      ...publicProduct,
      effectivePrice,
      activeDiscount: discount
        ? {
            ...discount,
            countdownMs: flashSaleService.getFlashSaleCountdown(discount),
          }
        : null,
      earliestExpiry,
      batchSummary: batches,
      totalAvailable,
      isLowStock:
        totalAvailable > 0 && totalAvailable <= product.lowStockThreshold,
      isOutOfStock: totalAvailable === 0,
      relatedProducts: related,
    },
  });
});

/**
 * GET /catalog/flash-sales
 * Public endpoint — returns all currently active flash sales with countdowns.
 */
catalog.get("/catalog/flash-sales", cacheMiddleware(30), async (c) => {
  const now = new Date();

  const activeFlashSales = await db
    .select({
      id: discounts.id,
      code: discounts.code,
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
        sql`${discounts.startsAt} <= ${now}`,
        sql`${discounts.endsAt} >= ${now}`,
      ),
    )
    .orderBy(asc(discounts.endsAt));

  const enriched = activeFlashSales.map((d) => ({
    ...d,
    countdownMs: flashSaleService.getFlashSaleCountdown(d),
  }));

  return c.json({ success: true, data: enriched });
});

// ===========================================================================
// ADMIN CATALOG ROUTES (require PRODUCTS_WRITE or DISCOUNTS_MANAGE)
// ===========================================================================

/**
 * POST /admin/catalog/products
 * Create a new product. Requires PRODUCTS_WRITE permission.
 */
catalog.post(
  "/admin/catalog/products",
  requireAuth,
  requirePermission(Permissions.PRODUCTS_WRITE),
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

    // Guard: check slug uniqueness
    const [existingSlug] = await db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.slug, body.slug))
      .limit(1);

    if (existingSlug) {
      return c.json(
        {
          success: false,
          error: `A product with slug '${body.slug}' already exists`,
        },
        409,
      );
    }

    // Guard: check SKU uniqueness
    const [existingSku] = await db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.sku, body.sku))
      .limit(1);

    if (existingSku) {
      return c.json(
        {
          success: false,
          error: `A product with SKU '${body.sku}' already exists`,
        },
        409,
      );
    }

    // Resolve category by ID (if UUID) or by slug
    const isCatUuid = UUID_REGEX.test(body.categoryId);
    const [matchedCategory] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(
        isCatUuid
          ? eq(categories.id, body.categoryId)
          : eq(categories.slug, body.categoryId),
      )
      .limit(1);

    if (!matchedCategory) {
      return c.json(
        {
          success: false,
          error: `Category '${body.categoryId}' does not exist`,
        },
        400,
      );
    }

    const [created] = await db
      .insert(products)
      .values({
        ...body,
        categoryId: matchedCategory.id,
      })
      .returning();

    // Invalidate public catalog cache
    invalidateCacheByPrefix("/catalog");

    return c.json({ success: true, data: created }, 201);
  },
);

/**
 * PATCH /admin/catalog/products/:id
 * Update a product. Requires PRODUCTS_WRITE permission.
 */
catalog.patch(
  "/admin/catalog/products/:id",
  requireAuth,
  requirePermission(Permissions.PRODUCTS_WRITE),
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

    // Check slug uniqueness if slug is being updated
    if (body.slug) {
      const [duplicateSlug] = await db
        .select({ id: products.id })
        .from(products)
        .where(and(eq(products.slug, body.slug), ne(products.id, id)))
        .limit(1);

      if (duplicateSlug) {
        return c.json(
          {
            success: false,
            error: `A product with slug '${body.slug}' already exists`,
          },
          409,
        );
      }
    }

    let resolvedCategoryId = body.categoryId;
    if (body.categoryId) {
      const isCatUuid = UUID_REGEX.test(body.categoryId);
      const [matchedCat] = await db
        .select({ id: categories.id })
        .from(categories)
        .where(
          isCatUuid
            ? eq(categories.id, body.categoryId)
            : eq(categories.slug, body.categoryId),
        )
        .limit(1);

      if (!matchedCat) {
        return c.json(
          {
            success: false,
            error: `Category '${body.categoryId}' does not exist`,
          },
          400,
        );
      }
      resolvedCategoryId = matchedCat.id;
    }

    const updateValues: Record<string, any> = {
      ...body,
      updatedAt: new Date(),
    };
    if (resolvedCategoryId) {
      updateValues.categoryId = resolvedCategoryId;
    }

    const [updated] = await db
      .update(products)
      .set(updateValues)
      .where(eq(products.id, id))
      .returning();

    // Invalidate public catalog cache
    invalidateCacheByPrefix("/catalog");

    return c.json({ success: true, data: updated });
  },
);

/**
 * PUT /admin/catalog/products/:id (alias for PATCH)
 */
catalog.put(
  "/admin/catalog/products/:id",
  requireAuth,
  requirePermission(Permissions.PRODUCTS_WRITE),
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

    let resolvedCategoryId = body.categoryId;
    if (body.categoryId) {
      const isCatUuid = UUID_REGEX.test(body.categoryId);
      const [matchedCat] = await db
        .select({ id: categories.id })
        .from(categories)
        .where(
          isCatUuid
            ? eq(categories.id, body.categoryId)
            : eq(categories.slug, body.categoryId),
        )
        .limit(1);

      if (!matchedCat) {
        return c.json(
          {
            success: false,
            error: `Category '${body.categoryId}' does not exist`,
          },
          400,
        );
      }
      resolvedCategoryId = matchedCat.id;
    }

    const updateValues: Record<string, any> = {
      ...body,
      updatedAt: new Date(),
    };
    if (resolvedCategoryId) {
      updateValues.categoryId = resolvedCategoryId;
    }

    const [updated] = await db
      .update(products)
      .set(updateValues)
      .where(eq(products.id, id))
      .returning();

    invalidateCacheByPrefix("/catalog");

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
  requirePermission(Permissions.PRODUCTS_WRITE),
  async (c) => {
    const id = c.req.param("id");

    const [existing] = await db
      .select({ id: products.id, title: products.title, isActive: products.isActive })
      .from(products)
      .where(eq(products.id, id))
      .limit(1);

    if (!existing) {
      return c.json({ success: false, error: "Product not found" }, 404);
    }

    // Perform soft-delete (isActive = false) to protect audit ledger and order history
    await db
      .update(products)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(products.id, id));

    invalidateCacheByPrefix("/catalog");

    return c.json({
      success: true,
      data: { id, isActive: false },
      message: `Product '${existing.title}' has been deactivated (soft-deleted).`,
    });
  },
);

/**
 * POST /admin/catalog/flash-sales & POST /admin/discounts
 * Create a discount or flash sale. Requires DISCOUNTS_MANAGE permission.
 */
const handleCreateFlashSale = async (c: any) => {
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
      isFlashSale: body.isFlashSale ?? true,
      isActive: body.isActive ?? true,
    })
    .returning();

  invalidateCacheByPrefix("/catalog");

  return c.json({ success: true, data: created }, 201);
};

catalog.post(
  "/admin/catalog/flash-sales",
  requireAuth,
  requirePermission(Permissions.DISCOUNTS_MANAGE),
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
  handleCreateFlashSale,
);

catalog.post(
  "/admin/discounts",
  requireAuth,
  requirePermission(Permissions.DISCOUNTS_MANAGE),
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
  handleCreateFlashSale,
);

export { catalog };
