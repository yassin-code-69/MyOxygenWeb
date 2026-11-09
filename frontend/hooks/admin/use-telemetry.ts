"use client";

import { useMemo } from "react";
import useSWR from "swr";
import { ApiError, swrFetcher, type QueryParams } from "../../lib/api-client";
import { addDaysToCalendarDate, todayInDhaka } from "../../components/admin/format";
import { PERMISSIONS } from "../../types/auth";
import type { AdminOrderDTO, AdminTelemetrySummary } from "../../types/admin";
import type { AdminDashboardSummary, AdminDateRange } from "../../types/admin-dashboard";
import { cleanParams, useAdminPage, useAdminResource, type AdminKey } from "./swr";
import { useCan } from "./use-permission";

const SUMMARY_PATH = "/admin/analytics/summary";
const REFRESH_MS = 120_000;

export interface TelemetryRange {
  /** Inclusive `YYYY-MM-DD` (Dhaka). */
  from?: string | null;
  to?: string | null;
}

/**
 * `GET /admin/analytics/summary` (ANALYTICS_READ), typed as the v1 summary.
 * Kept for existing callers; new code should use `useAdminSummary`.
 */
export function useTelemetry(range: TelemetryRange = {}) {
  const allowed = useCan(PERMISSIONS.ANALYTICS_READ);
  const swr = useAdminResource<AdminTelemetrySummary>(
    SUMMARY_PATH,
    { from: range.from ?? undefined, to: range.to ?? undefined },
    allowed,
    { keepPreviousData: true, refreshInterval: REFRESH_MS },
  );
  return { ...swr, allowed };
}

/** The last `days` Dhaka calendar days ending today (`days = 7` → today − 6 … today). */
export function lastDaysRange(days: number, today: string = todayInDhaka()): AdminDateRange {
  return { from: addDaysToCalendarDate(today, -(days - 1)), to: today };
}

/** Memoised `lastDaysRange` that only changes when the Dhaka date changes. */
export function useLastDaysRange(days: number): AdminDateRange {
  const today = todayInDhaka();
  return useMemo(() => lastDaysRange(days, today), [days, today]);
}

function isDashboardSummary(value: unknown): value is AdminDashboardSummary {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.kpis === "object" &&
    record.kpis !== null &&
    Array.isArray(record.revenueSeries) &&
    Array.isArray(record.salesByCategory) &&
    Array.isArray(record.latestCustomers) &&
    Array.isArray(record.lowStockProducts)
  );
}

/** Fetches the summary and rejects a pre-v2 payload instead of rendering half a dashboard. */
async function summaryFetcher(key: AdminKey): Promise<AdminDashboardSummary> {
  const data = await swrFetcher<unknown>(key);
  if (!isDashboardSummary(data)) {
    throw new ApiError(
      "The analytics service hasn't been updated for the new dashboard yet. Try again in a moment.",
      200,
      "INVALID_RESPONSE",
    );
  }
  return data;
}

/**
 * `GET /admin/analytics/summary?from&to` (v2, ANALYTICS_READ). The dashboard
 * and the shell alerts both ask for the last 7 days, so they share one cache
 * entry (one request).
 */
export function useAdminSummary(range: AdminDateRange) {
  const allowed = useCan(PERMISSIONS.ANALYTICS_READ);
  const key: AdminKey | null = allowed ? [SUMMARY_PATH, cleanParams({ from: range.from, to: range.to })] : null;
  const swr = useSWR<AdminDashboardSummary, ApiError, AdminKey | null>(key, summaryFetcher, {
    keepPreviousData: true,
    refreshInterval: REFRESH_MS,
  });
  return { ...swr, allowed };
}

export interface AdminAlertCounts {
  /** Every PENDING order (any date). `null` without ORDERS_READ or while unknown. */
  pendingOrders: number | null;
  /** Products at or below their alert level. `null` without ANALYTICS_READ or while unknown. */
  lowStock: number | null;
  /** Batches with stock expiring within 30 days. `null` without ANALYTICS_READ or while unknown. */
  expiringSoon: number | null;
}

const PENDING_PARAMS: QueryParams = { status: "PENDING", limit: 1, page: 1 };

/**
 * Real counts for the sidebar badges and the notifications bell.
 *
 * - Pending orders come from `GET /admin/orders?status=PENDING` (`meta.total`):
 *   the summary's `ordersByStatus` only covers its date range, which would hide
 *   older orders that still wait for action.
 * - Low stock / expiring come from the shared last-7-days summary (both are
 *   current-state counts, independent of the range).
 */
export function useAdminAlertCounts(): AdminAlertCounts {
  const canOrders = useCan(PERMISSIONS.ORDERS_READ);
  const range = useLastDaysRange(7);
  const summary = useAdminSummary(range);
  const pending = useAdminPage<AdminOrderDTO>("/admin/orders", { ...PENDING_PARAMS }, canOrders, {
    refreshInterval: REFRESH_MS,
  });

  return {
    pendingOrders: canOrders && pending.data ? pending.data.meta.total : null,
    lowStock: summary.allowed && summary.data ? summary.data.lowStockCount : null,
    expiringSoon: summary.allowed && summary.data ? summary.data.expiringSoonCount : null,
  };
}
