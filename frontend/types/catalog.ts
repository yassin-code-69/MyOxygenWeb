/**
 * Catalog domain types — mirror `docs/API_CONTRACT.md` ("Shared shapes" + "Public catalog").
 *
 * The `Catalog*DTO` types are the contract. The older interfaces at the bottom of this
 * file (`CatalogProductItem`, `ProductDetailItem`, …) describe the pre-remediation
 * payloads; they are kept, deprecated, only so un-migrated files keep compiling.
 */
import type { PaginationMeta } from "./api";

/** Money: the contract sends JSON numbers (BDT, 2 decimals). Legacy fields may still be decimal strings. */
export type Money = number | string;

export type DiscountType = "PERCENTAGE" | "FIXED_AMOUNT";

// ---------------------------------------------------------------------------
// Contract DTOs (public catalog)
// ---------------------------------------------------------------------------

/** `category` embedded in every catalog product. */
export interface CatalogCategoryRef {
  id: string;
  slug: string;
  name: string;
}

/** Automatic discount currently applied to a product's effective price. */
export interface CatalogActiveDiscount {
  id: string;
  name: string | null;
  type: DiscountType;
  value: number;
  isFlashSale: boolean;
  /** ISO timestamp. */
  endsAt: string;
  countdownMs: number;
}

/** `CatalogProductDTO` — item of `GET /catalog/products`. No rating fields and no cost price exist. */
export interface CatalogProductDTO {
  id: string;
  slug: string;
  title: string;
  sku: string;
  brand: string | null;
  description: string;
  images: string[];
  category: CatalogCategoryRef;
  basePrice: number;
  effectivePrice: number;
  discountAmount: number;
  /** May be fractional (e.g. `14.84`). */
  discountPercent: number;
  activeDiscount: CatalogActiveDiscount | null;
  totalStock: number;
  isLowStock: boolean;
  isOutOfStock: boolean;
  requiresBatchTracking: boolean;
  /** `YYYY-MM-DD`; only for batch-tracked products. */
  earliestExpiry: string | null;
  isActive: boolean;
  createdAt: string;
}

/** Sellable batch of a product, FEFO order (`batchSummary` of the product detail). */
export interface CatalogBatchSummaryEntry {
  batchNumber: string;
  /** `YYYY-MM-DD`. */
  expiryDate: string;
  availableQuantity: number;
  daysUntilExpiry: number;
}

/** `GET /catalog/products/:idOrSlug`. */
export interface CatalogProductDetailDTO extends CatalogProductDTO {
  batchSummary: CatalogBatchSummaryEntry[];
  /** At most 4. */
  relatedProducts: CatalogProductDTO[];
}

/** Item of `GET /catalog/categories` (active only, sorted by `sortOrder` then `name`). */
export interface CatalogCategoryDTO {
  id: string;
  name: string;
  slug: string;
  iconUrl: string | null;
  parentId: string | null;
  sortOrder: number;
  productCount: number;
}

export interface CatalogBrandFacet {
  value: string;
  count: number;
}

export interface CatalogCategoryFacet extends CatalogCategoryRef {
  count: number;
}

export interface CatalogPriceRange {
  min: number;
  max: number;
}

/** `meta.facets` of `GET /catalog/products`. Each facet ignores its own filter. */
export interface CatalogFacets {
  brands: CatalogBrandFacet[];
  categories: CatalogCategoryFacet[];
  /** `null` when nothing matches. */
  priceRange: CatalogPriceRange | null;
}

export interface CatalogProductsMeta extends PaginationMeta {
  facets: CatalogFacets;
}

/** Sort keys accepted by `GET /catalog/products`. Default: `relevance` with `q`, else `newest`. */
export type CatalogSort = "relevance" | "price_asc" | "price_desc" | "newest" | "popular";

export const CATALOG_SORTS: readonly CatalogSort[] = [
  "relevance",
  "price_asc",
  "price_desc",
  "newest",
  "popular",
] as const;

/** Query of `GET /catalog/products` (empty values are omitted from the request). */
export interface CatalogProductsQuery {
  /** ≤100 chars; substring + trigram match. */
  q?: string;
  /** Category slug (includes direct sub-categories). Unknown slug → 404. */
  category?: string | null;
  /** ≤20 brand names, case-insensitive. */
  brand?: readonly string[];
  /** Against the effective price. */
  minPrice?: number | null;
  maxPrice?: number | null;
  inStockOnly?: boolean;
  sort?: CatalogSort | null;
  page?: number;
  /** 1–100, default 24. */
  limit?: number;
}

export type FlashSaleScope = "PRODUCT" | "CATEGORY" | "STORE";

/** Item of `GET /catalog/flash-sales` (running automatic flash sales, soonest-ending first). */
export interface CatalogFlashSaleDTO {
  id: string;
  name: string | null;
  type: DiscountType;
  value: number;
  scope: FlashSaleScope;
  productId: string | null;
  categoryId: string | null;
  product: CatalogProductDTO | null;
  category: CatalogCategoryRef | null;
  startsAt: string;
  endsAt: string;
  countdownMs: number;
}

