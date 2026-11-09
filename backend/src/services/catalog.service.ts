/**
 * Catalog read model: priced product listings with filters, facets and
 * trigram search, product detail, categories and public flash sales.
 *
 * Prices are computed in SQL so that filtering and sorting use the EFFECTIVE
 * price. The SQL below is the twin of `FlashSaleService.calculateEffectivePrice`
 * (scope priority product > category > store-wide, largest amount, earliest
 * end, lowest id; half-up rounding to cents) — keep them identical so the
 * storefront price always equals the checkout price.
 */
import { and, asc, count, desc, eq, gt, inArray, isNotNull, ne, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db as defaultDb } from "../db/client";
import { categories, discounts, productBatches, products } from "../db/schema/tables";
import { daysUntil, todayInBusinessTz } from "../lib/dates";
import { AppError } from "../lib/errors";
import type { DiscountType } from "../types";
import { type DbExecutor, queryAll, runInTransaction } from "./db-executor";
import { discountPercentOf, toCents } from "./flash-sale.service";
import {
  earliestExpirySql,
  listingStatusOf,
  outerProductColumn,
  sellableStockSql,
  type ListingStatus,
} from "./inventory.service";
import { containsPattern, toIso, toNullableIso, toNumber } from "./service-utils";

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------

export interface CategoryRefDTO {
  id: string;
  slug: string;
  name: string;
}

export interface ActiveDiscountDTO {
  id: string;
  name: string | null;
  type: DiscountType;
  value: number;
  isFlashSale: boolean;
  endsAt: string;
  countdownMs: number;
}

