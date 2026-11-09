"use client";

import { PERMISSIONS } from "../../types/auth";
import type { AdminTelemetrySummary } from "../../types/admin";
import { useAdminResource } from "./swr";
import { useCan } from "./use-permission";

export interface TelemetryRange {
  /** Inclusive `YYYY-MM-DD` (Dhaka). */
  from?: string | null;
  to?: string | null;
}

/**
 * `GET /admin/analytics/summary` (ANALYTICS_READ). Without a range the API
 * returns all-time totals and the last 30 days of daily revenue. The header
 * notifications and the dashboard share the no-range cache entry.
 */
export function useTelemetry(range: TelemetryRange = {}) {
  const allowed = useCan(PERMISSIONS.ANALYTICS_READ);
  const swr = useAdminResource<AdminTelemetrySummary>(
    "/admin/analytics/summary",
    { from: range.from ?? undefined, to: range.to ?? undefined },
    allowed,
    { keepPreviousData: true, refreshInterval: 120_000 },
  );
  return { ...swr, allowed };
}
