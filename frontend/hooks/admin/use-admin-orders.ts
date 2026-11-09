"use client";

import { useCallback } from "react";
import useSWR, { type KeyedMutator } from "swr";
import { api, type ApiError, type Page } from "../../lib/api-client";
import { PERMISSIONS } from "../../types/auth";
import type { OrderStatus, PaymentMethod, PaymentStatus } from "../../types/order";
import {
  ADMIN_ORDER_STATUSES,
  type AdminDispatchPayload,
  type AdminDispatchResult,
  type AdminOrderDTO,
  type AdminOrderDetailDTO,
  type AdminOrderStatusPayload,
  type AdminOrderTrackingDTO,
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

export interface AdminOrderFilters {
  page: number;
  limit: number;
  status?: OrderStatus | "ALL";
  q?: string;
  /** Inclusive Dhaka day `YYYY-MM-DD`. */
  from?: string | null;
  to?: string | null;
  paymentStatus?: PaymentStatus | "ALL";
  paymentMethod?: PaymentMethod | "ALL";
}

export type AdminOrdersPage = Page<AdminOrderDTO, PaginationMeta>;

/** The filters every status shares (everything except the status itself and paging). */
function sharedOrderParams(filters: Omit<AdminOrderFilters, "page" | "limit" | "status">) {
  return {
    q: filters.q?.trim() || undefined,
    from: filters.from ?? undefined,
    to: filters.to ?? undefined,
    paymentStatus: filters.paymentStatus && filters.paymentStatus !== "ALL" ? filters.paymentStatus : undefined,
    paymentMethod: filters.paymentMethod && filters.paymentMethod !== "ALL" ? filters.paymentMethod : undefined,
  };
}

/** `GET /admin/orders` (ORDERS_READ). */
export function useAdminOrders(filters: AdminOrderFilters) {
  const allowed = useCan(PERMISSIONS.ORDERS_READ);
  return useAdminPage<AdminOrderDTO>(
    "/admin/orders",
    {
      page: filters.page,
      limit: filters.limit,
      status: filters.status && filters.status !== "ALL" ? filters.status : undefined,
      ...sharedOrderParams(filters),
    },
    allowed,
    { refreshInterval: 60_000 },
  );
}

export type AdminOrderStatusCounts = Record<OrderStatus, number>;

/**
 * Orders per status for the status tabs, honouring the other filters (search,
 * dates, payment). One `limit=1` request per status — only `meta.total` is
 * read — so the counts always match what each tab will list.
 */
export function useOrderStatusCounts(filters: Omit<AdminOrderFilters, "page" | "limit" | "status">) {
  const allowed = useCan(PERMISSIONS.ORDERS_READ);
  const key: AdminKey | null = allowed ? ["/admin/orders#status-counts", cleanParams(sharedOrderParams(filters))] : null;
  return useSWR<AdminOrderStatusCounts, ApiError, AdminKey | null>(
    key,
    async ([, params]: AdminKey) => {
      const totals = await Promise.all(
        ADMIN_ORDER_STATUSES.map(async (status) => {
          const page = await api.getPage<AdminOrderDTO>("/admin/orders", { ...params, status, page: 1, limit: 1 });
          return [status, page.meta.total] as const;
        }),
      );
      const counts: AdminOrderStatusCounts = { PENDING: 0, PROCESSING: 0, SHIPPED: 0, DELIVERED: 0, CANCELLED: 0, REFUNDED: 0 };
      for (const [status, total] of totals) {
        counts[status] = total;
      }
      return counts;
    },
    { keepPreviousData: true, refreshInterval: 60_000 },
  );
}

/** `GET /orders/:id` (staff with ORDERS_READ see the full detail incl. history). */
export function useAdminOrderDetail(id: string | null) {
  const allowed = useCan(PERMISSIONS.ORDERS_READ);
  return useAdminResource<AdminOrderDetailDTO>(id ? `/orders/${id}` : null, {}, allowed);
}

/** `GET /admin/orders/:id/tracking` — live courier status (may carry `courierError`). */
export function useAdminOrderTracking(id: string | null) {
  const allowed = useCan(PERMISSIONS.ORDERS_READ);
  return useAdminResource<AdminOrderTrackingDTO>(id ? `/admin/orders/${id}/tracking` : null, {}, allowed, {
    revalidateOnFocus: false,
  });
}

/** Folds an order detail (PATCH / dispatch response) into a list row. */
export function mergeOrderDetail(row: AdminOrderDTO, detail: AdminOrderDetailDTO): AdminOrderDTO {
  return {
    ...row,
    status: detail.status,
    paymentStatus: detail.paymentStatus,
    courierProvider: detail.courierProvider,
    trackingId: detail.trackingId,
    allowedTransitions: detail.allowedTransitions,
    updatedAt: detail.updatedAt,
    shippedAt: detail.shippedAt,
    deliveredAt: detail.deliveredAt,
    cancelledAt: detail.cancelledAt,
  };
}

/** Order writes: status changes (ORDERS_STATUS_UPDATE, REFUNDS_APPROVE) and courier dispatch (COURIER_ASSIGN). */
export function useOrderMutations() {
  const revalidate = useAdminRevalidate();

  const refresh = useCallback(
    () =>
      revalidate(
        "/admin/orders",
        "/orders/",
        "/admin/invoices",
        "/admin/analytics",
        "/admin/batches",
        "/admin/inventory",
        "/admin/catalog/products",
      ),
    [revalidate],
  );

  /**
   * `PATCH /admin/orders/:id/status`. With the list on screen the row shows the
   * new status immediately (actions disabled until the server answers).
   */
  const changeStatus = useCallback(
    async (
      id: string,
      payload: AdminOrderStatusPayload,
      list?: { mutate: KeyedMutator<AdminOrdersPage>; current: AdminOrdersPage | undefined },
    ) => {
      const request = () => api.patch<AdminOrderDetailDTO>(`/admin/orders/${id}/status`, payload);
      const detail = list
        ? await updateItemOptimistically({
            mutate: list.mutate,
            current: list.current,
            id,
            optimistic: (row) => ({ ...row, status: payload.status, allowedTransitions: [] }),
            request,
            merge: mergeOrderDetail,
          })
        : await request();
      await refresh();
      return detail;
    },
    [refresh],
  );

  /** `POST /admin/orders/:id/dispatch-courier` — only for PROCESSING orders without a tracking id. */
  const dispatchCourier = useCallback(
    async (id: string, payload: AdminDispatchPayload) => {
      const result = await api.post<AdminDispatchResult>(`/admin/orders/${id}/dispatch-courier`, payload);
      await refresh();
      return result;
    },
    [refresh],
  );

  return { changeStatus, dispatchCourier };
}
