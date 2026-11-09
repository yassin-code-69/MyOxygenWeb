/**
 * Order DTOs returned by the API. Money is always a JSON number (taka with
 * up to two decimals); timestamps are ISO-8601 strings.
 */
import type { paymentMethodEnum, paymentStatusEnum } from "../db/schema/enums";
import type { ShippingAddress, UserRole } from "../types";
import { allowedTransitions, CUSTOMER_CANCELLABLE_STATUSES, type OrderStatus } from "./order-state-machine";
import { moneyToNumber } from "./order-pricing";

export type PaymentMethod = (typeof paymentMethodEnum.enumValues)[number];
export type PaymentStatus = (typeof paymentStatusEnum.enumValues)[number];

export interface OrderCustomerDTO {
  id: string;
  fullName: string;
  email: string | null;
  phone: string;
}

/** One order_items row: a product quantity drawn from one batch (FEFO split). */
export interface OrderItemDTO {
  id: string;
  productId: string;
  productTitle: string;
  productSlug: string | null;
  productSku: string | null;
  productImage: string | null;
  batchId: string | null;
  batchNumber: string | null;
  batchExpiryDate: string | null;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface OrderStatusHistoryEntryDTO {
  id: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  note: string | null;
  /** Staff viewers only; always null for customers. */
  changedBy: { id: string; fullName: string; role: UserRole } | null;
  createdAt: string;
}

export interface OrderDetailDTO {
  id: string;
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
  /** API path that streams the PDF invoice (generated on first request). */
  invoiceUrl: string;
  createdAt: string;
  updatedAt: string;
  shippedAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  customer: OrderCustomerDTO;
  items: OrderItemDTO[];
  statusHistory: OrderStatusHistoryEntryDTO[];
  /** Next statuses allowed by the state machine (for staff UIs). */
  allowedTransitions: OrderStatus[];
  /** True while the customer may cancel the order themselves (PENDING). */
  canCancel: boolean;
}

/** Per-product summary line used by order lists (batch splits merged). */
export interface OrderLineSummaryDTO {
  productId: string;
  productTitle: string;
  productImage: string | null;
  quantity: number;
}

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
  itemCount: number;
  items: OrderLineSummaryDTO[];
  trackingId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminOrderListItemDTO {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  subtotal: number;
  deliveryFee: number;
  discountAmount: number;
  total: number;
  itemCount: number;
  couponCode: string | null;
  courierProvider: string | null;
  trackingId: string | null;
  shippingAddress: ShippingAddress;
  customer: OrderCustomerDTO;
  items: OrderItemDTO[];
  allowedTransitions: OrderStatus[];
  createdAt: string;
  updatedAt: string;
  shippedAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
}

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

export function isoOrNull(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function readString(record: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return undefined;
}

/**
 * Reads orders.shipping_address defensively. Rows written by this service are
 * already a ShippingAddress; legacy rows (JSON strings, `recipientName`,
 * `address`) are mapped onto the canonical shape.
 */
export function readShippingAddress(value: unknown): ShippingAddress {
  let source: unknown = value;
  if (typeof source === "string") {
    try {
      source = JSON.parse(source) as unknown;
    } catch {
      source = { addressLine1: value };
    }
  }
  const record: Record<string, unknown> =
    typeof source === "object" && source !== null ? (source as Record<string, unknown>) : {};

  const address: ShippingAddress = {
    fullName: readString(record, "fullName", "recipientName") ?? "",
    phone: readString(record, "phone", "recipientPhone") ?? "",
    addressLine1: readString(record, "addressLine1", "address") ?? "",
    city: readString(record, "city") ?? "",
    district: readString(record, "district") ?? "",
    postalCode: readString(record, "postalCode") ?? "",
  };
  const addressLine2 = readString(record, "addressLine2");
  if (addressLine2 !== undefined) address.addressLine2 = addressLine2;
  return address;
}

/** Single-line address for couriers, invoices and notifications. */
export function formatShippingAddress(address: ShippingAddress): string {
  return [address.addressLine1, address.addressLine2, address.city, address.district, address.postalCode]
    .filter((part): part is string => typeof part === "string" && part.length > 0)
    .join(", ");
}

interface ItemRowLike {
  id: string;
  productId: string;
  batchId: string | null;
  quantity: number;
  unitPrice: string;
  totalPrice: string;
  product: { title: string; slug: string; sku: string; images: string[] } | null;
  batch: { batchNumber: string; expiryDate: string } | null;
}

export function toOrderItemDTO(item: ItemRowLike): OrderItemDTO {
  return {
    id: item.id,
    productId: item.productId,
    productTitle: item.product?.title ?? "Product",
    productSlug: item.product?.slug ?? null,
    productSku: item.product?.sku ?? null,
    productImage: item.product?.images[0] ?? null,
    batchId: item.batchId,
    batchNumber: item.batch?.batchNumber ?? null,
    batchExpiryDate: item.batch?.expiryDate ?? null,
    quantity: item.quantity,
    unitPrice: moneyToNumber(item.unitPrice),
    totalPrice: moneyToNumber(item.totalPrice),
  };
}

/** Merges batch-level rows into one line per product (first-seen order). */
export function summarizeLines(items: readonly OrderItemDTO[]): OrderLineSummaryDTO[] {
  const byProduct = new Map<string, OrderLineSummaryDTO>();
  for (const item of items) {
    const existing = byProduct.get(item.productId);
    if (existing) {
      existing.quantity += item.quantity;
    } else {
      byProduct.set(item.productId, {
        productId: item.productId,
        productTitle: item.productTitle,
        productImage: item.productImage,
        quantity: item.quantity,
      });
    }
  }
  return [...byProduct.values()];
}

export function customerCanCancel(status: OrderStatus): boolean {
  return CUSTOMER_CANCELLABLE_STATUSES.includes(status);
}

export function nextStatuses(status: OrderStatus): OrderStatus[] {
  return [...allowedTransitions(status)];
}
