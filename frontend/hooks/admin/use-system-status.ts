"use client";

import { useState } from "react";
import { PERMISSIONS } from "../../types/auth";
import type { AdminSystemStatus } from "../../types/admin-management";
import { useAdminResource } from "./swr";
import { useCan } from "./use-permission";

/** Auto-refresh period of the system status page. */
export const SYSTEM_STATUS_REFRESH_MS = 30_000;

/**
 * `GET /admin/system/status` (STAFF_MANAGE), refreshed every 30 s. Never
 * carries secrets. `checkedAt` is when the last successful answer arrived.
 */
export function useSystemStatus() {
  const allowed = useCan(PERMISSIONS.STAFF_MANAGE);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const swr = useAdminResource<AdminSystemStatus>("/admin/system/status", {}, allowed, {
    keepPreviousData: true,
    refreshInterval: SYSTEM_STATUS_REFRESH_MS,
    revalidateOnFocus: true,
    onSuccess: () => setCheckedAt(new Date()),
  });
  return { ...swr, checkedAt };
}
