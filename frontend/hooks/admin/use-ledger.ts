"use client";

import { api, type QueryParams } from "../../lib/api-client";
import { collectPages, type CollectPagesOptions } from "../../lib/csv";
import { PERMISSIONS } from "../../types/auth";
import type { AdminLedgerEntryDTO, AdminLedgerReason } from "../../types/admin";
import { cleanParams, useAdminPage } from "./swr";
import { useCan } from "./use-permission";

export interface LedgerFilters {
  page: number;
  limit: number;
  reason?: AdminLedgerReason | null;
  productId?: string | null;
  orderId?: string | null;
  batchId?: string | null;
  /** Inclusive Dhaka day `YYYY-MM-DD`. */
  from?: string | null;
  to?: string | null;
}

function toParams(filters: Omit<LedgerFilters, "page" | "limit">): QueryParams {
  return cleanParams({
    reason: filters.reason ?? undefined,
    productId: filters.productId ?? undefined,
    orderId: filters.orderId ?? undefined,
    batchId: filters.batchId ?? undefined,
    from: filters.from ?? undefined,
    to: filters.to ?? undefined,
  });
}

/** `GET /admin/inventory/ledger` (STOCK_ADJUST) — `data[]` + `meta`, newest first. */
export function useLedger(filters: LedgerFilters) {
  const allowed = useCan(PERMISSIONS.STOCK_ADJUST);
  return useAdminPage<AdminLedgerEntryDTO>(
    "/admin/inventory/ledger",
    { page: filters.page, limit: filters.limit, ...toParams(filters) },
    allowed,
  );
}

/** Every ledger row matching the filters (sequential pages of 100, capped at 5,000 rows). */
export function fetchLedgerForExport(
  filters: Omit<LedgerFilters, "page" | "limit">,
  options?: CollectPagesOptions,
) {
  const params = toParams(filters);
  return collectPages(
    (page) => api.getPage<AdminLedgerEntryDTO>("/admin/inventory/ledger", { ...params, page, limit: 100 }),
    options,
  );
}
