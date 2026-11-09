"use client";

import { useCallback } from "react";
import { api } from "../../lib/api-client";
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
import { useAdminPage, useAdminRevalidate } from "./swr";
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
