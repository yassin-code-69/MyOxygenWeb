"use client";

import { useCallback } from "react";
import type { KeyedMutator } from "swr";
import { api, type Page } from "../../lib/api-client";
import { PERMISSIONS } from "../../types/auth";
import type {
  AdminDiscountCreatePayload,
  AdminDiscountDTO,
  AdminDiscountStatus,
  AdminDiscountUpdatePayload,
} from "../../types/admin";
import type { PaginationMeta } from "../../types/api";
import { updateItemOptimistically, useAdminPage, useAdminRevalidate } from "./swr";
import { useCan } from "./use-permission";

export interface DiscountFilters {
  page: number;
  limit: number;
  type?: "automatic" | "coupon" | null;
  status?: AdminDiscountStatus | null;
  q?: string;
}

export type AdminDiscountsPage = Page<AdminDiscountDTO, PaginationMeta>;

/** `GET /admin/discounts` (DISCOUNTS_MANAGE), newest first. */
export function useDiscounts(filters: DiscountFilters) {
  const allowed = useCan(PERMISSIONS.DISCOUNTS_MANAGE);
  return useAdminPage<AdminDiscountDTO>(
    "/admin/discounts",
    {
      page: filters.page,
      limit: filters.limit,
      type: filters.type ?? undefined,
      status: filters.status ?? undefined,
      q: filters.q?.trim() || undefined,
    },
    allowed,
  );
}

/** Discount writes. Prices on the storefront change, so the catalog is revalidated too. */
export function useDiscountMutations() {
  const revalidate = useAdminRevalidate();

  const refresh = useCallback(
    () => revalidate("/admin/discounts", "/admin/catalog/products"),
    [revalidate],
  );

  const createDiscount = useCallback(
    async (payload: AdminDiscountCreatePayload) => {
      const discount = await api.post<AdminDiscountDTO>("/admin/discounts", payload);
      await refresh();
      return discount;
    },
    [refresh],
  );

  const updateDiscount = useCallback(
    async (id: string, payload: AdminDiscountUpdatePayload) => {
      const discount = await api.patch<AdminDiscountDTO>(`/admin/discounts/${id}`, payload);
      await refresh();
      return discount;
    },
    [refresh],
  );

  /** `DELETE /admin/discounts/:id` — deactivates (status DISABLED), optimistic on the list on screen. */
  const deactivateDiscount = useCallback(
    async (id: string, list?: { mutate: KeyedMutator<AdminDiscountsPage>; current: AdminDiscountsPage | undefined }) => {
      const request = () => api.delete<AdminDiscountDTO>(`/admin/discounts/${id}`);
      const discount = list
        ? await updateItemOptimistically({
            mutate: list.mutate,
            current: list.current,
            id,
            optimistic: (item) => ({ ...item, isActive: false, status: "DISABLED" as const }),
            request,
            merge: (_item, result) => result,
          })
        : await request();
      await refresh();
      return discount;
    },
    [refresh],
  );

  return { createDiscount, updateDiscount, deactivateDiscount };
}
