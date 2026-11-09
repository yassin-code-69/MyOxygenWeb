"use client";

import { useCallback } from "react";
import { api } from "../../lib/api-client";
import { PERMISSIONS } from "../../types/auth";
import type {
  AdminCategory,
  AdminCategoryCreatePayload,
  AdminCategoryUpdatePayload,
} from "../../types/admin-management";
import { useAdminResource, useAdminRevalidate } from "./swr";
import { useCan } from "./use-permission";

const PATH = "/admin/catalog/categories";

/** `GET /admin/catalog/categories` (PRODUCTS_READ): every category, inactive included, in storefront order. */
export function useAdminCategories() {
  const allowed = useCan(PERMISSIONS.PRODUCTS_READ);
  return useAdminResource<AdminCategory[]>(PATH, {}, allowed, { keepPreviousData: true });
}

/**
 * Category writes (PRODUCTS_WRITE). The storefront category list and the
 * product pickers read `/catalog/categories`, so those caches refresh too.
 */
export function useCategoryMutations() {
  const revalidate = useAdminRevalidate();

  const refresh = useCallback(
    () => revalidate(PATH, "/catalog/categories", "/admin/catalog/products"),
    [revalidate],
  );

  const createCategory = useCallback(
    async (payload: AdminCategoryCreatePayload) => {
      const category = await api.post<AdminCategory>(PATH, payload);
      await refresh();
      return category;
    },
    [refresh],
  );

  const updateCategory = useCallback(
    async (id: string, payload: AdminCategoryUpdatePayload) => {
      const category = await api.patch<AdminCategory>(`${PATH}/${id}`, payload);
      await refresh();
      return category;
    },
    [refresh],
  );

  /** `DELETE` deactivates; 409 while the category still lists products (`details.listedProductCount`). */
  const deactivateCategory = useCallback(
    async (id: string) => {
      const category = await api.delete<AdminCategory>(`${PATH}/${id}`);
      await refresh();
      return category;
    },
    [refresh],
  );

  return { createCategory, updateCategory, deactivateCategory };
}
