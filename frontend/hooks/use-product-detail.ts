"use client";

import useSWR from "swr";
import { api, isApiError, type ApiError } from "../lib/api-client";
import type { CatalogProductDetailDTO } from "../types/catalog";

/** 404 (missing / inactive) and 422 (malformed slug) both mean "this product page does not exist". */
export function isProductNotFoundError(error: unknown): boolean {
  return isApiError(error) && (error.status === 404 || error.status === 422);
}

/** `GET /catalog/products/:idOrSlug` — detail with `batchSummary` and `relatedProducts`. */
export function useProductDetail(idOrSlug: string | null | undefined) {
  const slug = idOrSlug?.trim() ?? "";
  const key = slug ? `/catalog/products/${encodeURIComponent(slug)}` : null;

  const { data, error, isLoading, isValidating, mutate } = useSWR<CatalogProductDetailDTO, ApiError, string | null>(
    key,
    (path: string) => api.get<CatalogProductDetailDTO>(path),
    {
      revalidateOnFocus: false,
      shouldRetryOnError: (err) => !isProductNotFoundError(err),
    }
  );

  return {
    product: data,
    error,
    isNotFound: isProductNotFoundError(error),
    isLoading,
    isValidating,
    mutate,
  };
}
