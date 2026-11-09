/**
 * SWR keys for customer order data. Every key ends with the viewer's user id so
 * a different account signing in on the same tab never sees cached orders.
 */
import type { QueryParams } from "../../lib/api-client";

export type OrderDetailKey = readonly [string, string];
export type OrderTrackingKey = readonly [string, string];
export type MyOrdersKey = readonly ["/orders/my-orders", QueryParams, string];

function encodeRef(ref: string): string {
  return encodeURIComponent(ref.trim());
}

/** `GET /orders/:idOrNumber` */
export function orderDetailPath(ref: string): string {
  return `/orders/${encodeRef(ref)}`;
}

/** `GET /orders/:orderNumber/track` */
export function orderTrackingPath(orderNumber: string): string {
  return `/orders/${encodeRef(orderNumber)}/track`;
}

export function orderDetailKey(ref: string, viewer: string): OrderDetailKey {
  return [orderDetailPath(ref), viewer] as const;
}

export function orderTrackingKey(orderNumber: string, viewer: string): OrderTrackingKey {
  return [orderTrackingPath(orderNumber), viewer] as const;
}

export function myOrdersKey(page: number, limit: number, viewer: string): MyOrdersKey {
  return ["/orders/my-orders", { page, limit }, viewer] as const;
}
