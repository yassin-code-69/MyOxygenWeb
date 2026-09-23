import type {
  NotificationPayload,
  NotificationSendResult,
} from "./notification.interface";
import { emailService, EmailService } from "./email.service";
import { smsService, SmsService } from "./sms.service";

export class NotificationService {
  constructor(
    private readonly email: EmailService = emailService,
    private readonly sms: SmsService = smsService,
  ) {}

  /**
   * Dispatches multi-channel order confirmation (Email + SMS) concurrently.
   * Employs Promise.allSettled fire-and-forget semantics so downstream errors
   * never interrupt order processing or throw back to caller.
   */
  async sendOrderConfirmation(
    payload: NotificationPayload,
  ): Promise<NotificationSendResult[]> {
    const promises: Promise<NotificationSendResult>[] = [];

    // 1. Queue SMS notification
    if (payload.recipientPhone) {
      const smsText = this.sms.generateOrderConfirmationSms(payload);
      promises.push(
        this.sms
          .sendSms(payload.recipientPhone, smsText)
          .catch((err) => ({
            success: false,
            channel: "SMS" as const,
            recipient: payload.recipientPhone,
            error: err.message,
          })),
      );
    }

    // 2. Queue Email notification if recipientEmail is provided
    if (payload.recipientEmail && payload.recipientEmail.includes("@")) {
      const html = this.email.renderOrderConfirmationHtml(payload);
      const subject = `Order Confirmed: #${payload.orderNumber} - My Oxygen`;
      promises.push(
        this.email
          .sendEmail(payload.recipientEmail, subject, html)
          .catch((err) => ({
            success: false,
            channel: "EMAIL" as const,
            recipient: payload.recipientEmail!,
            error: err.message,
          })),
      );
    }

    // Run fire-and-forget / non-blocking with allSettled
    const results = await Promise.allSettled(promises);

    const outcomes: NotificationSendResult[] = results.map((res, index) => {
      if (res.status === "fulfilled") {
        return res.value;
      }
      return {
        success: false,
        channel: index === 0 ? "SMS" : "EMAIL",
        recipient: payload.recipientPhone,
        error: String(res.reason || "Unknown dispatch failure"),
      };
    });

    return outcomes;
  }
}

export const notificationService = new NotificationService();
