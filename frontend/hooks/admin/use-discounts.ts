"use client";

import { useCallback } from "react";
import useSWR, { type KeyedMutator } from "swr";
import { api, type ApiError, type Page } from "../../lib/api-client";
import { collectPages } from "../../lib/csv";
import { PERMISSIONS } from "../../types/auth";
import type {
  AdminDiscountCreatePayload,
  AdminDiscountDTO,
  AdminDiscountStatus,
  AdminDiscountUpdatePayload,
} from "../../types/admin";
import type { PaginationMeta } from "../../types/api";
import {
  cleanParams,
  updateItemOptimistically,
  useAdminPage,
  useAdminResource,
  useAdminRevalidate,
  type AdminKey,
} from "./swr";
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

/** `GET /admin/discounts/:id` — for `?discountId=` deep links. Pass `null` to skip. */
export function useDiscount(id: string | null) {
  const allowed = useCan(PERMISSIONS.DISCOUNTS_MANAGE);
  return useAdminResource<AdminDiscountDTO>(id ? `/admin/discounts/${id}` : null, {}, allowed);
}

export interface AdminDiscountStats {
  /** Coupons customers can use right now. */
  activeCoupons: number;
  /** Automatic flash sales running right now. */
  runningFlashSales: number;
  /** Automatic (non-flash) price drops running right now. */
  runningAutomatic: number;
  scheduled: number;
  /** Times coupons have been redeemed (sum of `usageCount`). */
  totalRedemptions: number;
  /** True when there were more discounts than the stats read. */
  truncated: boolean;
}

/**
 * KPI strip numbers, computed from every discount (pages of 100, capped at
 * 1,000). The list endpoint has no flash-sale filter, so counting client-side
 * is the only exact way.
 */
export function useDiscountStats() {
  const allowed = useCan(PERMISSIONS.DISCOUNTS_MANAGE);
  const key: AdminKey | null = allowed ? ["/admin/discounts#stats", {}] : null;
  return useSWR<AdminDiscountStats, ApiError, AdminKey | null>(
    key,
    async () => {
      const { items, truncated } = await collectPages(
        (page) => api.getPage<AdminDiscountDTO>("/admin/discounts", { page, limit: 100 }),
        { maxRows: 1000 },
      );
      const stats: AdminDiscountStats = {
        activeCoupons: 0,
        runningFlashSales: 0,
        runningAutomatic: 0,
        scheduled: 0,
        totalRedemptions: 0,
        truncated,
      };
      for (const discount of items) {
        const running = discount.status === "ACTIVE";
        if (discount.kind === "COUPON") {
          stats.totalRedemptions += discount.usageCount;
          if (running) {
            stats.activeCoupons += 1;
          }
        } else if (running) {
          if (discount.isFlashSale) {
            stats.runningFlashSales += 1;
          } else {
            stats.runningAutomatic += 1;
          }
        }
        if (discount.status === "SCHEDULED") {
          stats.scheduled += 1;
        }
      }
      return stats;
    },
    { refreshInterval: 60_000 },
  );
}

export type AdminDiscountKindCounts = Record<"coupon" | "automatic", number>;

/** Coupons vs automatic discounts matching the status / search filters (for the tab counts). */
export function useDiscountKindCounts(filters: Pick<DiscountFilters, "status" | "q">) {
  const allowed = useCan(PERMISSIONS.DISCOUNTS_MANAGE);
  const params = cleanParams({ status: filters.status ?? undefined, q: filters.q?.trim() || undefined });
  const key: AdminKey | null = allowed ? ["/admin/discounts#kind-counts", params] : null;
  return useSWR<AdminDiscountKindCounts, ApiError, AdminKey | null>(
    key,
    async ([, query]: AdminKey) => {
      const [coupon, automatic] = await Promise.all(
        (["coupon", "automatic"] as const).map((type) =>
          api.getPage<AdminDiscountDTO>("/admin/discounts", { ...query, type, page: 1, limit: 1 }),
        ),
      );
      return { coupon: coupon?.meta.total ?? 0, automatic: automatic?.meta.total ?? 0 };
    },
    { keepPreviousData: true },
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
