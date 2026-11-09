/**
 * Notification contracts. Every delivery attempt resolves to an honest
 * outcome — "sent", "skipped" (not configured / no recipient) or "failed" —
 * and is logged as one structured JSON line (see notification.service.ts).
 */
import type { ShippingAddress } from "../../types";

export const NOTIFICATION_CHANNELS = ["email", "sms"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const ORDER_NOTIFICATION_TEMPLATES = [
  "ORDER_CONFIRMED",
  "ORDER_PROCESSING",
  "ORDER_SHIPPED",
  "ORDER_DELIVERED",
  "ORDER_CANCELLED",
  "ORDER_REFUNDED",
] as const;
export type OrderNotificationTemplate = (typeof ORDER_NOTIFICATION_TEMPLATES)[number];

export type NotificationTemplate = OrderNotificationTemplate | "INVENTORY_DIGEST";

/** Channels used per order template (SMS is reserved for events the customer must act on). */
export const ORDER_TEMPLATE_CHANNELS: Readonly<Record<OrderNotificationTemplate, readonly NotificationChannel[]>> = {
  ORDER_CONFIRMED: ["email", "sms"],
  ORDER_PROCESSING: ["email"],
  ORDER_SHIPPED: ["email", "sms"],
  ORDER_DELIVERED: ["email", "sms"],
  ORDER_CANCELLED: ["email", "sms"],
  ORDER_REFUNDED: ["email", "sms"],
};

export type DeliveryOutcome =
  | { status: "sent"; messageId: string | null }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string; retryable: boolean };

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Lets the provider drop duplicates when a job is retried. */
  idempotencyKey?: string;
}

export interface EmailProvider {
  readonly isConfigured: boolean;
  send(message: EmailMessage): Promise<DeliveryOutcome>;
}

export interface SmsMessage {
  /** Raw phone number; the provider normalises it to an MSISDN. */
  phone: string;
  text: string;
  /** Stable per-message reference (also used to de-duplicate retries). */
  reference: string;
}

export interface SmsProvider {
  readonly isConfigured: boolean;
  send(message: SmsMessage): Promise<DeliveryOutcome>;
}

export interface OrderNotificationItem {
  title: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

/** Everything a template needs, loaded from the database (never from the JWT). */
export interface OrderNotificationContext {
  orderId: string;
  orderNumber: string;
  status: string;
  customerName: string;
  email: string | null;
  phone: string | null;
  paymentMethod: string;
  subtotal: number;
  deliveryFee: number;
  discountAmount: number;
  total: number;
  items: OrderNotificationItem[];
  shippingAddress: ShippingAddress;
  courierProvider: string | null;
  trackingId: string | null;
  /** Storefront order page, when FRONTEND_URL is configured. */
  orderUrl: string | null;
}

export interface InventoryDigestLowStockItem {
  productId: string;
  title: string;
  sku: string;
  availableStock: number;
  lowStockThreshold: number;
}

export interface InventoryDigestExpiringBatch {
  batchId: string;
  productTitle: string;
  sku: string;
  batchNumber: string;
  expiryDate: string;
  daysUntilExpiry: number;
  availableQuantity: number;
}

export interface InventoryDigest {
  generatedFor: string;
  lowStock: InventoryDigestLowStockItem[];
  expiringSoon: InventoryDigestExpiringBatch[];
}
