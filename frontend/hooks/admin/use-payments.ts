"use client";

import { PERMISSIONS } from "../../types/auth";
import type { AdminOrderDTO } from "../../types/admin";
import type { AdminDateRange } from "../../types/admin-dashboard";
import type { AdminPaymentSummary } from "../../types/admin-management";
import type { OrderStatus, PaymentMethod, PaymentStatus } from "../../types/order";
import { useAdminPage, useAdminResource } from "./swr";
import { useCan } from "./use-permission";

const REFRESH_MS = 120_000;

/** `GET /admin/payments/summary?from&to` (ORDERS_READ) — orders placed in the range. */
export function usePaymentSummary(range: AdminDateRange) {
  const allowed = useCan(PERMISSIONS.ORDERS_READ);
  return useAdminResource<AdminPaymentSummary>(
    "/admin/payments/summary",
    { from: range.from, to: range.to },
    allowed,
    { keepPreviousData: true, refreshInterval: REFRESH_MS },
  );
}

export interface PaymentOrderFilters {
  page: number;
  limit: number;
  range: AdminDateRange;
  paymentStatus?: PaymentStatus | "ALL";
  paymentMethod?: PaymentMethod | "ALL";
  status?: OrderStatus | "ALL";
  /** Order number, customer name, phone or email. */
  q?: string;
}

/** Orders as transactions: `GET /admin/orders` with payment filters (ORDERS_READ). */
export function usePaymentOrders(filters: PaymentOrderFilters) {
  const allowed = useCan(PERMISSIONS.ORDERS_READ);
  return useAdminPage<AdminOrderDTO>(
    "/admin/orders",
    {
      page: filters.page,
      limit: filters.limit,
      from: filters.range.from,
      to: filters.range.to,
      paymentStatus: filters.paymentStatus && filters.paymentStatus !== "ALL" ? filters.paymentStatus : undefined,
      paymentMethod: filters.paymentMethod && filters.paymentMethod !== "ALL" ? filters.paymentMethod : undefined,
      status: filters.status && filters.status !== "ALL" ? filters.status : undefined,
      q: filters.q?.trim() || undefined,
    },
    allowed,
  );
}

/**
 * How many REFUNDED orders in the range do not carry the REFUNDED payment
 * status (should be zero: the REFUNDED transition sets it). Two `limit=1`
 * counts; `null` while unknown.
 */
export function useRefundStatusGap(range: AdminDateRange): number | null {
  const allowed = useCan(PERMISSIONS.ORDERS_READ);
  const base = { page: 1, limit: 1, from: range.from, to: range.to, status: "REFUNDED" };
  const all = useAdminPage<AdminOrderDTO>("/admin/orders", base, allowed);
  const matching = useAdminPage<AdminOrderDTO>("/admin/orders", { ...base, paymentStatus: "REFUNDED" }, allowed);
  if (!all.data || !matching.data) {
    return null;
  }
  return Math.max(0, all.data.meta.total - matching.data.meta.total);
}
