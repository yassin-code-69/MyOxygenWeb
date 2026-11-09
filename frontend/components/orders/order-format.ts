/**
 * Display helpers for customer order pages. Timestamps are shown in Asia/Dhaka
 * (the store's timezone, `APP_TIMEZONE` on the API) regardless of the browser.
 */
import type { MantineColor } from "@mantine/core";
import type { CourierParcelStatus, OrderStatus, PaymentMethod } from "../../types/order";

const DHAKA = "Asia/Dhaka";

const dateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: DHAKA,
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: DHAKA,
  day: "numeric",
  month: "short",
  year: "numeric",
});

function toDate(iso: string | null | undefined): Date | null {
  if (!iso) {
    return null;
  }
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** `"9 Nov 2026, 5:31 pm"` in Dhaka time, or `null`. */
export function formatDhakaDateTime(iso: string | null | undefined): string | null {
  const date = toDate(iso);
  return date ? dateTimeFormatter.format(date) : null;
}

/** `"9 Nov 2026"` in Dhaka time, or `null`. */
export function formatDhakaDate(iso: string | null | undefined): string | null {
  const date = toDate(iso);
  return date ? dateFormatter.format(date) : null;
}

/** Order references accepted by the API (`[A-Za-z0-9-]{1,64}`). */
export const ORDER_REF_PATTERN = /^[A-Za-z0-9-]{1,64}$/;

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  COD: "Cash on delivery",
  ONLINE_GATEWAY: "Online payment",
};

/** Customer-facing copy for each order status (timeline + headers). */
export const ORDER_STATUS_COPY: Record<OrderStatus, { title: string; description: string }> = {
  PENDING: { title: "Order placed", description: "We've received your order." },
  PROCESSING: { title: "Processing", description: "Your order is being prepared for dispatch." },
  SHIPPED: { title: "Shipped", description: "Your parcel is with the courier." },
  DELIVERED: { title: "Delivered", description: "Your order has been delivered." },
  CANCELLED: { title: "Cancelled", description: "This order was cancelled." },
  REFUNDED: { title: "Refunded", description: "Your payment for this order was refunded." },
};

/** The normal fulfilment path (cancel / refund branch off it). */
export const FULFILMENT_FLOW: readonly OrderStatus[] = ["PENDING", "PROCESSING", "SHIPPED", "DELIVERED"];

export const COURIER_STATUS: Record<CourierParcelStatus, { label: string; color: MantineColor }> = {
  PENDING: { label: "Awaiting pickup", color: "warning" },
  APPROVAL_PENDING: { label: "Awaiting courier approval", color: "warning" },
  IN_TRANSIT: { label: "In transit", color: "info" },
  OUT_FOR_DELIVERY: { label: "Out for delivery", color: "accentPurple" },
  ON_HOLD: { label: "On hold", color: "warning" },
  DELIVERED: { label: "Delivered", color: "success" },
  PARTIALLY_DELIVERED: { label: "Partially delivered", color: "warning" },
  RETURNED: { label: "Returned to sender", color: "danger" },
  CANCELLED: { label: "Cancelled by courier", color: "danger" },
  UNKNOWN: { label: "Status unavailable", color: "gray" },
};

/** Human courier name (`STEADFAST` → `Steadfast`). */
export function formatCourierName(provider: string | null | undefined): string {
  if (!provider) {
    return "Courier";
  }
  return provider
    .toLowerCase()
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
