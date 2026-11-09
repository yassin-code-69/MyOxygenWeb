"use client";

import { PERMISSIONS } from "../../types/auth";
import type { AdminOrderDTO, AdminOrderTrackingDTO } from "../../types/admin";
import type { AdminDateRange } from "../../types/admin-dashboard";
import type { AdminDeliverySummary } from "../../types/admin-management";
import { useAdminPage, useAdminResource } from "./swr";
import { useCan } from "./use-permission";

const REFRESH_MS = 60_000;

/** `GET /admin/delivery/summary?from&to` (ORDERS_READ). */
export function useDeliverySummary(range: AdminDateRange) {
  const allowed = useCan(PERMISSIONS.ORDERS_READ);
  return useAdminResource<AdminDeliverySummary>(
    "/admin/delivery/summary",
    { from: range.from, to: range.to },
    allowed,
    { keepPreviousData: true, refreshInterval: REFRESH_MS },
  );
}

/** The delivery board's queues. */
export const DELIVERY_QUEUES = ["ready", "transit", "delivered"] as const;
export type DeliveryQueue = (typeof DELIVERY_QUEUES)[number];

export const DELIVERY_QUEUE_STATUS = {
  ready: "PROCESSING",
  transit: "SHIPPED",
  delivered: "DELIVERED",
} as const satisfies Record<DeliveryQueue, AdminOrderDTO["status"]>;

export interface DeliveryOrderFilters {
  queue: DeliveryQueue;
  page: number;
  limit: number;
  q?: string;
  /** Applied to the delivered queue only (filtered on the delivery date). */
  range: AdminDateRange;
}

/**
 * Orders of one delivery queue via `GET /admin/orders` (ORDERS_READ):
 * ready to ship = PROCESSING, in transit = SHIPPED (both live, any date),
 * delivered = DELIVERED orders delivered in the range (dateField=deliveredAt),
 * matching the summary's deliveredInRange.
 */
export function useDeliveryOrders(filters: DeliveryOrderFilters) {
  const allowed = useCan(PERMISSIONS.ORDERS_READ);
  const ranged = filters.queue === "delivered";
  return useAdminPage<AdminOrderDTO>(
    "/admin/orders",
    {
      status: DELIVERY_QUEUE_STATUS[filters.queue],
      page: filters.page,
      limit: filters.limit,
      q: filters.q?.trim() || undefined,
      from: ranged ? filters.range.from : undefined,
      to: ranged ? filters.range.to : undefined,
      dateField: ranged ? "deliveredAt" : undefined,
    },
    allowed,
    { refreshInterval: REFRESH_MS },
  );
}

/** `GET /admin/orders/:id/tracking` (ORDERS_READ): timeline + live courier status. Pass `null` to skip. */
export function useShipmentTracking(orderId: string | null) {
  const allowed = useCan(PERMISSIONS.ORDERS_READ);
  return useAdminResource<AdminOrderTrackingDTO>(orderId ? `/admin/orders/${orderId}/tracking` : null, {}, allowed, {
    revalidateOnFocus: false,
    keepPreviousData: false,
  });
}
