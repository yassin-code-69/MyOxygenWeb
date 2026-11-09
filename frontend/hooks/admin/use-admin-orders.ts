"use client";

import { useCallback } from "react";
import type { KeyedMutator } from "swr";
import { api, type Page } from "../../lib/api-client";
import { PERMISSIONS } from "../../types/auth";
import type { OrderStatus } from "../../types/order";
import type {
  AdminDispatchPayload,
  AdminDispatchResult,
  AdminOrderDTO,
  AdminOrderDetailDTO,
  AdminOrderStatusPayload,
  AdminOrderTrackingDTO,
} from "../../types/admin";
import type { PaginationMeta } from "../../types/api";
import { updateItemOptimistically, useAdminPage, useAdminResource, useAdminRevalidate } from "./swr";
import { useCan } from "./use-permission";

export interface AdminOrderFilters {
  page: number;
  limit: number;
  status?: OrderStatus | "ALL";
  q?: string;
  /** Inclusive Dhaka day `YYYY-MM-DD`. */
  from?: string | null;
  to?: string | null;
}

export type AdminOrdersPage = Page<AdminOrderDTO, PaginationMeta>;

/** `GET /admin/orders` (ORDERS_READ). */
export function useAdminOrders(filters: AdminOrderFilters) {
  const allowed = useCan(PERMISSIONS.ORDERS_READ);
  return useAdminPage<AdminOrderDTO>(
    "/admin/orders",
    {
      page: filters.page,
      limit: filters.limit,
      status: filters.status && filters.status !== "ALL" ? filters.status : undefined,
      q: filters.q?.trim() || undefined,
      from: filters.from ?? undefined,
      to: filters.to ?? undefined,
    },
    allowed,
    { refreshInterval: 60_000 },
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