/** Public product card / list item. Money values are numbers (BDT, 2 decimals). */
export interface CatalogProductDTO {
  id: string;
  slug: string;
  title: string;
  sku: string;
  brand: string | null;
  description: string;
  images: string[];
  category: CategoryRefDTO;
  basePrice: number;
  effectivePrice: number;
  discountAmount: number;
  discountPercent: number;
  activeDiscount: ActiveDiscountDTO | null;
  totalStock: number;
  isLowStock: boolean;
  isOutOfStock: boolean;
  requiresBatchTracking: boolean;
  /** Earliest sellable expiry (YYYY-MM-DD) — batch-tracked products only, else null. */
  earliestExpiry: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface BatchSummaryDTO {
  batchNumber: string;
  expiryDate: string;
  availableQuantity: number;
  daysUntilExpiry: number;
}

export interface CatalogProductDetailDTO extends CatalogProductDTO {
  /** Sellable batches in FEFO order (batch-tracked products only, else []). */
  batchSummary: BatchSummaryDTO[];
  relatedProducts: CatalogProductDTO[];
}

/** Admin view: public fields plus cost, threshold and visibility state. */
export interface AdminProductDTO extends CatalogProductDTO {
  costPrice: number;
  lowStockThreshold: number;
  autoDeactivatedAt: string | null;
  listingStatus: ListingStatus;
  updatedAt: string;
}

export interface CategoryDTO {
  id: string;
  name: string;
  slug: string;
  iconUrl: string | null;
  parentId: string | null;
  sortOrder: number;
  /** Active (publicly visible) products in the category. */
  productCount: number;
}

export interface CatalogFacets {
  brands: Array<{ value: string; count: number }>;
  categories: Array<CategoryRefDTO & { count: number }>;
  /** Effective-price range of the matching products, null when nothing matches. */
  priceRange: { min: number; max: number } | null;
}

export interface FlashSaleDTO {
  id: string;
  name: string | null;
  type: DiscountType;
  value: number;
  scope: "PRODUCT" | "CATEGORY" | "STORE";
  productId: string | null;
  categoryId: string | null;
  product: CatalogProductDTO | null;
  category: CategoryRefDTO | null;
  startsAt: string;
  endsAt: string;
  countdownMs: number;
}

// ---------------------------------------------------------------------------
// Query inputs
// ---------------------------------------------------------------------------

export const CATALOG_SORTS = ["relevance", "price_asc", "price_desc", "newest", "popular"] as const;
export type CatalogSort = (typeof CATALOG_SORTS)[number];

export interface CatalogListQuery {
  page: number;
  limit: number;
  q?: string;
  /** Category slug (includes its direct sub-categories). */
  category?: string;
  brands?: string[];
  minPrice?: number;
  maxPrice?: number;
  inStockOnly?: boolean;
  /** Only honoured for authenticated callers with PRODUCTS_READ (enforced by the route). */
  includeInactive?: boolean;
  /** Defaults to `relevance` when `q` is set, otherwise `newest`. */
  sort?: CatalogSort;
}

export const ADMIN_PRODUCT_STATUSES = ["all", "active", "inactive", "awaiting_stock"] as const;
export type AdminProductStatusFilter = (typeof ADMIN_PRODUCT_STATUSES)[number];
export const ADMIN_STOCK_FILTERS = ["all", "in_stock", "low", "out"] as const;
export type AdminStockFilter = (typeof ADMIN_STOCK_FILTERS)[number];
export const ADMIN_PRODUCT_SORTS = [
  "newest",
  "oldest",
  "title_asc",
  "title_desc",
  "price_asc",
  "price_desc",
  "stock_asc",
  "stock_desc",
] as const;
export type AdminProductSort = (typeof ADMIN_PRODUCT_SORTS)[number];

export interface AdminProductListQuery {
  page: number;
  limit: number;
  q?: string;
  /** Category slug or id. */
  category?: string;
  brands?: string[];
  status: AdminProductStatusFilter;
  stock: AdminStockFilter;
  sort: AdminProductSort;
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

/**
 * Word-similarity threshold for the trigram `%>` operator (pg_trgm default
 * 0.6). 0.45 tolerates one dropped/added letter in typical product words
 * ("dipers" → Diapers, "lotin" → Lotion) without matching unrelated words.
 * Transposed letters in short words ("seurm") score ~0.33 and do not match.
 */
export const SEARCH_WORD_SIMILARITY_THRESHOLD = 0.45;
/** Shorter terms only use the (index-backed) substring match. */
export const SEARCH_MIN_TRIGRAM_LENGTH = 3;

interface SearchSpec {
  term: string;
  pattern: string;
  trigram: boolean;
}

function searchSpec(q: string | undefined): SearchSpec | null {
  const term = q?.trim();
  if (!term) return null;
  return { term, pattern: containsPattern(term), trigram: term.length >= SEARCH_MIN_TRIGRAM_LENGTH };
}

/** Same expression as the GIN index `products_search_text_trgm_idx`. */
const searchText = sql`(${products.title} || ' ' || coalesce(${products.description}, ''))`;

function searchCondition(search: SearchSpec): SQL {
  return search.trigram
    ? sql`(${searchText} ILIKE ${search.pattern} OR ${searchText} OPERATOR(extensions.%>) ${search.term})`
    : sql`${searchText} ILIKE ${search.pattern}`;
}

function searchRank(search: SearchSpec): SQL<number> {
  return sql<number>`(
    extensions.word_similarity(${search.term}, ${products.title}) * 2
    + extensions.word_similarity(${search.term}, ${searchText})
    + CASE WHEN ${products.title} ILIKE ${search.pattern} THEN 1 ELSE 0 END
  )`;
}

/**
 * Runs `work` with the trigram threshold applied (SET LOCAL inside a
 * transaction, compatible with transaction pooling) when the search uses it.
 */
function withSearchSettings<T>(db: DbExecutor, search: SearchSpec | null, work: (exec: DbExecutor) => Promise<T>): Promise<T> {
  if (!search?.trigram) return work(db);
  return runInTransaction(db, async (tx) => {
    await tx.execute(
      sql`SELECT set_config('pg_trgm.word_similarity_threshold', ${String(SEARCH_WORD_SIMILARITY_THRESHOLD)}, true)`,
    );
    return work(tx);
  });
}

// ---------------------------------------------------------------------------
// Priced product query
// ---------------------------------------------------------------------------

const bd = alias(discounts, "bd");

const outerId = outerProductColumn("id");
const outerCategoryId = outerProductColumn("category_id");
const outerBasePrice = outerProductColumn("base_price");

/** Discount amount of the `discounts` row aliased `d` for the `products` row in scope. */
const candidateAmountSql = sql`LEAST(
  ${outerBasePrice},
  coalesce(d.max_discount_amount, ${outerBasePrice}),
  CASE WHEN d.type = 'PERCENTAGE'
    THEN round(${outerBasePrice} * LEAST(d.value, 100) / 100, 2)
    ELSE d.value END
)`;

/** Id of the winning automatic discount for the `products` row in scope. */
const bestDiscountIdSql = sql`(
  SELECT d.id FROM discounts d
  WHERE d.code IS NULL AND d.is_active AND d.starts_at <= now() AND d.ends_at > now()
    AND (
      d.product_id = ${outerId}
      OR (d.product_id IS NULL AND (d.category_id = ${outerCategoryId} OR d.category_id IS NULL))
    )
  ORDER BY
    CASE WHEN d.product_id IS NOT NULL THEN 3 WHEN d.category_id IS NOT NULL THEN 2 ELSE 1 END DESC,
    ${candidateAmountSql} DESC,
    d.ends_at ASC,
    d.id ASC
  LIMIT 1
)`;

const discountAmountSql = sql<string>`(CASE WHEN ${bd.id} IS NULL THEN 0 ELSE LEAST(
  ${products.basePrice},
  coalesce(${bd.maxDiscountAmount}, ${products.basePrice}),
  CASE WHEN ${bd.type} = 'PERCENTAGE'
    THEN round(${products.basePrice} * LEAST(${bd.value}, 100) / 100, 2)
    ELSE ${bd.value} END
) END)`;

const effectivePriceSql = sql<string>`(${products.basePrice} - ${discountAmountSql})`;

const unitsSoldSql = sql<number>`(
  SELECT coalesce(sum(oi.quantity), 0) FROM order_items oi
  JOIN orders o ON o.id = oi.order_id
  WHERE oi.product_id = ${outerId} AND o.status NOT IN ('CANCELLED', 'REFUNDED')
)`;

function productSelection(today: string) {
  return {
    id: products.id,
    slug: products.slug,
    title: products.title,
    sku: products.sku,
    brand: products.brand,
    description: products.description,
    images: products.images,
    isActive: products.isActive,
    autoDeactivatedAt: products.autoDeactivatedAt,
    requiresBatchTracking: products.requiresBatchTracking,
    lowStockThreshold: products.lowStockThreshold,
    basePrice: products.basePrice,
    costPrice: products.costPrice,
    createdAt: products.createdAt,
    updatedAt: products.updatedAt,
    categoryId: categories.id,
    categorySlug: categories.slug,
    categoryName: categories.name,
    totalStock: sellableStockSql(today),
    earliestExpiry: earliestExpirySql(today),
    discountAmount: discountAmountSql,
    effectivePrice: effectivePriceSql,
    discountId: bd.id,
    discountName: bd.name,
    discountType: bd.type,
    discountValue: bd.value,
    discountEndsAt: bd.endsAt,
    discountIsFlashSale: bd.isFlashSale,
  };
}

function selectPricedProducts(db: DbExecutor, today: string) {
  return db
    .select(productSelection(today))
    .from(products)
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .leftJoin(bd, sql`${bd.id} = ${bestDiscountIdSql}`);
}

type PricedProductRow = Awaited<ReturnType<typeof selectPricedProducts>>[number];

function countPricedProducts(db: DbExecutor, where: SQL | undefined) {
  return db
    .select({ total: count() })
    .from(products)
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .leftJoin(bd, sql`${bd.id} = ${bestDiscountIdSql}`)
    .where(where);
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

type FacetDimension = "brand" | "category" | "price";

interface ProductFilterSpec {
  /** "public" = active products only. */
  visibility: "public" | "all";
  today: string;
  categoryIds?: string[];
  brands?: string[];
  minPrice?: number;
  maxPrice?: number;
  inStockOnly?: boolean;
  search?: SearchSpec | null;
  status?: AdminProductStatusFilter;
  stock?: AdminStockFilter;
  productIds?: string[];
  excludeProductId?: string;
}

function buildWhere(spec: ProductFilterSpec, omit?: FacetDimension): SQL | undefined {
  const conditions: SQL[] = [];
  const stock = sellableStockSql(spec.today);

  if (spec.visibility === "public") conditions.push(eq(products.isActive, true));
  if (spec.productIds) conditions.push(inArray(products.id, spec.productIds));
  if (spec.excludeProductId) conditions.push(ne(products.id, spec.excludeProductId));
  if (spec.categoryIds && omit !== "category") conditions.push(inArray(products.categoryId, spec.categoryIds));
  if (spec.brands && spec.brands.length > 0 && omit !== "brand") {
    const list = sql.join(
      spec.brands.map((brand) => sql`${brand.toLowerCase()}`),
      sql`, `,
    );
    conditions.push(sql`lower(${products.brand}) IN (${list})`);
  }
  if (omit !== "price") {
    if (spec.minPrice !== undefined) conditions.push(sql`${effectivePriceSql} >= ${spec.minPrice}`);
    if (spec.maxPrice !== undefined) conditions.push(sql`${effectivePriceSql} <= ${spec.maxPrice}`);
  }
  if (spec.inStockOnly) conditions.push(sql`${stock} > 0`);
  if (spec.search) conditions.push(searchCondition(spec.search));

  switch (spec.status) {
    case "active":
      conditions.push(eq(products.isActive, true));
      break;
    case "inactive":
      conditions.push(sql`(NOT ${products.isActive} AND ${products.autoDeactivatedAt} IS NULL)`);
      break;
    case "awaiting_stock":
      conditions.push(sql`(NOT ${products.isActive} AND ${products.autoDeactivatedAt} IS NOT NULL)`);
      break;
    default:
      break;
  }
  switch (spec.stock) {
    case "in_stock":
      conditions.push(sql`${stock} > 0`);
      break;
    case "low":
      conditions.push(sql`(${stock} > 0 AND ${stock} <= ${products.lowStockThreshold})`);
      break;
    case "out":
      conditions.push(sql`${stock} = 0`);
      break;
    default:
      break;
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

function toCatalogProductDto(row: PricedProductRow, now: Date = new Date()): CatalogProductDTO {
  const basePrice = toNumber(row.basePrice);
  const effectivePrice = toNumber(row.effectivePrice);
  const discountAmount = toNumber(row.discountAmount);
  const totalStock = Number(row.totalStock);
  const activeDiscount: ActiveDiscountDTO | null =
    row.discountId !== null && row.discountType !== null && row.discountValue !== null && row.discountEndsAt !== null
      ? {
          id: row.discountId,
          name: row.discountName,
          type: row.discountType,
          value: toNumber(row.discountValue),
          isFlashSale: row.discountIsFlashSale ?? false,
          endsAt: toIso(row.discountEndsAt),
          countdownMs: Math.max(0, new Date(row.discountEndsAt).getTime() - now.getTime()),
        }
      : null;

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    sku: row.sku,
    brand: row.brand,
    description: row.description,
    images: row.images,
    category: { id: row.categoryId, slug: row.categorySlug, name: row.categoryName },
    basePrice,
    effectivePrice,
    discountAmount,
    discountPercent: discountPercentOf(toCents(basePrice), toCents(discountAmount)),
    activeDiscount: discountAmount > 0 ? activeDiscount : null,
    totalStock,
    isLowStock: totalStock > 0 && totalStock <= row.lowStockThreshold,
    isOutOfStock: totalStock === 0,
    requiresBatchTracking: row.requiresBatchTracking,
    earliestExpiry: row.requiresBatchTracking ? row.earliestExpiry : null,
    isActive: row.isActive,
    createdAt: toIso(row.createdAt),
  };
}

export function toAdminProductDto(row: PricedProductRow, now: Date = new Date()): AdminProductDTO {
  return {
    ...toCatalogProductDto(row, now),
    costPrice: toNumber(row.costPrice),
    lowStockThreshold: row.lowStockThreshold,
    autoDeactivatedAt: toNullableIso(row.autoDeactivatedAt),
    listingStatus: listingStatusOf(row),
    updatedAt: toIso(row.updatedAt),
  };
}

// ---------------------------------------------------------------------------
// Category resolution
// ---------------------------------------------------------------------------

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The category (by slug, or id when allowed) and its direct sub-categories' ids. */
async function resolveCategoryIds(
  db: DbExecutor,
  ref: string,
  options: { allowId: boolean; activeOnly: boolean },
): Promise<string[] | null> {
  const byId = options.allowId && UUID_PATTERN.test(ref);
  const conditions: SQL[] = [byId ? eq(categories.id, ref) : eq(categories.slug, ref)];
  if (options.activeOnly) conditions.push(eq(categories.isActive, true));
  const [category] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(...conditions))
    .limit(1);
  if (!category) return null;

  const childConditions: SQL[] = [eq(categories.parentId, category.id)];
  if (options.activeOnly) childConditions.push(eq(categories.isActive, true));
  const children = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(...childConditions));
  return [category.id, ...children.map((c) => c.id)];
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class CatalogService {
  /** Active categories ordered by sort_order, then name. */
  async listCategories(db: DbExecutor = defaultDb): Promise<CategoryDTO[]> {
    const rows = await db
      .select({
        id: categories.id,
        name: categories.name,
        slug: categories.slug,
        iconUrl: categories.iconUrl,
        parentId: categories.parentId,
        sortOrder: categories.sortOrder,
        productCount: count(products.id),
      })
      .from(categories)
      .leftJoin(products, and(eq(products.categoryId, categories.id), eq(products.isActive, true)))
      .where(eq(categories.isActive, true))
      .groupBy(categories.id)
      .orderBy(asc(categories.sortOrder), asc(categories.name));
    return rows.map((row) => ({ ...row, productCount: Number(row.productCount) }));
  }

  /** Public product listing with facets (see CatalogListQuery). */
  async listProducts(
    query: CatalogListQuery,
    db: DbExecutor = defaultDb,
  ): Promise<{ items: CatalogProductDTO[]; total: number; facets: CatalogFacets }> {
    const today = todayInBusinessTz();
    let categoryIds: string[] | undefined;
    if (query.category) {
      const resolved = await resolveCategoryIds(db, query.category, { allowId: false, activeOnly: true });
      if (!resolved) throw AppError.notFound("Category", { slug: query.category });
      categoryIds = resolved;
    }

    const search = searchSpec(query.q);
    const spec: ProductFilterSpec = {
      visibility: query.includeInactive ? "all" : "public",
      today,
      categoryIds,
      brands: query.brands,
      minPrice: query.minPrice,
      maxPrice: query.maxPrice,
      inStockOnly: query.inStockOnly,
      search,
    };
    const sort: CatalogSort = query.sort ?? (search ? "relevance" : "newest");
    const orderBy = publicOrderBy(sort, search);
    const where = buildWhere(spec);
    const offset = (query.page - 1) * query.limit;

    return withSearchSettings(db, search, async (exec) => {
      const [rows, totals, facets] = await queryAll(
        exec,
        () => selectPricedProducts(exec, today).where(where).orderBy(...orderBy).limit(query.limit).offset(offset),
        () => countPricedProducts(exec, where),
        () => this.facets(exec, spec),
      );
      const now = new Date();
      return {
        items: rows.map((row) => toCatalogProductDto(row, now)),
        total: Number(totals[0]?.total ?? 0),
        facets,
      };
    });
  }

  /** Public product detail by id or slug (active products only). */
  async getProductDetail(idOrSlug: string, db: DbExecutor = defaultDb): Promise<CatalogProductDetailDTO> {
    const today = todayInBusinessTz();
    const match = UUID_PATTERN.test(idOrSlug)
      ? or(eq(products.id, idOrSlug), eq(products.slug, idOrSlug))
      : eq(products.slug, idOrSlug);
    const [row] = await selectPricedProducts(db, today)
      .where(and(match, eq(products.isActive, true)))
      .limit(1);
    if (!row) throw AppError.notFound("Product", { idOrSlug });

    const now = new Date();
    const product = toCatalogProductDto(row, now);

    const [batches, related] = await queryAll(
      db,
      () =>
        product.requiresBatchTracking
          ? db
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
                  gt(productBatches.expiryDate, today),
                ),
              )
              .orderBy(asc(productBatches.expiryDate), asc(productBatches.id))
          : Promise.resolve([]),
      () =>
        selectPricedProducts(db, today)
          .where(
            buildWhere({
              visibility: "public",
              today,
              categoryIds: [product.category.id],
              excludeProductId: product.id,
            }),
          )
          .orderBy(desc(sql`${sellableStockSql(today)} > 0`), desc(products.createdAt), asc(products.id))
          .limit(4),
    );

    return {
      ...product,
      batchSummary: batches.map((batch) => ({
        batchNumber: batch.batchNumber,
        expiryDate: batch.expiryDate,
        availableQuantity: batch.availableQuantity,
        daysUntilExpiry: daysUntil(batch.expiryDate, today),
      })),
      relatedProducts: related.map((r) => toCatalogProductDto(r, now)),
    };
  }

