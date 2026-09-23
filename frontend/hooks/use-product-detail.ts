import useSWR from "swr";
import { apiGet } from "../lib/api-client";
import type { ProductDetailItem, ProductDetailResponse } from "../types";

export function useProductDetail(idOrSlug?: string | null) {
  const shouldFetch = Boolean(idOrSlug && idOrSlug.trim() !== "");
  const path = shouldFetch ? `/catalog/products/${idOrSlug}` : null;

  const { data, error, isLoading, isValidating, mutate } = useSWR<ProductDetailResponse>(
    path,
    path ? () => apiGet<ProductDetailResponse>(path) : null,
    {
      revalidateOnFocus: false,
    }
  );

  const product: ProductDetailItem | undefined = data?.data;
  const earliestExpiryDate: string | null = product?.earliestExpiry ?? null;
  const totalAvailableStock: number = product?.totalAvailable ?? 0;

  return {
    product,
    earliestExpiryDate,
    totalAvailableStock,
    isLoading,
    isValidating,
    isError: !!error,
    error,
    mutate,
  };
}
