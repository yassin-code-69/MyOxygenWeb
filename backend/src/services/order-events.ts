/**
 * Side effects published AFTER an order transaction commits: customer
 * notifications (one job per channel, retried independently) and invoice
 * generation. Producers never wait for these jobs.
 */
import { enqueueJob } from "../jobs/queue";
import {
  ORDER_TEMPLATE_CHANNELS,
  type OrderNotificationTemplate,
} from "./notification/notification.interface";
import type { OrderStatus } from "./order-state-machine";

export const STATUS_NOTIFICATION_TEMPLATE: Readonly<Record<OrderStatus, OrderNotificationTemplate>> = {
  PENDING: "ORDER_CONFIRMED",
  PROCESSING: "ORDER_PROCESSING",
  SHIPPED: "ORDER_SHIPPED",
  DELIVERED: "ORDER_DELIVERED",
  CANCELLED: "ORDER_CANCELLED",
  REFUNDED: "ORDER_REFUNDED",
};

/** Queues the customer notifications for an order reaching `status`. */
export function publishOrderStatusEvent(orderId: string, status: OrderStatus): void {
  const template = STATUS_NOTIFICATION_TEMPLATE[status];
  for (const channel of ORDER_TEMPLATE_CHANNELS[template]) {
    // Each status is reached at most once per order, so the id de-duplicates retries of the producer.
    enqueueJob(
      "send-order-notification",
      { orderId, template, channel },
      { jobId: `notify-${orderId}-${template}-${channel}` },
    );
  }
}

/**
 * Queues PDF invoice generation. `revision` forces a rebuild (e.g. after the
 * payment status changed) and keeps the job id unique per revision.
 */
export function requestInvoice(orderId: string, revision?: string): void {
  enqueueJob(
    "generate-invoice",
    { orderId, regenerate: revision !== undefined },
    { jobId: revision === undefined ? `invoice-${orderId}` : `invoice-${orderId}-${revision}` },
  );
}
