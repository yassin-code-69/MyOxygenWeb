"use client";

import { useCallback } from "react";
import { api } from "../../lib/api-client";
import { PERMISSIONS } from "../../types/auth";
import type { AdminBrand, AdminBrandRenamePayload, AdminBrandRenameResult } from "../../types/admin-management";
import { useAdminResource, useAdminRevalidate } from "./swr";
import { useCan } from "./use-permission";

const PATH = "/admin/catalog/brands";

/** `GET /admin/catalog/brands` (PRODUCTS_READ): every distinct brand spelling, A–Z. */
export function useBrands() {
  const allowed = useCan(PERMISSIONS.PRODUCTS_READ);
  return useAdminResource<AdminBrand[]>(PATH, {}, allowed, { keepPreviousData: true });
}

/** Brand writes (PRODUCTS_WRITE). Renaming touches products, so their caches refresh too. */
export function useBrandMutations() {
  const revalidate = useAdminRevalidate();

  /** `PATCH /admin/catalog/brands` — renames, or merges when `to` already exists. */
  const renameBrand = useCallback(
    async (payload: AdminBrandRenamePayload) => {
      const result = await api.patch<AdminBrandRenameResult>(PATH, payload);
      await revalidate(PATH, "/admin/catalog/products", "/catalog/products");
      return result;
    },
    [revalidate],
  );

  return { renameBrand };
}
