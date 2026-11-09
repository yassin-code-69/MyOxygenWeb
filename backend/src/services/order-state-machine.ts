/**
 * Order lifecycle state machine (pure, no I/O).
 *
 *   PENDING ──► PROCESSING ──► SHIPPED ──► DELIVERED ──► REFUNDED
 *      │             │             │
 *      └─────────────┴─────────────┴──► CANCELLED
 *
 * CANCELLED and REFUNDED are terminal. Cancelling releases the stock
 * reservation and the coupon redemption (see order-status.service.ts);
 * cancelling a SHIPPED order first asks the courier to cancel the parcel.
 */
import { orderStatusEnum } from "../db/schema/enums";
import { AppError } from "../lib/errors";

export const ORDER_STATUSES = orderStatusEnum.enumValues;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  PENDING: ["PROCESSING", "CANCELLED"],
  PROCESSING: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["DELIVERED", "CANCELLED"],
  DELIVERED: ["REFUNDED"],
  CANCELLED: [],
  REFUNDED: [],
};

/** Statuses a customer may cancel from (staff can cancel up to SHIPPED). */
export const CUSTOMER_CANCELLABLE_STATUSES: readonly OrderStatus[] = ["PENDING"];

/** Statuses whose revenue counts (everything except CANCELLED and REFUNDED). */
export const REVENUE_EXCLUDED_STATUSES: readonly OrderStatus[] = ["CANCELLED", "REFUNDED"];

export function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === "string" && (ORDER_STATUSES as readonly string[]).includes(value);
}

export function allowedTransitions(from: OrderStatus): readonly OrderStatus[] {
  return ORDER_STATUS_TRANSITIONS[from];
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_STATUS_TRANSITIONS[from].includes(to);
}

export function isTerminalStatus(status: OrderStatus): boolean {
  return ORDER_STATUS_TRANSITIONS[status].length === 0;
}

/** Throws 409 INVALID_STATUS_TRANSITION unless `from → to` is allowed. */
export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (canTransition(from, to)) return;
  const message =
    from === to
      ? `Order is already ${to}`
      : isTerminalStatus(from)
        ? `Order is ${from} and can no longer change status`
        : `Cannot change order status from ${from} to ${to}`;
  throw AppError.invalidStatusTransition(from, to, message);
}