// ---------------------------------------------------------------------------
// Card view-model (consumed by components/ProductCard)
// ---------------------------------------------------------------------------

/**
 * Discount summary accepted by `ProductCardData.discount`.
 * @deprecated Prefer `CatalogActiveDiscount`; kept for the card's structural typing.
 */
export interface CatalogDiscount {
  id?: string;
  code?: string | null;
  type: DiscountType;
  value: Money;
  isFlashSale?: boolean;
  endsAt?: string;
  countdownMs?: number;
}

/**
 * View-model accepted by `<ProductCard product={...} />`.
 *
 * Structural on purpose: a `CatalogProductDTO` is assignable directly; mapping it
 * (category name/slug, `totalStock` → `totalAvailable`) shows the category pill and
 * "Only N left". Every optional field is rendered ONLY when present — the card never
 * invents expiry dates, ratings or stock levels.
 */
export interface ProductCardData {
  id: string;
  title: string;
  slug: string;
  /** Single image URL. Falls back to `images[0]`, then the brand placeholder. */
  image?: string | null;
  images?: readonly string[];
  basePrice: Money;
  /** Price after discount. Defaults to `basePrice`. */
  effectivePrice?: Money | null;
  /** Explicit discount %. Derived from base/effective price when omitted. */
  discountPercentage?: number | null;
  discount?: CatalogDiscount | null;
  /** Human category label shown as a pill. */
  categoryName?: string | null;
  categorySlug?: string | null;
  brand?: string | null;
  totalAvailable?: number | null;
  isLowStock?: boolean;
  isOutOfStock?: boolean;
  /** Legacy boolean stock flag. */
  inStock?: boolean;
  /** ISO date of the earliest non-expired batch (FEFO). Only rendered when present. */
  earliestExpiry?: string | null;
  /** Average rating — render ONLY when backed by real review data (none exists today). */
  rating?: number | null;
  reviewCount?: number | null;
}

// ---------------------------------------------------------------------------
// Deprecated pre-remediation shapes (do not use in new code)
// ---------------------------------------------------------------------------

/** @deprecated Use `CatalogCategoryDTO` (public) or the admin category types. */
export interface CategoryDTO {
  id: string;
  name: string;
  slug: string;
  iconUrl: string | null;
  parentId: string | null;
  sortOrder?: number;
  isActive: boolean;
  createdAt: string;
}

/** @deprecated Use `BatchDTO` from `types/admin.ts` or `CatalogBatchSummaryEntry`. */
export interface ProductBatchDTO {
  id: string;
  productId: string;
  batchNumber: string;
  manufactureDate: string | null;
  expiryDate: string;
  initialQuantity: number;
  availableQuantity: number;
  createdAt: string;
}

/** @deprecated Use `CatalogProductDTO`. */
export interface ProductDTO {
  id: string;
  categoryId: string;
  title: string;
  slug: string;
  sku: string;
  brand?: string | null;
  description: string;
  basePrice: string;
  costPrice: string;
  images: string[];
  isActive: boolean;
  requiresBatchTracking: boolean;
  lowStockThreshold: number;
  effectivePrice?: Money;
  totalStock?: number;
  totalAvailable?: number;
  earliestExpiry?: string | null;
  category?: CategoryDTO;
  createdAt: string;
  updatedAt: string;
}

/** @deprecated Pre-remediation listing item. Use `CatalogProductDTO`. */
export interface CatalogProductItem {
  id: string;
  title: string;
  slug: string;
  sku: string;
  brand?: string | null;
  description: string;
  basePrice: string;
  costPrice?: string;
  images: string[];
  requiresBatchTracking: boolean;
  lowStockThreshold: number;
  categoryId: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  totalAvailable: number;
  searchRank?: number;
  effectivePrice: number;
  earliestExpiry?: string | null;
  discount?: CatalogDiscount | null;
  isLowStock: boolean;
  isOutOfStock: boolean;
}

/** @deprecated Use `CatalogBatchSummaryEntry`. */
export interface BatchSummaryItem {
  batchNumber: string;
  expiryDate: string;
  availableQuantity: number;
}

/** @deprecated `relatedProducts` are full `CatalogProductDTO`s. */
export interface RelatedProductItem {
  id: string;
  title: string;
  slug: string;
  basePrice: string;
  images: string[];
}

/** @deprecated Use `CatalogProductDetailDTO`. */
export interface ProductDetailItem extends CatalogProductItem {
  activeDiscount?: CatalogDiscount | null;
  earliestExpiry: string | null;
  batchSummary: BatchSummaryItem[];
  relatedProducts?: RelatedProductItem[];
}

/** @deprecated Raw envelope of the old listing. Use `api.getPage<CatalogProductDTO, CatalogProductsMeta>`. */
export interface CatalogProductsResponse {
  success: boolean;
  data: CatalogProductItem[];
  /** Legacy key. The remediated backend sends `meta`. */
  pagination: PaginationMeta;
  meta?: PaginationMeta;
}

/** @deprecated Raw envelope of the old detail. Use `api.get<CatalogProductDetailDTO>`. */
export interface ProductDetailResponse {
  success: boolean;
  data: ProductDetailItem;
}