  /** Running automatic flash sales (is_flash_sale, code IS NULL), soonest-ending first. */
  async listActiveFlashSales(db: DbExecutor = defaultDb): Promise<FlashSaleDTO[]> {
    const now = new Date();
    const rows = await db
      .select({
        id: discounts.id,
        name: discounts.name,
        type: discounts.type,
        value: discounts.value,
        productId: discounts.productId,
        categoryId: discounts.categoryId,
        startsAt: discounts.startsAt,
        endsAt: discounts.endsAt,
        categorySlug: categories.slug,
        categoryName: categories.name,
        categoryActive: categories.isActive,
      })
      .from(discounts)
      .leftJoin(categories, eq(categories.id, discounts.categoryId))
      .where(
        and(
          sql`${discounts.code} IS NULL`,
          eq(discounts.isActive, true),
          eq(discounts.isFlashSale, true),
          sql`${discounts.startsAt} <= now()`,
          sql`${discounts.endsAt} > now()`,
        ),
      )
      .orderBy(asc(discounts.endsAt), asc(discounts.id));

    const productIds = [...new Set(rows.flatMap((r) => (r.productId ? [r.productId] : [])))];
    const today = todayInBusinessTz();
    const productRows =
      productIds.length === 0
        ? []
        : await selectPricedProducts(db, today).where(
            buildWhere({ visibility: "public", today, productIds }),
          );
    const productsById = new Map(productRows.map((row) => [row.id, toCatalogProductDto(row, now)]));

    const sales: FlashSaleDTO[] = [];
    for (const row of rows) {
      const product = row.productId ? productsById.get(row.productId) ?? null : null;
      if (row.productId && !product) continue; // product hidden: do not advertise the sale
      if (row.categoryId && row.categoryActive === false) continue;
      sales.push({
        id: row.id,
        name: row.name,
        type: row.type,
        value: toNumber(row.value),
        scope: row.productId ? "PRODUCT" : row.categoryId ? "CATEGORY" : "STORE",
        productId: row.productId,
        categoryId: row.categoryId,
        product,
        category:
          row.categoryId && row.categorySlug !== null && row.categoryName !== null
            ? { id: row.categoryId, slug: row.categorySlug, name: row.categoryName }
            : null,
        startsAt: toIso(row.startsAt),
        endsAt: toIso(row.endsAt),
        countdownMs: Math.max(0, row.endsAt.getTime() - now.getTime()),
      });
    }
    return sales;
  }

