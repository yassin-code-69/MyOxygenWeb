"use client";

import useSWR from "swr";
import { swrPageFetcher, type ApiError, type Page, type QueryParams } from "../lib/api-client";
import type {
  CatalogFacets,
  CatalogProductDTO,
  CatalogProductsMeta,
  CatalogProductsQuery,
} from "../types/catalog";

export type ProductsPage = Page<CatalogProductDTO, CatalogProductsMeta>;
export type ProductsKey = readonly [string, QueryParams];

/** Page size used by the storefront explorer (divisible by the 2/3/4-column grids). */
export const CATALOG_PAGE_SIZE = 12;

/** Turns a query into request params, dropping empty values (so they never reach the URL). */
export function buildProductsParams(query: CatalogProductsQuery): QueryParams {
  const params: Record<string, string | number | boolean | readonly string[]> = {};
  const q = query.q?.trim();
  if (q) {
    params.q = q.slice(0, 100);
  }
  if (query.category) {
    params.category = query.category;
  }
  if (query.brand && query.brand.length > 0) {
    params.brand = query.brand.slice(0, 20);
  }
  if (typeof query.minPrice === "number" && Number.isFinite(query.minPrice)) {
    params.minPrice = query.minPrice;
  }
  if (typeof query.maxPrice === "number" && Number.isFinite(query.maxPrice)) {
    params.maxPrice = query.maxPrice;
  }
  if (query.inStockOnly) {
    params.inStockOnly = true;
  }
  if (query.sort) {
    params.sort = query.sort;
  }
  if (query.page && query.page > 1) {
    params.page = query.page;
  }
  params.limit = query.limit ?? CATALOG_PAGE_SIZE;
  return params;
}

export interface UseProductsOptions {
  /** Set `false` to pause fetching (e.g. while a required value is unknown). */
  enabled?: boolean;
  /** Keep the previous page's data on screen while a new key loads (facets stay stable). */
  keepPreviousData?: boolean;
}

/**
 * `GET /catalog/products` — paginated catalog listing with facets.
 *
 * `isLoading` is true whenever the CURRENT query has no cached result yet, even when
 * `keepPreviousData` is returning the previous page (so grids can show skeletons while
 * the sidebar keeps the previous facets).
 */
export function useProducts(query: CatalogProductsQuery, options: UseProductsOptions = {}) {
  const { enabled = true, keepPreviousData = false } = options;
  const key: ProductsKey | null = enabled ? ["/catalog/products", buildProductsParams(query)] : null;

  const { data, error, isLoading, isValidating, mutate } = useSWR<ProductsPage, ApiError, ProductsKey | null>(
    key,
    (requestKey: ProductsKey) => swrPageFetcher<CatalogProductDTO, CatalogProductsMeta>(requestKey),
    { keepPreviousData, revalidateOnFocus: false }
  );

  const meta: CatalogProductsMeta | undefined = data?.meta;
  const facets: CatalogFacets | undefined = meta?.facets;

  return {
    products: data?.items ?? [],
    meta,
    facets,
    total: meta?.total ?? 0,
    totalPages: meta?.totalPages ?? 0,
    isLoading,
    isValidating,
    error,
    mutate,
  };
}
