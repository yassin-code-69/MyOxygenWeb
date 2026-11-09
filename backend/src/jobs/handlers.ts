/**
 * Job handlers. A handler throws only for failures worth retrying; permanent
 * failures and "skipped" outcomes are logged by the services and complete the
 * job, so a bad phone number never burns through retries.
 */
import { adminTelemetryService } from "../services/admin-telemetry.service";
import { invoiceService } from "../services/invoice/invoice.service";
import type { DeliveryOutcome } from "../services/notification/notification.interface";
import { notificationService } from "../services/notification/notification.service";
import type { JobHandlers } from "./queue";

export class RetryableJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RetryableJobError";
  }
}

function throwIfRetryable(outcome: DeliveryOutcome): void {
  if (outcome.status === "failed" && outcome.retryable) {
    throw new RetryableJobError(outcome.reason);
  }
}

export const jobHandlers: JobHandlers = {
  "send-order-notification": async (payload, context) => {
    const outcome = await notificationService.sendOrderNotification(payload, context.attempt);
    throwIfRetryable(outcome);
  },

  "generate-invoice": async (payload) => {
    await invoiceService.ensureInvoice(payload.orderId, payload.regenerate === true);
  },

  "inventory-digest": async (_payload, context) => {
    const digest = await adminTelemetryService.getInventoryDigest();
    const outcome = await notificationService.sendInventoryDigest(digest, context.attempt);
    throwIfRetryable(outcome);
  },
};