  // -------------------------------------------------------------------------
  // Admin reads (used by product.service.ts and the admin routes)
  // -------------------------------------------------------------------------

  async listAdminProducts(
    query: AdminProductListQuery,
    db: DbExecutor = defaultDb,
  ): Promise<{ items: AdminProductDTO[]; total: number }> {
    const today = todayInBusinessTz();
    let categoryIds: string[] | undefined;
    if (query.category) {
      const resolved = await resolveCategoryIds(db, query.category, { allowId: true, activeOnly: false });
      if (!resolved) throw AppError.notFound("Category", { category: query.category });
      categoryIds = resolved;
    }
    const search = searchSpec(query.q);
    const spec: ProductFilterSpec = {
      visibility: "all",
      today,
      categoryIds,
      brands: query.brands,
      search,
      status: query.status,
      stock: query.stock,
    };
    const where = buildWhere(spec);
    const orderBy = adminOrderBy(query.sort, today);
    const offset = (query.page - 1) * query.limit;

    return withSearchSettings(db, search, async (exec) => {
      const [rows, totals] = await queryAll(
        exec,
        () => selectPricedProducts(exec, today).where(where).orderBy(...orderBy).limit(query.limit).offset(offset),
        () => countPricedProducts(exec, where),
      );
      const now = new Date();
      return { items: rows.map((row) => toAdminProductDto(row, now)), total: Number(totals[0]?.total ?? 0) };
    });
  }

