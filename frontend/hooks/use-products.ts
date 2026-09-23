import useSWR from "swr";
import { apiGet } from "../lib/api-client";
import type { CatalogProductItem, CatalogProductsResponse, PaginationMeta } from "../types";

export interface UseProductsFilterParams {
  q?: string;
  categorySlug?: string;
  minPrice?: number;
  maxPrice?: number;
  inStockOnly?: boolean;
  sort?: "newest" | "price_asc" | "price_desc" | "popular" | string;
  page?: number;
  limit?: number;
}

export function useProducts(filters: UseProductsFilterParams = {}) {
  const queryParams: Record<string, any> = {
    page: filters.page ?? 1,
    limit: filters.limit ?? 12,
  };

  if (filters.q && filters.q.trim() !== "") {
    queryParams.q = filters.q.trim();
  }
  if (filters.categorySlug && filters.categorySlug !== "all") {
    queryParams.categorySlug = filters.categorySlug;
  }
  if (filters.minPrice !== undefined) {
    queryParams.minPrice = filters.minPrice;
  }
  if (filters.maxPrice !== undefined) {
    queryParams.maxPrice = filters.maxPrice;
  }
  if (filters.inStockOnly) {
    queryParams.inStockOnly = true;
  }
  if (filters.sort) {
    queryParams.sort = filters.sort;
  }

  const key = ["/catalog/products", JSON.stringify(queryParams)];

  const { data, error, isLoading, isValidating, mutate } = useSWR<CatalogProductsResponse>(
    key,
    () => apiGet<CatalogProductsResponse>("/catalog/products", queryParams),
    {
      keepPreviousData: true,
      revalidateOnFocus: false,
    }
  );

  return {
    products: data?.data ?? ([] as CatalogProductItem[]),
    pagination: data?.pagination as PaginationMeta | undefined,
    meta: data?.pagination as PaginationMeta | undefined,
    isLoading,
    isValidating,
    isError: !!error,
    error,
    mutate,
  };
}
