import type {
  ISmsProvider,
  NotificationPayload,
  NotificationSendResult,
} from "./notification.interface";

export interface SslWirelessConfig {
  apiToken?: string;
  sid?: string;
  baseUrl?: string;
  forceMock?: boolean;
}

export class SmsService implements ISmsProvider {
  readonly isMock: boolean;
  private readonly apiToken?: string;
  private readonly sid?: string;
  private readonly baseUrl: string;

  constructor(config?: SslWirelessConfig) {
    this.apiToken = config?.apiToken ?? process.env.SSL_WIRELESS_API_TOKEN;
    this.sid = config?.sid ?? process.env.SSL_WIRELESS_SID;
    this.baseUrl =
      config?.baseUrl ??
      process.env.SSL_WIRELESS_BASE_URL ??
      "https://smsplus.sslwireless.com/api/v3/send-sms";
    this.isMock = Boolean(config?.forceMock) || !this.apiToken || !this.sid;
  }

  /**
   * Generates standard My Oxygen order confirmation SMS text.
   */
  generateOrderConfirmationSms(payload: NotificationPayload): string {
    return `Dear ${payload.customerName}, your My Oxygen order ${payload.orderNumber} for ৳${payload.total} has been confirmed. Track at: myoxygen.com/orders/${payload.orderNumber}`;
  }

  /**
   * Formats a Bangladeshi telephone number to standard MSISDN (8801XXXXXXXXX).
   */
  normalizeMsisdn(phone: string): string {
    let clean = phone.replace(/[^0-9]/g, "");
    if (clean.startsWith("880")) {
      return clean;
    }
    if (clean.startsWith("01")) {
      return `88${clean}`;
    }
    return clean;
  }

  async sendSms(
    recipientPhone: string,
    message: string,
  ): Promise<NotificationSendResult> {
    const formattedPhone = this.normalizeMsisdn(recipientPhone);

    if (this.isMock) {
      const mockId = `mock-sms-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
      return {
        success: true,
        channel: "SMS",
        recipient: formattedPhone,
        messageId: mockId,
      };
    }

    try {
      const csmsId = `CSMS-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

      const response = await fetch(this.baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          api_token: this.apiToken,
          sid: this.sid,
          msisdn: formattedPhone,
          sms: message,
          csms_id: csmsId,
        }),
        signal: AbortSignal.timeout(8000),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `SSL Wireless SMS gateway error (${response.status}): ${errorText}`,
        );
      }

      const data = (await response.json()) as any;
      if (data.status_code && data.status_code !== 200 && data.status !== "SUCCESS") {
        throw new Error(
          `SSL Wireless returned error: ${data.status_message || JSON.stringify(data)}`,
        );
      }

      return {
        success: true,
        channel: "SMS",
        recipient: formattedPhone,
        messageId: data.smsinfo?.[0]?.sms_id || csmsId,
      };
    } catch (error: any) {
      return {
        success: false,
        channel: "SMS",
        recipient: formattedPhone,
        error: error.message || "Failed to dispatch SMS",
      };
    }
  }
}

export const smsService = new SmsService();
