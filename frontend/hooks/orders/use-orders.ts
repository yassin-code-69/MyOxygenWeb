"use client";

import { useCallback } from "react";
import useSWR, { useSWRConfig } from "swr";
import { api, swrPageFetcher, type ApiError, type Page } from "../../lib/api-client";
import { useAuthStore } from "../../lib/auth-store";
import type { CancelOrderPayload, OrderDetailDTO, OrderSummaryDTO, OrderTrackingDTO } from "../../types/order";
import {
  myOrdersKey,
  orderDetailKey,
  orderTrackingKey,
  type MyOrdersKey,
  type OrderDetailKey,
  type OrderTrackingKey,
} from "./keys";

function useViewer(): { viewer: string | null } {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const userId = useAuthStore((state) => state.user?.id ?? null);
  return { viewer: isAuthenticated ? userId : null };
}

/** `GET /orders/:idOrNumber` → `OrderDetailDTO` (owner only). */
export function useOrder(orderNumber: string, enabled = true) {
  const { viewer } = useViewer();
  const key = enabled && viewer && orderNumber ? orderDetailKey(orderNumber, viewer) : null;
  const { data, error, isLoading, isValidating, mutate } = useSWR<OrderDetailDTO, ApiError, OrderDetailKey | null>(
    key,
    ([path]) => api.get<OrderDetailDTO>(path),
    { revalidateOnFocus: false, shouldRetryOnError: false }
  );
  return { order: data ?? null, error: error ?? null, isLoading: isLoading || (key !== null && !data && !error), isValidating, mutate };
}

/** `GET /orders/my-orders` (newest first, paginated). */
export function useMyOrders(page: number, limit: number, enabled = true) {
  const { viewer } = useViewer();
  const key = enabled && viewer ? myOrdersKey(page, limit, viewer) : null;
  const { data, error, isLoading, isValidating, mutate } = useSWR<Page<OrderSummaryDTO>, ApiError, MyOrdersKey | null>(
    key,
    ([path, params]) => swrPageFetcher<OrderSummaryDTO>([path, params]),
    { keepPreviousData: true, revalidateOnFocus: false, shouldRetryOnError: false }
  );
  return {
    orders: data?.items ?? [],
    meta: data?.meta ?? null,
    error: error ?? null,
    isLoading: isLoading || (key !== null && !data && !error),
    isValidating,
    mutate,
  };
}

/** `GET /orders/:orderNumber/track` → `OrderTrackingDTO`. */
export function useOrderTracking(orderNumber: string, enabled = true) {
  const { viewer } = useViewer();
  const key = enabled && viewer && orderNumber ? orderTrackingKey(orderNumber, viewer) : null;
  const { data, error, isLoading, isValidating, mutate } = useSWR<OrderTrackingDTO, ApiError, OrderTrackingKey | null>(
    key,
    ([path]) => api.get<OrderTrackingDTO>(path),
    { revalidateOnFocus: false, shouldRetryOnError: false }
  );
  return { tracking: data ?? null, error: error ?? null, isLoading: isLoading || (key !== null && !data && !error), isValidating, mutate };
}

/** Customer actions on an order: cancel (PENDING only) and invoice download. */
export function useOrderActions() {
  const { mutate } = useSWRConfig();
  const { viewer } = useViewer();

  const cancelOrder = useCallback(
    async (order: Pick<OrderDetailDTO, "id" | "orderNumber">, reason?: string): Promise<OrderDetailDTO> => {
      const trimmed = reason?.trim();
      const body: CancelOrderPayload = trimmed ? { reason: trimmed } : {};
      const updated = await api.post<OrderDetailDTO>(`/orders/${encodeURIComponent(order.id)}/cancel`, body);
      if (viewer) {
        await mutate(orderDetailKey(order.orderNumber, viewer), updated, { revalidate: false });
        void mutate(orderTrackingKey(order.orderNumber, viewer));
      }
      void mutate((key) => Array.isArray(key) && key[0] === "/orders/my-orders", undefined, { revalidate: true });
      return updated;
    },
    [mutate, viewer]
  );

  /** Saves the invoice PDF through the authenticated client (a plain link would 401). */
  const downloadInvoice = useCallback(async (order: Pick<OrderDetailDTO, "id" | "orderNumber" | "invoiceUrl">) => {
    // Only ever send the bearer token to our own API: accept the contract's relative path.
    const path =
      order.invoiceUrl.startsWith("/") && !order.invoiceUrl.startsWith("//")
        ? order.invoiceUrl
        : `/orders/${encodeURIComponent(order.id)}/invoice`;
    await api.download(path, `My-Oxygen-Invoice-${order.orderNumber}.pdf`);
  }, []);

  return { cancelOrder, downloadInvoice };
}
