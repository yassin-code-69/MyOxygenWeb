import type {
  IEmailProvider,
  NotificationPayload,
  NotificationSendResult,
} from "./notification.interface";

function escapeHtml(str: string): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export class EmailService implements IEmailProvider {
  readonly isMock: boolean;
  private readonly apiKey?: string;

  constructor(config?: { apiKey?: string; forceMock?: boolean }) {
    this.apiKey = config?.apiKey ?? process.env.RESEND_API_KEY;
    this.isMock = Boolean(config?.forceMock) || !this.apiKey;
  }

  renderOrderConfirmationHtml(payload: NotificationPayload): string {
    const safeCustomerName = escapeHtml(payload.customerName);
    const safeOrderNumber = escapeHtml(payload.orderNumber);

    const itemRows = payload.items
      .map(
        (item) => `
        <tr style="border-bottom: 1px solid #f0f0f0;">
          <td style="padding: 10px 0; color: #333; font-size: 14px;">${escapeHtml(item.title)}</td>
          <td style="padding: 10px 0; text-align: center; color: #666; font-size: 14px;">${item.quantity}</td>
          <td style="padding: 10px 0; text-align: right; color: #333; font-weight: 500; font-size: 14px;">৳${item.totalPrice}</td>
        </tr>`,
      )
      .join("");

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Order Confirmation - My Oxygen</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #fcf8f9; margin: 0; padding: 24px; color: #2d3748;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0">
    <tr>
      <td align="center">
        <table width="600" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);" border="0" cellspacing="0" cellpadding="0">
          <!-- Header Banner -->
          <tr>
            <td style="background-color: #FF6B8B; padding: 28px 32px; text-align: center; color: #ffffff;">
              <h1 style="margin: 0; font-size: 26px; font-weight: 700; letter-spacing: 0.5px;">MY OXYGEN</h1>
              <p style="margin: 6px 0 0 0; font-size: 13px; opacity: 0.95;">Premium Mother & Baby Care Essentials</p>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding: 32px;">
              <h2 style="margin: 0 0 16px 0; font-size: 20px; color: #1a202c;">Order Confirmed! 🎉</h2>
              <p style="margin: 0 0 20px 0; font-size: 15px; line-height: 1.5; color: #4a5568;">
                Dear <strong>${safeCustomerName}</strong>,<br>
                Thank you for choosing My Oxygen. Your order <strong>#${safeOrderNumber}</strong> has been received and is being prepared with utmost care.
              </p>

              <!-- Items Table -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 20px;">
                <thead>
                  <tr style="border-bottom: 2px solid #FF6B8B;">
                    <th align="left" style="padding: 8px 0; font-size: 12px; text-transform: uppercase; color: #FF6B8B;">Item</th>
                    <th align="center" style="padding: 8px 0; font-size: 12px; text-transform: uppercase; color: #FF6B8B;">Qty</th>
                    <th align="right" style="padding: 8px 0; font-size: 12px; text-transform: uppercase; color: #FF6B8B;">Total</th>
                  </tr>
                </thead>
                <tbody>
                  ${itemRows}
                </tbody>
              </table>

              <!-- Order Summary -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #faf5f7; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
                <tr>
                  <td style="font-size: 14px; color: #718096; padding-bottom: 6px;">Subtotal:</td>
                  <td align="right" style="font-size: 14px; color: #2d3748; padding-bottom: 6px;">৳${payload.subtotal}</td>
                </tr>
                <tr>
                  <td style="font-size: 14px; color: #718096; padding-bottom: 6px;">Delivery Fee:</td>
                  <td align="right" style="font-size: 14px; color: #2d3748; padding-bottom: 6px;">${parseFloat(String(payload.deliveryFee)) === 0 ? "FREE" : `৳${payload.deliveryFee}`}</td>
                </tr>
                ${
                  parseFloat(String(payload.discountAmount || 0)) > 0
                    ? `<tr>
                  <td style="font-size: 14px; color: #FF6B8B; padding-bottom: 6px;">Discount:</td>
                  <td align="right" style="font-size: 14px; color: #FF6B8B; padding-bottom: 6px;">-৳${payload.discountAmount}</td>
                </tr>`
                    : ""
                }
                <tr style="border-top: 1px solid #e2e8f0;">
                  <td style="font-size: 16px; font-weight: 700; color: #1a202c; padding-top: 10px;">Total Amount:</td>
                  <td align="right" style="font-size: 16px; font-weight: 700; color: #FF6B8B; padding-top: 10px;">৳${payload.total}</td>
                </tr>
              </table>

              <!-- CTA Button -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 24px;">
                <tr>
                  <td align="center">
                    <a href="https://myoxygen.com/orders/${payload.orderNumber}" style="background-color: #FF6B8B; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-size: 14px; font-weight: 600; display: inline-block;">
                      Track Order & View Invoice
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 0; font-size: 13px; line-height: 1.5; color: #718096; text-align: center;">
                Need assistance? Contact our mother & baby care team anytime at <a href="mailto:support@myoxygen.com" style="color: #FF6B8B; text-decoration: none;">support@myoxygen.com</a> or +880 1700-000000.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f7fafc; padding: 16px 32px; text-align: center; border-top: 1px solid #edf2f7; font-size: 12px; color: #a0aec0;">
              © 2026 My Oxygen Bangladesh. All rights reserved.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim();
  }

  async sendEmail(
    to: string,
    subject: string,
    html: string,
  ): Promise<NotificationSendResult> {
    if (this.isMock) {
      const mockId = `mock-email-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      return {
        success: true,
        channel: "EMAIL",
        recipient: to,
        messageId: mockId,
      };
    }

    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "My Oxygen <orders@myoxygen.com>",
          to: [to],
          subject,
          html,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Email provider error (${response.status}): ${errorText}`);
      }

      const data = (await response.json()) as any;
      return {
        success: true,
        channel: "EMAIL",
        recipient: to,
        messageId: data.id || `resend-${Date.now()}`,
      };
    } catch (error: any) {
      return {
        success: false,
        channel: "EMAIL",
        recipient: to,
        error: error.message || "Failed to send email",
      };
    }
  }
}

export const emailService = new EmailService();
