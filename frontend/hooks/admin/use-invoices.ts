"use client";

import { useCallback } from "react";
import { api } from "../../lib/api-client";
import { PERMISSIONS } from "../../types/auth";
import type { PaymentMethod, PaymentStatus } from "../../types/order";
import type { AdminInvoiceDTO, AdminInvoiceDetailDTO, AdminInvoiceSummary } from "../../types/admin";
import { useAdminPage, useAdminResource, useAdminRevalidate } from "./swr";
import { useCan } from "./use-permission";

export interface InvoiceFilters {
  page: number;
  limit: number;
  q?: string;
  paymentStatus?: PaymentStatus | "ALL";
  paymentMethod?: PaymentMethod | "ALL";
  from?: string | null;
  to?: string | null;
}

/** `GET /admin/invoices` (ORDERS_READ). */
export function useInvoices(filters: InvoiceFilters) {
  const allowed = useCan(PERMISSIONS.ORDERS_READ);
  return useAdminPage<AdminInvoiceDTO>(
    "/admin/invoices",
    {
      page: filters.page,
      limit: filters.limit,
      q: filters.q?.trim() || undefined,
      paymentStatus: filters.paymentStatus && filters.paymentStatus !== "ALL" ? filters.paymentStatus : undefined,
      paymentMethod: filters.paymentMethod && filters.paymentMethod !== "ALL" ? filters.paymentMethod : undefined,
      from: filters.from ?? undefined,
      to: filters.to ?? undefined,
    },
    allowed,
  );
}

/** `GET /admin/invoices/summary` (all invoices, unfiltered). */
export function useInvoiceSummary() {
  const allowed = useCan(PERMISSIONS.ORDERS_READ);
  return useAdminResource<AdminInvoiceSummary>("/admin/invoices/summary", {}, allowed);
}

/** `GET /admin/invoices/:id` with line items and the linked order. */
export function useInvoiceDetail(id: string | null) {
  const allowed = useCan(PERMISSIONS.ORDERS_READ);
  return useAdminResource<AdminInvoiceDetailDTO>(id ? `/admin/invoices/${id}` : null, {}, allowed);
}

/** `POST /admin/invoices/generate/:orderId` (INVOICE_GENERATE). */
export function useInvoiceMutations() {
  const revalidate = useAdminRevalidate();

  const regenerateInvoice = useCallback(
    async (orderId: string) => {
      const invoice = await api.post<AdminInvoiceDetailDTO>(`/admin/invoices/generate/${orderId}`);
      await revalidate("/admin/invoices");
      return invoice;
    },
    [revalidate],
  );

  return { regenerateInvoice };
}
