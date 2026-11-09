"use client";

import useSWR from "swr";
import { api, type ApiError } from "../../lib/api-client";
import type { CatalogCategoryDTO } from "../../types/catalog";

const CATEGORIES_PATH = "/catalog/categories";

/**
 * `GET /catalog/categories` — active categories with `productCount`, in the owner's
 * order (`sortOrder`, then name). Shared by the navbar, mobile strip, home grid,
 * footer and explorer, so SWR deduplicates it into a single request.
 */
export function useCategories() {
  const { data, error, isLoading, mutate } = useSWR<CatalogCategoryDTO[], ApiError, string>(
    CATEGORIES_PATH,
    (path: string) => api.get<CatalogCategoryDTO[]>(path),
    { revalidateOnFocus: false, dedupingInterval: 60_000 }
  );

  return {
    categories: data ?? [],
    isLoaded: data !== undefined,
    isLoading,
    error,
    mutate,
  };
}
