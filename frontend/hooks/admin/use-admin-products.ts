"use client";

import { useCallback } from "react";
import type { KeyedMutator } from "swr";
import { api, type Page } from "../../lib/api-client";
import { PERMISSIONS } from "../../types/auth";
import type {
  AdminCategoryOption,
  AdminProductCreatePayload,
  AdminProductDTO,
  AdminProductDetailDTO,
  AdminProductSort,
  AdminProductStatusFilter,
  AdminProductUpdatePayload,
  AdminStockFilter,
} from "../../types/admin";
import type { PaginationMeta } from "../../types/api";
import { updateItemOptimistically, useAdminPage, useAdminResource, useAdminRevalidate } from "./swr";
import { useCan } from "./use-permission";

export interface AdminProductFilters {
  page: number;
  limit: number;
  q?: string;
  /** Category slug or UUID. */
  category?: string | null;
  brand?: string;
  status?: AdminProductStatusFilter;
  stock?: AdminStockFilter;
  sort?: AdminProductSort;
}

/** `GET /admin/catalog/products` (PRODUCTS_READ). */
export function useAdminProducts(filters: AdminProductFilters, enabled = true) {
  const allowed = useCan(PERMISSIONS.PRODUCTS_READ);
  return useAdminPage<AdminProductDTO>(
    "/admin/catalog/products",
    {
      page: filters.page,
      limit: filters.limit,
      q: filters.q?.trim() || undefined,
      category: filters.category ?? undefined,
      brand: filters.brand?.trim() || undefined,
      status: filters.status === "all" ? undefined : filters.status,
      stock: filters.stock === "all" ? undefined : filters.stock,
      sort: filters.sort,
    },
    allowed && enabled,
  );
}

/** `GET /admin/catalog/products/:id` with its batches. Pass `null` to skip. */
export function useAdminProduct(id: string | null) {
  const allowed = useCan(PERMISSIONS.PRODUCTS_READ);
  return useAdminResource<AdminProductDetailDTO>(id ? `/admin/catalog/products/${id}` : null, {}, allowed);
}

/**
 * Product options for pickers: server-side search across every listing status
 * (active, awaiting stock and inactive), alphabetical, 25 at a time.
 */
export function useProductOptions(search: string, enabled = true) {
  const allowed = useCan(PERMISSIONS.PRODUCTS_READ);
  return useAdminPage<AdminProductDTO>(
    "/admin/catalog/products",
    { page: 1, limit: 25, q: search.trim() || undefined, sort: "title_asc" },
    allowed && enabled,
    { revalidateOnFocus: false },
  );
}

/** `GET /catalog/categories` (active categories, sorted). */
export function useCategories() {
  return useAdminResource<AdminCategoryOption[]>("/catalog/categories", {}, true, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });
}

export type AdminProductsPage = Page<AdminProductDTO, PaginationMeta>;

export interface ListHandle<P> {
  mutate: KeyedMutator<P>;
  current: P | undefined;
}

/** Product writes (PRODUCTS_WRITE). Each one revalidates products, batches, discounts and the dashboard. */
export function useProductMutations() {
  const revalidate = useAdminRevalidate();

  const refresh = useCallback(
    () => revalidate("/admin/catalog/products", "/admin/batches", "/admin/analytics", "/admin/discounts"),
    [revalidate],
  );

  const createProduct = useCallback(
    async (payload: AdminProductCreatePayload) => {
      const product = await api.post<AdminProductDTO>("/admin/catalog/products", payload);
      await refresh();
      return product;
    },
    [refresh],
  );

  const updateProduct = useCallback(
    async (id: string, payload: AdminProductUpdatePayload) => {
      const product = await api.patch<AdminProductDTO>(`/admin/catalog/products/${id}`, payload);
      await refresh();
      return product;
    },
    [refresh],
  );

  /**
   * Soft delete (listing becomes INACTIVE). When the list on screen is passed,
   * its row flips to INACTIVE immediately and rolls back if the request fails.
   */
  const deactivateProduct = useCallback(
    async (id: string, list?: ListHandle<AdminProductsPage>) => {
      const request = () => api.delete<AdminProductDTO>(`/admin/catalog/products/${id}`);
      const product = list
        ? await updateItemOptimistically({
            mutate: list.mutate,
            current: list.current,
            id,
            optimistic: (item) => ({ ...item, isActive: false, listingStatus: "INACTIVE" as const }),
            request,
            merge: (_item, result) => result,
          })
        : await request();
      await refresh();
      return product;
    },
    [refresh],
  );

  /** `PATCH isActive: true` — ACTIVE with stock, otherwise AWAITING_STOCK. */
  const reactivateProduct = useCallback(
    (id: string) => updateProduct(id, { isActive: true }),
    [updateProduct],
  );

  return { createProduct, updateProduct, deactivateProduct, reactivateProduct };
}
