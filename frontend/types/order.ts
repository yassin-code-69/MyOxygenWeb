/**
 * Order, payment & checkout types — mirror `backend/src/db/schema/enums.ts`,
 * `backend/src/types/index.ts` and `backend/src/routes/orders.schema.ts`.
 */
import type { Money } from "./catalog";

export const ORDER_STATUSES = [
  "PENDING",
  "PROCESSING",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
  "REFUNDED",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_STATUSES = ["UNPAID", "PAID", "REFUNDED", "FAILED"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/** Methods stored on orders. */
export type PaymentMethod = "COD" | "ONLINE_GATEWAY";

/** Methods accepted by the checkout endpoint (`CASH_ON_DELIVERY` is an alias of `COD`). */
export type CheckoutPaymentMethod = PaymentMethod | "CASH_ON_DELIVERY";

/** Canonical shipping address (orders.shipping_address jsonb). */
export interface ShippingAddress {
  fullName: string;
  /** Bangladeshi mobile: `01[3-9]XXXXXXXX` (optionally +880 / 880 prefixed). */
  phone: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  district: string;
  /** 4-digit Bangladesh postcode. */
  postalCode: string;
}

export interface CartItemInput {
  productId: string;
  quantity: number;
}

export interface CheckoutPayload {
  shippingAddress: ShippingAddress;
  items: CartItemInput[];
  paymentMethod: CheckoutPaymentMethod;
  couponCode?: string;
}

export interface ValidateCouponPayload {
  code: string;
  items?: CartItemInput[];
}

/** @deprecated Pre-remediation shape. Use `OrderDetailItemDTO` (API contract `OrderItemDTO`). */
export interface OrderItemDTO {
  id: string;
  orderId: string;
  productId: string;
  batchId: string | null;
  quantity: number;
  unitPrice: Money;
  totalPrice: Money;
  product?: {
    id: string;
    title: string;
    slug?: string;
    sku?: string;
    images?: string[];
  } | null;
}

/** @deprecated Pre-remediation shape. Use `OrderStatusHistoryEntryDTO`. */
export interface OrderStatusHistoryDTO {
  id: string;
  orderId: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  changedBy: string | null;
  note: string | null;
  createdAt: string;
}

/** @deprecated Pre-remediation shape. Use `OrderDetailDTO` / `OrderSummaryDTO`. */
export interface OrderDTO {
  id: string;
  orderNumber: string;
  userId: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  shippingAddress: ShippingAddress;
  subtotal: Money;
  deliveryFee: Money;
  discountAmount: Money;
  total: Money;
  courierProvider: string | null;
  trackingId: string | null;
  createdAt: string;
  updatedAt: string;
  items?: OrderItemDTO[];
  statusHistory?: OrderStatusHistoryDTO[];
}

// ---------------------------------------------------------------------------
// API contract shapes (docs/API_CONTRACT.md — "Shared shapes" & "/orders")
// ---------------------------------------------------------------------------

/** Why `POST /orders/validate-coupon` rejected a code (`null` when valid). */
export type CouponReasonCode =
  | "NOT_FOUND"
  | "INACTIVE"
  | "NOT_STARTED"
  | "EXPIRED"
  | "NOT_APPLICABLE"
  | "MIN_ORDER_NOT_MET"
  | "USAGE_LIMIT_REACHED"
  | "PER_CUSTOMER_LIMIT_REACHED";

/** `data` of `POST /orders/validate-coupon` (an unusable coupon is still a 200 with `valid: false`). */
export interface CouponPreviewDTO {
  valid: boolean;
  code: string;
  reasonCode: CouponReasonCode | null;
  reason: string | null;
  couponType: "PERCENTAGE" | "FIXED_AMOUNT" | null;
  couponValue: number | null;
  scope: "ORDER" | "PRODUCT" | "CATEGORY" | null;
  minOrderAmount: number | null;
  maxDiscountAmount: number | null;
  subtotal: number;
  eligibleSubtotal: number;
  discountAmount: number;
  deliveryFee: number;
  total: number;
}

/** Body of `POST /orders/validate-coupon`. */
export interface CouponPreviewPayload {
  code: string;
  items: CartItemInput[];
}

/** One order line per batch the stock came from (API contract `OrderItemDTO`). */
export interface OrderDetailItemDTO {
  id: string;
  productId: string;
  productTitle: string;
  productSlug: string | null;
  productSku: string | null;
  productImage: string | null;
  batchId: string | null;
  batchNumber: string | null;
  /** `YYYY-MM-DD`. */
  batchExpiryDate: string | null;
  quantity: number;
  /** Effective price actually charged per unit. */
  unitPrice: number;
  totalPrice: number;
}

export interface OrderStatusHistoryEntryDTO {
  id: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  note: string | null;
  /** `null` for non-staff viewers. */
  changedBy: { id: string; fullName: string; role: string } | null;
  createdAt: string;
}

/** `data` of `GET /orders/:idOrNumber`, `POST /orders/checkout` and `POST /orders/:id/cancel`. */
export interface OrderDetailDTO {
  id: string;
  /** `ORD-YYYYMMDD-XXXXXXXX` (older orders use other formats). */
  orderNumber: string;
  userId: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  shippingAddress: ShippingAddress;
  subtotal: number;
  deliveryFee: number;
  discountAmount: number;
  total: number;
  couponCode: string | null;
  courierProvider: string | null;
  trackingId: string | null;
  /** API path `/orders/{id}/invoice` (authenticated PDF). */
  invoiceUrl: string;
  createdAt: string;
  updatedAt: string;
  shippedAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  customer: { id: string; fullName: string; email: string | null; phone: string };
  items: OrderDetailItemDTO[];
  statusHistory: OrderStatusHistoryEntryDTO[];
  allowedTransitions: OrderStatus[];
  /** True for the owner while the order is PENDING. */
  canCancel: boolean;
}

/** Product line inside an order summary (merged per product). */
export interface OrderSummaryItemDTO {
  productId: string;
  productTitle: string;
  productImage: string | null;
  quantity: number;
}

/** Row of `GET /orders/my-orders`. */
export interface OrderSummaryDTO {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  subtotal: number;
  deliveryFee: number;
  discountAmount: number;
  total: number;
  /** Sum of quantities. */
  itemCount: number;
  items: OrderSummaryItemDTO[];
  trackingId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Courier parcel status normalised across providers. */
export type CourierParcelStatus =
  | "PENDING"
  | "IN_TRANSIT"
  | "OUT_FOR_DELIVERY"
  | "ON_HOLD"
  | "APPROVAL_PENDING"
  | "DELIVERED"
  | "PARTIALLY_DELIVERED"
  | "RETURNED"
  | "CANCELLED"
  | "UNKNOWN";

/** `data` of `GET /orders/:orderNumber/track`. */
export interface OrderTrackingDTO {
  orderId: string;
  orderNumber: string;
  status: OrderStatus;
  courierProvider: string | null;
  trackingId: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  history: OrderStatusHistoryEntryDTO[];
  courier: {
    provider: string;
    trackingId: string;
    rawStatus: string | null;
    normalizedStatus: CourierParcelStatus;
    checkedAt: string;
  } | null;
  courierError: string | null;
}

/** Body of `POST /orders/:id/cancel`. */
export interface CancelOrderPayload {
  /** ≤300 characters. */
  reason?: string;
}

/** `details` of a 409 INSUFFICIENT_STOCK error. */
export interface InsufficientStockDetails {
  productId: string;
  requested: number;
  available: number;
}

/** `details` of a 422 INVALID_COUPON error. */
export interface InvalidCouponDetails {
  reasonCode: CouponReasonCode;
  code: string;
}
