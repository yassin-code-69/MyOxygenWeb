"use client";

import { PERMISSIONS } from "../../types/auth";
import type { AdminActivityItem } from "../../types/admin-dashboard";
import { useAdminResource } from "./swr";
import { useCan } from "./use-permission";

/**
 * `GET /admin/analytics/activity?limit=` (ANALYTICS_READ) — newest first,
 * built only from real rows (orders, status history, sign-ups, stock moves,
 * discounts). `limit` is clamped to the API's 1–50.
 */
export function useAdminActivity(limit = 10) {
  const allowed = useCan(PERMISSIONS.ANALYTICS_READ);
  const safeLimit = Math.min(50, Math.max(1, Math.round(limit)));
  const swr = useAdminResource<AdminActivityItem[]>(
    "/admin/analytics/activity",
    { limit: safeLimit },
    allowed,
    { keepPreviousData: true, refreshInterval: 60_000 },
  );
  return { ...swr, allowed };
}