  /** Admin product by id (any visibility). */
  async getAdminProduct(id: string, db: DbExecutor = defaultDb): Promise<AdminProductDTO> {
    const [row] = await selectPricedProducts(db, todayInBusinessTz()).where(eq(products.id, id)).limit(1);
    if (!row) throw AppError.notFound("Product", { id });
    return toAdminProductDto(row);
  }

  // -------------------------------------------------------------------------

  private async facets(db: DbExecutor, spec: ProductFilterSpec): Promise<CatalogFacets> {
    const brandWhere = buildWhere(spec, "brand");
    const categoryWhere = buildWhere(spec, "category");
    const priceWhere = buildWhere(spec, "price");

    const [brandRows, categoryRows, priceRows] = await queryAll(
      db,
      () =>
        db
          .select({ brand: products.brand, total: count() })
          .from(products)
          .innerJoin(categories, eq(categories.id, products.categoryId))
          .leftJoin(bd, sql`${bd.id} = ${bestDiscountIdSql}`)
          .where(brandWhere ? and(brandWhere, isNotNull(products.brand)) : isNotNull(products.brand))
          .groupBy(products.brand)
          .orderBy(desc(count()), asc(products.brand)),
      () =>
        db
          .select({
            id: categories.id,
            slug: categories.slug,
            name: categories.name,
            sortOrder: categories.sortOrder,
            total: count(),
          })
          .from(products)
          .innerJoin(categories, eq(categories.id, products.categoryId))
          .leftJoin(bd, sql`${bd.id} = ${bestDiscountIdSql}`)
          .where(categoryWhere)
          .groupBy(categories.id, categories.slug, categories.name, categories.sortOrder)
          .orderBy(asc(categories.sortOrder), asc(categories.name)),
      () =>
        db
          .select({
            min: sql<string | null>`min(${effectivePriceSql})`,
            max: sql<string | null>`max(${effectivePriceSql})`,
          })
          .from(products)
          .innerJoin(categories, eq(categories.id, products.categoryId))
          .leftJoin(bd, sql`${bd.id} = ${bestDiscountIdSql}`)
          .where(priceWhere),
    );

    const price = priceRows[0];
    return {
      brands: brandRows.flatMap((row) => (row.brand === null ? [] : [{ value: row.brand, count: Number(row.total) }])),
      categories: categoryRows.map((row) => ({
        id: row.id,
        slug: row.slug,
        name: row.name,
        count: Number(row.total),
      })),
      priceRange:
        price && price.min !== null && price.max !== null
          ? { min: toNumber(price.min), max: toNumber(price.max) }
          : null,
    };
  }
}

function publicOrderBy(sort: CatalogSort, search: SearchSpec | null): SQL[] {
  switch (sort) {
    case "relevance":
      return search
        ? [desc(searchRank(search)), desc(products.createdAt), asc(products.id)]
        : [desc(products.createdAt), asc(products.id)];
    case "price_asc":
      return [asc(effectivePriceSql), asc(products.id)];
    case "price_desc":
      return [desc(effectivePriceSql), asc(products.id)];
    case "popular":
      return [desc(unitsSoldSql), desc(products.createdAt), asc(products.id)];
    case "newest":
      return [desc(products.createdAt), asc(products.id)];
  }
}

function adminOrderBy(sort: AdminProductSort, today: string): SQL[] {
  const stock = sellableStockSql(today);
  switch (sort) {
    case "newest":
      return [desc(products.createdAt), asc(products.id)];
    case "oldest":
      return [asc(products.createdAt), asc(products.id)];
    case "title_asc":
      return [asc(products.title), asc(products.id)];
    case "title_desc":
      return [desc(products.title), asc(products.id)];
    case "price_asc":
      return [asc(effectivePriceSql), asc(products.id)];
    case "price_desc":
      return [desc(effectivePriceSql), asc(products.id)];
    case "stock_asc":
      return [asc(stock), asc(products.title), asc(products.id)];
    case "stock_desc":
      return [desc(stock), asc(products.title), asc(products.id)];
  }
}

export const catalogService = new CatalogService();
