import type { OrderStatus } from "../../../types/order";
import type { AdminCourierCancellation, AdminOrderDTO } from "../../../types/admin";
import { isApiError } from "../../../lib/api-client";

/** Fields every order action needs (list rows and detail DTOs both satisfy it). */
export type OrderRef = Pick<
  AdminOrderDTO,
  "id" | "orderNumber" | "status" | "allowedTransitions" | "trackingId" | "courierProvider" | "paymentMethod" | "paymentStatus" | "total"
>;

export const TRANSITION_LABELS: Record<OrderStatus, string> = {
  PENDING: "Move back to pending",
  PROCESSING: "Accept (start processing)",
  SHIPPED: "Mark as shipped",
  DELIVERED: "Mark as delivered",
  CANCELLED: "Cancel order",
  REFUNDED: "Mark as refunded",
};

export interface OrderPermissions {
  canUpdateStatus: boolean;
  canApproveRefunds: boolean;
  canAssignCourier: boolean;
}

/** Transitions the API allows for this order that the user may perform. */
export function visibleTransitions(order: OrderRef, permissions: OrderPermissions): OrderStatus[] {
  if (!permissions.canUpdateStatus) {
    return [];
  }
  return order.allowedTransitions.filter((status) => status !== "REFUNDED" || permissions.canApproveRefunds);
}

/** Courier dispatch needs a PROCESSING order without a tracking id. */
export function canDispatch(order: OrderRef, permissions: OrderPermissions): boolean {
  return permissions.canAssignCourier && order.status === "PROCESSING" && !order.trackingId;
}

/** `details.courierCancellation` of the 409 raised when cancelling a shipped order. */
export function readCourierCancellation(error: unknown): AdminCourierCancellation | null {
  if (!isApiError(error) || error.code !== "CONFLICT") {
    return null;
  }
  const details = error.details;
  if (typeof details !== "object" || details === null || !("courierCancellation" in details)) {
    return null;
  }
  const value = details.courierCancellation;
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const record = value as Partial<AdminCourierCancellation>;
  if (typeof record.message !== "string" || typeof record.trackingId !== "string") {
    return null;
  }
  return {
    provider: typeof record.provider === "string" ? record.provider : "courier",
    trackingId: record.trackingId,
    status: record.status === "CANCELLED" || record.status === "FAILED" ? record.status : "NOT_SUPPORTED",
    message: record.message,
  };
}

/** `"steadfast"` → `"Steadfast"`. */
export function courierName(provider: string | null | undefined): string {
  if (!provider) {
    return "the courier";
  }
  return provider.charAt(0).toUpperCase() + provider.slice(1).toLowerCase();
}
