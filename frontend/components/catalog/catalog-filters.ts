/**
 * Catalog explorer filter state <-> URL query string.
 *
 * URL keys mirror the API (`docs/API_CONTRACT.md` → `GET /catalog/products`):
 * `q`, `category`, `brand` (repeated), `minPrice`, `maxPrice`, `inStockOnly`, `sort`, `page`.
 * Serialisation is canonical (fixed key order, defaults omitted) so equal states give equal URLs.
 */
import { CATALOG_SORTS, type CatalogProductsQuery, type CatalogSort } from "../../types/catalog";

export interface CatalogFilters {
  q: string;
  /** Category slug filter (`null` = all; always `null` on a category landing page). */
  category: string | null;
  brands: string[];
  minPrice: number | null;
  maxPrice: number | null;
  inStockOnly: boolean;
  /** `null` = API default (`relevance` with a query, otherwise `newest`). */
  sort: CatalogSort | null;
  page: number;
}

export const EMPTY_CATALOG_FILTERS: CatalogFilters = {
  q: "",
  category: null,
  brands: [],
  minPrice: null,
  maxPrice: null,
  inStockOnly: false,
  sort: null,
  page: 1,
};

export interface FilterScope {
  /** `true` on `/categories/[slug]`: the category comes from the route, never from the URL. */
  lockCategory: boolean;
}

/** Read-only view of URLSearchParams (Next's `ReadonlyURLSearchParams` satisfies it). */
export interface SearchParamsReader {
  get(name: string): string | null;
  getAll(name: string): string[];
}

const MAX_QUERY_LENGTH = 100;
const MAX_BRANDS = 20;
const SLUG_PATTERN = /^[A-Za-z0-9-]{1,255}$/;

function parsePrice(value: string | null): number | null {
  if (value === null || value.trim() === "") {
    return null;
  }
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

function parseBoolean(value: string | null): boolean {
  return value === "true" || value === "1";
}

function isCatalogSort(value: string | null): value is CatalogSort {
  return value !== null && (CATALOG_SORTS as readonly string[]).includes(value);
}

/** Splits repeated and comma-separated `brand` params, de-duplicated case-insensitively. */
function parseBrands(values: string[]): string[] {
  const seen = new Set<string>();
  const brands: string[] = [];
  for (const raw of values) {
    for (const part of raw.split(",")) {
      const brand = part.trim();
      const key = brand.toLowerCase();
      if (brand && !seen.has(key)) {
        seen.add(key);
        brands.push(brand);
      }
    }
  }
  return brands.slice(0, MAX_BRANDS);
}

export function parseCatalogFilters(params: SearchParamsReader, { lockCategory }: FilterScope): CatalogFilters {
  const q = (params.get("q") ?? "").trim().slice(0, MAX_QUERY_LENGTH);
  const categoryParam = params.get("category");
  const category =
    !lockCategory && categoryParam && SLUG_PATTERN.test(categoryParam) ? categoryParam : null;
  let minPrice = parsePrice(params.get("minPrice"));
  let maxPrice = parsePrice(params.get("maxPrice"));
  if (minPrice !== null && maxPrice !== null && minPrice > maxPrice) {
    [minPrice, maxPrice] = [maxPrice, minPrice];
  }
  const sortParam = params.get("sort");
  const pageParam = Number.parseInt(params.get("page") ?? "1", 10);

  return {
    q,
    category,
    brands: parseBrands(params.getAll("brand")),
    minPrice,
    maxPrice,
    inStockOnly: parseBoolean(params.get("inStockOnly")),
    sort: isCatalogSort(sortParam) ? sortParam : null,
    page: Number.isFinite(pageParam) && pageParam > 1 ? pageParam : 1,
  };
}

/** Canonical query string (without `?`). */
export function serializeCatalogFilters(filters: CatalogFilters, { lockCategory }: FilterScope): string {
  const params = new URLSearchParams();
  if (filters.q.trim()) {
    params.set("q", filters.q.trim());
  }
  if (!lockCategory && filters.category) {
    params.set("category", filters.category);
  }
  for (const brand of filters.brands) {
    params.append("brand", brand);
  }
  if (filters.minPrice !== null) {
    params.set("minPrice", String(filters.minPrice));
  }
  if (filters.maxPrice !== null) {
    params.set("maxPrice", String(filters.maxPrice));
  }
  if (filters.inStockOnly) {
    params.set("inStockOnly", "true");
  }
  if (filters.sort) {
    params.set("sort", filters.sort);
  }
  if (filters.page > 1) {
    params.set("page", String(filters.page));
  }
  return params.toString();
}

/** Effective sort shown in the sort menu. */
export function effectiveSort(filters: Pick<CatalogFilters, "q" | "sort">): CatalogSort {
  if (filters.sort && (filters.sort !== "relevance" || filters.q.trim())) {
    return filters.sort;
  }
  return filters.q.trim() ? "relevance" : "newest";
}

/** Filters → API query. `lockedCategory` wins over the URL category. */
export function toProductsQuery(
  filters: CatalogFilters,
  { lockedCategory, limit }: { lockedCategory?: string | null; limit: number }
): CatalogProductsQuery {
  const sort = effectiveSort(filters);
  return {
    q: filters.q,
    category: lockedCategory ?? filters.category,
    brand: filters.brands,
    minPrice: filters.minPrice,
    maxPrice: filters.maxPrice,
    inStockOnly: filters.inStockOnly,
    // Only send a sort that differs from the API default for this query.
    sort: sort === (filters.q.trim() ? "relevance" : "newest") ? null : sort,
    page: filters.page,
    limit,
  };
}

/** Number of user-applied filters (search excluded), for badges and "Reset". */
export function countActiveFilters(filters: CatalogFilters): number {
  return (
    (filters.category ? 1 : 0) +
    filters.brands.length +
    (filters.minPrice !== null || filters.maxPrice !== null ? 1 : 0) +
    (filters.inStockOnly ? 1 : 0)
  );
}

export function hasAnyFilter(filters: CatalogFilters): boolean {
  return countActiveFilters(filters) > 0 || filters.q.trim() !== "";
}
