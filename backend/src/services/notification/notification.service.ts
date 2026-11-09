/**
 * Notification hub used by background jobs (never by HTTP handlers directly).
 *
 * Each call delivers ONE channel for ONE template so retries never re-send a
 * channel that already succeeded. Recipients are read from the database
 * (users.email / users.phone / users.full_name), not from the JWT. Every
 * attempt emits exactly one JSON log line:
 *
 *   {"level":"info","event":"notification","channel":"sms","template":"ORDER_CONFIRMED",
 *    "orderId":"…","status":"skipped","reason":"not configured (…)","attempt":1,"timestamp":"…"}
 */
import { asc, eq } from "drizzle-orm";
import { db } from "../../db/client";
import { orderItems, orders } from "../../db/schema/tables";
import { env } from "../../env";
import { readShippingAddress } from "../order-dto";
import { moneyToNumber } from "../order-pricing";
import { emailProvider } from "./email.service";
import type {
  DeliveryOutcome,
  EmailProvider,
  InventoryDigest,
  NotificationChannel,
  NotificationTemplate,
  OrderNotificationContext,
  OrderNotificationItem,
  OrderNotificationTemplate,
  SmsProvider,
} from "./notification.interface";
import { smsProvider } from "./sms.service";
import { renderInventoryDigestEmail, renderOrderEmail, renderOrderSms } from "./templates";

export interface OrderNotificationJob {
  orderId: string;
  template: OrderNotificationTemplate;
  channel: NotificationChannel;
}

export interface NotificationLogEntry {
  channel: NotificationChannel;
  template: NotificationTemplate;
  orderId: string | null;
  attempt: number;
  outcome: DeliveryOutcome;
}

export function logNotificationOutcome(entry: NotificationLogEntry): void {
  const { outcome } = entry;
  const line = JSON.stringify({
    level: outcome.status === "failed" ? "error" : "info",
    event: "notification",
    channel: entry.channel,
    template: entry.template,
    orderId: entry.orderId,
    status: outcome.status,
    reason: outcome.status === "sent" ? undefined : outcome.reason,
    retryable: outcome.status === "failed" ? outcome.retryable : undefined,
    messageId: outcome.status === "sent" ? outcome.messageId : undefined,
    attempt: entry.attempt,
    timestamp: new Date().toISOString(),
  });
  if (outcome.status === "failed") console.error(line);
  else console.log(line);
}

export type OrderContextLoader = (orderId: string) => Promise<OrderNotificationContext | null>;

/** Loads order, customer and product titles for templates. */
export async function loadOrderNotificationContext(orderId: string): Promise<OrderNotificationContext | null> {
  const row = await db.query.orders.findFirst({
    where: eq(orders.id, orderId),
    with: {
      user: { columns: { fullName: true, email: true, phone: true } },
      items: {
        orderBy: [asc(orderItems.productId)],
        with: { product: { columns: { title: true } } },
      },
    },
  });
  if (!row) return null;

  const byProduct = new Map<string, OrderNotificationItem>();
  for (const item of row.items) {
    const existing = byProduct.get(item.productId);
    const totalPrice = moneyToNumber(item.totalPrice);
    if (existing) {
      existing.quantity += item.quantity;
      existing.totalPrice = Math.round((existing.totalPrice + totalPrice) * 100) / 100;
    } else {
      byProduct.set(item.productId, {
        title: item.product?.title ?? "Product",
        quantity: item.quantity,
        unitPrice: moneyToNumber(item.unitPrice),
        totalPrice,
      });
    }
  }

  const frontendUrl = env.FRONTEND_URL?.replace(/\/+$/, "");
  return {
    orderId: row.id,
    orderNumber: row.orderNumber,
    status: row.status,
    customerName: row.user.fullName,
    email: row.user.email,
    phone: row.user.phone,
    paymentMethod: row.paymentMethod,
    subtotal: moneyToNumber(row.subtotal),
    deliveryFee: moneyToNumber(row.deliveryFee),
    discountAmount: moneyToNumber(row.discountAmount),
    total: moneyToNumber(row.total),
    items: [...byProduct.values()],
    shippingAddress: readShippingAddress(row.shippingAddress),
    courierProvider: row.courierProvider,
    trackingId: row.trackingId,
    orderUrl: frontendUrl ? `${frontendUrl}/orders/${encodeURIComponent(row.orderNumber)}` : null,
  };
}

