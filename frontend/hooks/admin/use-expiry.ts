"use client";

/**
 * Expiry / FEFO page data (BATCHES_MANAGE).
 *
 * Both lists are read in full (pages of 100, capped at 1,000 rows) so the KPI
 * sums — units and value at risk — are exact. The expiring list is fetched for
 * `max(window, 30)` days, so the fixed "next 7 / 30 days" KPIs can be derived
 * from it with the API's own rule (`0 < daysUntilExpiry ≤ days`) whatever
 * window is selected.
 *
 * Stock writes (`useInventoryMutations`) revalidate both keys through their
 * `/admin/inventory` and `/admin/batches` prefixes.
 */
import useSWR from "swr";
import { api, type ApiError } from "../../lib/api-client";
import { collectPages, type CollectedPages } from "../../lib/csv";
import { PERMISSIONS } from "../../types/auth";
import type { AdminBatchDTO, AdminBatchListMeta } from "../../types/admin";
import type { AdminKey } from "./swr";
import { useCan } from "./use-permission";

export const EXPIRY_WINDOWS = [7, 30, 60, 90] as const;
export type ExpiryWindow = (typeof EXPIRY_WINDOWS)[number];

/** The KPI strip always needs the next 30 days. */
const MIN_FETCH_DAYS = 30;

const ROW_CAP = 1000;
const OPTIONS = { revalidateOnFocus: true, refreshInterval: 5 * 60_000, keepPreviousData: true } as const;

/**
 * `GET /admin/inventory/expiring-soon?days=` for the selected window (at least
 * 30 days) — sellable batches with stock, soonest first.
 */
export function useExpiringBatches(windowDays: ExpiryWindow) {
  const allowed = useCan(PERMISSIONS.BATCHES_MANAGE);
  const days = Math.max(windowDays, MIN_FETCH_DAYS);
  const key: AdminKey | null = allowed ? ["/admin/inventory/expiring-soon#all", { days }] : null;
  return useSWR<CollectedPages<AdminBatchDTO>, ApiError, AdminKey | null>(
    key,
    ([, params]: AdminKey) =>
      collectPages(
        (page) => api.getPage<AdminBatchDTO>("/admin/inventory/expiring-soon", { ...params, page, limit: 100 }),
        { maxRows: ROW_CAP },
      ),
    OPTIONS,
  );
}

/** `GET /admin/batches?status=EXPIRED&inStockOnly=true` — expired batches still holding (unsellable) stock. */
export function useExpiredStock() {
  const allowed = useCan(PERMISSIONS.BATCHES_MANAGE);
  const key: AdminKey | null = allowed ? ["/admin/batches#expired-stock", {}] : null;
  return useSWR<CollectedPages<AdminBatchDTO>, ApiError, AdminKey | null>(
    key,
    () =>
      collectPages(
        (page) =>
          api.getPage<AdminBatchDTO, AdminBatchListMeta>("/admin/batches", {
            status: "EXPIRED",
            inStockOnly: true,
            page,
            limit: 100,
          }),
        { maxRows: ROW_CAP },
      ),
    OPTIONS,
  );
}

/** Batches of `rows` expiring within `days` (today excluded, as the API counts them). */
export function withinDays(rows: readonly AdminBatchDTO[], days: number): AdminBatchDTO[] {
  return rows.filter((batch) => batch.daysUntilExpiry > 0 && batch.daysUntilExpiry <= days);
}
