"use client";

import { useCallback } from "react";
import { api } from "../../lib/api-client";
import { PERMISSIONS } from "../../types/auth";
import type { AdminDateRange } from "../../types/admin-dashboard";
import type {
  AdminCustomer,
  AdminCustomerDetail,
  AdminCustomerListItem,
  AdminCustomerReport,
  AdminCustomerSort,
} from "../../types/admin-management";
import { useAdminPage, useAdminResource, useAdminRevalidate } from "./swr";
import { useCan } from "./use-permission";

export interface CustomerFilters {
  page: number;
  limit: number;
  /** Name, email or phone (any format, partial digits allowed). */
  q?: string;
  sort: AdminCustomerSort;
}

/** `GET /admin/customers` (ORDERS_READ). */
export function useCustomers(filters: CustomerFilters) {
  const allowed = useCan(PERMISSIONS.ORDERS_READ);
  return useAdminPage<AdminCustomerListItem>(
    "/admin/customers",
    {
      page: filters.page,
      limit: filters.limit,
      q: filters.q?.trim() || undefined,
      sort: filters.sort,
    },
    allowed,
  );
}

/** `GET /admin/customers/:id` (ORDERS_READ). Pass `null` to skip. */
export function useCustomerDetail(id: string | null) {
  const allowed = useCan(PERMISSIONS.ORDERS_READ);
  return useAdminResource<AdminCustomerDetail>(id ? `/admin/customers/${id}` : null, {}, allowed, {
    keepPreviousData: false,
  });
}

/**
 * Customer KPIs from `GET /admin/reports/customers` (ANALYTICS_READ only —
 * `allowed` is false otherwise and nothing is requested). `limit=1` because
 * only the KPI block is used.
 */
export function useCustomerKpis(range: AdminDateRange) {
  const allowed = useCan(PERMISSIONS.ANALYTICS_READ);
  const swr = useAdminResource<AdminCustomerReport>(
    "/admin/reports/customers",
    { from: range.from, to: range.to, page: 1, limit: 1 },
    allowed,
    { keepPreviousData: true },
  );
  return { ...swr, allowed };
}

/** Customer writes (`PATCH /admin/customers/:id`, STAFF_MANAGE). */
export function useCustomerMutations() {
  const revalidate = useAdminRevalidate();

  const setCustomerActive = useCallback(
    async (id: string, isActive: boolean) => {
      const customer = await api.patch<AdminCustomer>(`/admin/customers/${id}`, { isActive });
      await revalidate("/admin/customers", "/admin/reports/customers", "/admin/search");
      return customer;
    },
    [revalidate],
  );

  return { setCustomerActive };
}