export interface NotificationDependencies {
  email: EmailProvider;
  sms: SmsProvider;
  loadOrderContext: OrderContextLoader;
  adminAlertEmail: string | undefined;
}

export class NotificationService {
  private readonly deps: NotificationDependencies;

  constructor(deps: Partial<NotificationDependencies> = {}) {
    this.deps = {
      email: deps.email ?? emailProvider,
      sms: deps.sms ?? smsProvider,
      loadOrderContext: deps.loadOrderContext ?? loadOrderNotificationContext,
      adminAlertEmail: "adminAlertEmail" in deps ? deps.adminAlertEmail : env.ADMIN_ALERT_EMAIL,
    };
  }

  /** Delivers one channel of an order notification and logs the outcome. Never throws. */
  async sendOrderNotification(job: OrderNotificationJob, attempt = 1): Promise<DeliveryOutcome> {
    let outcome: DeliveryOutcome;
    try {
      outcome = await this.deliverOrderNotification(job);
    } catch (error) {
      outcome = {
        status: "failed",
        reason: error instanceof Error ? error.message : String(error),
        retryable: true,
      };
    }
    logNotificationOutcome({
      channel: job.channel,
      template: job.template,
      orderId: job.orderId,
      attempt,
      outcome,
    });
    return outcome;
  }

  /** Emails the daily inventory digest to ADMIN_ALERT_EMAIL and logs the outcome. Never throws. */
  async sendInventoryDigest(digest: InventoryDigest, attempt = 1): Promise<DeliveryOutcome> {
    let outcome: DeliveryOutcome;
    const recipient = this.deps.adminAlertEmail;
    if (!this.deps.email.isConfigured) {
      outcome = { status: "skipped", reason: "not configured (RESEND_API_KEY / EMAIL_FROM missing)" };
    } else if (!recipient) {
      outcome = { status: "skipped", reason: "not configured (ADMIN_ALERT_EMAIL missing)" };
    } else if (digest.lowStock.length === 0 && digest.expiringSoon.length === 0) {
      outcome = { status: "skipped", reason: "nothing to report" };
    } else {
      const rendered = renderInventoryDigestEmail(digest);
      try {
        outcome = await this.deps.email.send({
          to: recipient,
          subject: rendered.subject,
          html: rendered.html,
          text: rendered.text,
          idempotencyKey: `inventory-digest/${digest.generatedFor}`,
        });
      } catch (error) {
        outcome = {
          status: "failed",
          reason: error instanceof Error ? error.message : String(error),
          retryable: true,
        };
      }
    }
    logNotificationOutcome({ channel: "email", template: "INVENTORY_DIGEST", orderId: null, attempt, outcome });
    return outcome;
  }

  private async deliverOrderNotification(job: OrderNotificationJob): Promise<DeliveryOutcome> {
    if (job.channel === "email" && !this.deps.email.isConfigured) {
      return { status: "skipped", reason: "not configured (RESEND_API_KEY / EMAIL_FROM missing)" };
    }
    if (job.channel === "sms" && !this.deps.sms.isConfigured) {
      return { status: "skipped", reason: "not configured (SSL_WIRELESS_API_TOKEN / SSL_WIRELESS_SID missing)" };
    }

    const ctx = await this.deps.loadOrderContext(job.orderId);
    if (ctx === null) {
      return { status: "skipped", reason: "order not found" };
    }

    if (job.channel === "email") {
      if (!ctx.email) {
        return { status: "skipped", reason: "customer has no email address" };
      }
      const rendered = renderOrderEmail(job.template, ctx);
      return this.deps.email.send({
        to: ctx.email,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        idempotencyKey: `${job.orderId}/${job.template}`,
      });
    }

    if (!ctx.phone) {
      return { status: "skipped", reason: "customer has no phone number" };
    }
    return this.deps.sms.send({
      phone: ctx.phone,
      text: renderOrderSms(job.template, ctx),
      reference: `${job.orderId}/${job.template}`,
    });
  }
}

export const notificationService = new NotificationService();
