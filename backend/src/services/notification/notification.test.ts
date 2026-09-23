import { describe, expect, it } from "bun:test";
import { emailService, EmailService } from "./email.service";
import { smsService, SmsService } from "./sms.service";
import { notificationService, NotificationService } from "./notification.service";
import type { NotificationPayload } from "./notification.interface";

describe("Notification Hub & Multi-Channel Dispatcher", () => {
  const samplePayload: NotificationPayload = {
    orderNumber: "ORD-998877",
    customerName: "Sharmin Akter",
    recipientEmail: "sharmin@example.com",
    recipientPhone: "01711223344",
    subtotal: 1600,
    deliveryFee: 0,
    discountAmount: 100,
    total: 1500,
    items: [
      {
        title: "Gentle Newborn Wash 250ml",
        quantity: 2,
        unitPrice: 800,
        totalPrice: 1600,
      },
    ],
  };

  describe("1. SMS Service & SSL Wireless Formatting", () => {
    it("should format SMS text conforming to Bangladesh notification standard", () => {
      const text = smsService.generateOrderConfirmationSms(samplePayload);
      expect(text).toBe(
        "Dear Sharmin Akter, your My Oxygen order ORD-998877 for ৳1500 has been confirmed. Track at: myoxygen.com/orders/ORD-998877",
      );
    });

    it("should normalize Bangladeshi mobile phone numbers to 8801XXXXXXXXX MSISDN", () => {
      expect(smsService.normalizeMsisdn("01711223344")).toBe("8801711223344");
      expect(smsService.normalizeMsisdn("+8801811223344")).toBe("8801811223344");
      expect(smsService.normalizeMsisdn("8801911223344")).toBe("8801911223344");
    });

    it("should send SMS successfully in mock mode", async () => {
      const result = await smsService.sendSms(
        samplePayload.recipientPhone,
        smsService.generateOrderConfirmationSms(samplePayload),
      );
      expect(result.success).toBe(true);
      expect(result.channel).toBe("SMS");
      expect(result.recipient).toBe("8801711223344");
      expect(result.messageId).toMatch(/^mock-sms-/);
    });
  });

  describe("2. Email Service & Branded Template", () => {
    it("should render branded HTML email containing items, order number, and brand pink #FF6B8B", () => {
      const html = emailService.renderOrderConfirmationHtml(samplePayload);
      expect(html).toContain("MY OXYGEN");
      expect(html).toContain("#FF6B8B");
      expect(html).toContain("ORD-998877");
      expect(html).toContain("Sharmin Akter");
      expect(html).toContain("Gentle Newborn Wash 250ml");
      expect(html).toContain("৳1500");
    });

    it("should send email successfully in mock mode", async () => {
      const result = await emailService.sendEmail(
        samplePayload.recipientEmail!,
        "Order Confirmed",
        emailService.renderOrderConfirmationHtml(samplePayload),
      );
      expect(result.success).toBe(true);
      expect(result.channel).toBe("EMAIL");
      expect(result.recipient).toBe(samplePayload.recipientEmail!);
      expect(result.messageId).toMatch(/^mock-email-/);
    });
  });

  describe("3. Notification Hub (Fire-and-Forget Multi-Channel)", () => {
    it("should dispatch both Email and SMS concurrently", async () => {
      const results = await notificationService.sendOrderConfirmation(samplePayload);
      expect(results.length).toBe(2);

      const smsResult = results.find((r) => r.channel === "SMS");
      const emailResult = results.find((r) => r.channel === "EMAIL");

      expect(smsResult?.success).toBe(true);
      expect(emailResult?.success).toBe(true);
    });

    it("should dispatch SMS only if email is absent", async () => {
      const payloadWithoutEmail: NotificationPayload = {
        ...samplePayload,
        recipientEmail: undefined,
      };

      const results =
        await notificationService.sendOrderConfirmation(payloadWithoutEmail);
      expect(results.length).toBe(1);
      expect(results[0].channel).toBe("SMS");
      expect(results[0].success).toBe(true);
    });

    it("should never throw error if a channel encounters failure (resilience)", async () => {
      const failingSmsService = new SmsService({ forceMock: false, apiToken: "" });
      // Force failure on sendSms
      (failingSmsService as any).sendSms = async () => {
        throw new Error("Gateway connection timeout");
      };

      const resilientHub = new NotificationService(emailService, failingSmsService);

      // Must not throw
      const results = await resilientHub.sendOrderConfirmation(samplePayload);
      expect(results.length).toBe(2);

      const smsResult = results.find((r) => r.channel === "SMS");
      const emailResult = results.find((r) => r.channel === "EMAIL");

      expect(smsResult?.success).toBe(false);
      expect(smsResult?.error).toContain("Gateway connection timeout");
      expect(emailResult?.success).toBe(true);
    });
  });
});
