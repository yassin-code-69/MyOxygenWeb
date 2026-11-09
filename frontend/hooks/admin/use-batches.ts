"use client";

import { useCallback } from "react";
import useSWR from "swr";
import { api, type ApiError } from "../../lib/api-client";
import { PERMISSIONS } from "../../types/auth";
import type {
  AdminAdjustStockPayload,
  AdminAdjustStockResult,
  AdminBatchDTO,
  AdminBatchListMeta,
  AdminImportBatchPayload,
  AdminImportBatchResult,
  BatchHealthStatus,
} from "../../types/admin";
import { useAdminPage, useAdminRevalidate, type AdminKey } from "./swr";
import { useCan } from "./use-permission";

export interface BatchFilters {
  page: number;
  limit: number;
  status?: BatchHealthStatus | null;
  q?: string;
  productId?: string | null;
  inStockOnly?: boolean;
}

/** `GET /admin/batches` (BATCHES_MANAGE). `meta.summary` counts ignore the status filter. */
export function useBatches(filters: BatchFilters) {
  const allowed = useCan(PERMISSIONS.BATCHES_MANAGE);
  return useAdminPage<AdminBatchDTO, AdminBatchListMeta>(
    "/admin/batches",
    {
      page: filters.page,
      limit: filters.limit,
      status: filters.status ?? undefined,
      q: filters.q?.trim() || undefined,
      productId: filters.productId ?? undefined,
      inStockOnly: filters.inStockOnly ? true : undefined,
    },
    allowed,
  );
}

export interface AdminBatchKpis {
  summary: AdminBatchListMeta["summary"];
  total: number;
  /** Batches that still hold stock. */
  withStock: number;
  /** Expired batches still holding (unsellable) stock — candidates for a write-off. */
  expiredWithStock: number;
}

/** Store-wide batch health for the KPI strip (three `limit=1` reads; only `meta` is used). */
export function useBatchKpis() {
  const allowed = useCan(PERMISSIONS.BATCHES_MANAGE);
  const key: AdminKey | null = allowed ? ["/admin/batches#kpis", {}] : null;
  return useSWR<AdminBatchKpis, ApiError, AdminKey | null>(key, async () => {
    const read = (params: Record<string, string | number | boolean>) =>
      api.getPage<AdminBatchDTO, AdminBatchListMeta>("/admin/batches", { ...params, page: 1, limit: 1 });
    const [all, withStock, expired] = await Promise.all([
      read({}),
      read({ inStockOnly: true }),
      read({ status: "EXPIRED", inStockOnly: true }),
    ]);
    return {
      summary: all.meta.summary,
      total: all.meta.total,
      withStock: withStock.meta.total,
      expiredWithStock: expired.meta.total,
    };
  });
}

/** Stock writes: batch import (BATCHES_MANAGE) and adjustments (STOCK_ADJUST). */
export function useInventoryMutations() {
  const revalidate = useAdminRevalidate();

  const refresh = useCallback(
    () =>
      revalidate(
        "/admin/batches",
        "/admin/inventory",
        "/admin/catalog/products",
        "/admin/analytics",
      ),
    [revalidate],
  );

  const importBatch = useCallback(
    async (payload: AdminImportBatchPayload) => {
      const result = await api.post<AdminImportBatchResult>("/admin/inventory/batches", payload);
      await refresh();
      return result;
    },
    [refresh],
  );

  const adjustStock = useCallback(
    async (payload: AdminAdjustStockPayload) => {
      const result = await api.post<AdminAdjustStockResult>("/admin/inventory/adjust", payload);
      await refresh();
      return result;
    },
    [refresh],
  );

  return { importBatch, adjustStock };
}
