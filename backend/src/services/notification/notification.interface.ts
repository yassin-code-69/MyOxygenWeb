export interface NotificationPayload {
  orderNumber: string;
  customerName: string;
  recipientEmail?: string | null;
  recipientPhone: string;
  subtotal: number | string;
  deliveryFee: number | string;
  discountAmount?: number | string;
  total: number | string;
  items: Array<{
    title: string;
    quantity: number;
    unitPrice: number | string;
    totalPrice: number | string;
  }>;
  shippingAddress?: string | Record<string, any> | null;
  trackingId?: string | null;
}

export interface NotificationSendResult {
  success: boolean;
  messageId?: string;
  channel: "EMAIL" | "SMS";
  recipient: string;
  error?: string;
}

export interface IEmailProvider {
  readonly isMock: boolean;
  sendEmail(
    to: string,
    subject: string,
    html: string,
  ): Promise<NotificationSendResult>;
}

export interface ISmsProvider {
  readonly isMock: boolean;
  sendSms(
    recipientPhone: string,
    message: string,
  ): Promise<NotificationSendResult>;
}
