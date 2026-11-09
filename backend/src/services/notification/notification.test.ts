import { afterEach, describe, expect, it, spyOn } from "bun:test";
import { ResendEmailProvider, type FetchLike } from "./email.service";
import type {
  DeliveryOutcome,
  EmailMessage,
  EmailProvider,
  OrderNotificationContext,
  SmsMessage,
  SmsProvider,
} from "./notification.interface";
import { NotificationService } from "./notification.service";
import { csmsIdFor, SslWirelessSmsProvider } from "./sms.service";
import { renderOrderEmail, renderOrderSms } from "./templates";
import { normalizeBangladeshMobile, toBangladeshMsisdn } from "../phone";

const ORDER_ID = "3f0c1d9e-8a5b-4c2d-9e1f-0a1b2c3d4e5f";

const context: OrderNotificationContext = {
  orderId: ORDER_ID,
  orderNumber: "ORD-20261109-ABCD2345",
  status: "PENDING",
  customerName: "Sharmin <Akter>",
  email: "sharmin@example.com",
  phone: "01711223344",
  paymentMethod: "COD",
  subtotal: 1600,
  deliveryFee: 0,
  discountAmount: 100,
  total: 1500,
  items: [
    { title: "Gentle Newborn Wash 250ml", quantity: 2, unitPrice: 800, totalPrice: 1600 },
    { title: '<script>alert("x")</script> Lotion', quantity: 1, unitPrice: 0, totalPrice: 0 },
  ],
  shippingAddress: {
    fullName: "Sharmin Akter",
    phone: "01711223344",
    addressLine1: "House 12, Road 5",
    city: "Dhaka",
    district: "Dhaka",
    postalCode: "1205",
  },
  courierProvider: "steadfast",
  trackingId: "15BAEB8A",
  orderUrl: "https://shop.example.com/orders/ORD-20261109-ABCD2345",
};

class RecordingEmail implements EmailProvider {
  readonly sent: EmailMessage[] = [];
  constructor(
    readonly isConfigured: boolean,
    private readonly outcome: DeliveryOutcome = { status: "sent", messageId: "em_1" },
  ) {}
  async send(message: EmailMessage): Promise<DeliveryOutcome> {
    this.sent.push(message);
    return this.outcome;
  }
}

class RecordingSms implements SmsProvider {
  readonly sent: SmsMessage[] = [];
  constructor(readonly isConfigured: boolean) {}
  async send(message: SmsMessage): Promise<DeliveryOutcome> {
    this.sent.push(message);
    return { status: "sent", messageId: "sms_1" };
  }
}

function captureLogs() {
  const lines: Array<Record<string, unknown>> = [];
  const record = (...args: unknown[]) => {
    for (const arg of args) {
      if (typeof arg !== "string") continue;
      try {
        const parsed = JSON.parse(arg) as unknown;
        if (typeof parsed === "object" && parsed !== null) lines.push(parsed as Record<string, unknown>);
      } catch {
        // not a JSON log line
      }
    }
  };
  const log = spyOn(console, "log").mockImplementation(record);
  const error = spyOn(console, "error").mockImplementation(record);
  return {
    lines,
    restore: () => {
      log.mockRestore();
      error.mockRestore();
    },
  };
}

describe("Phone normalisation", () => {
  it("normalises Bangladeshi mobile numbers to 01XXXXXXXXX and MSISDN 8801XXXXXXXXX", () => {
    expect(normalizeBangladeshMobile("+8801712345678")).toBe("01712345678");
    expect(normalizeBangladeshMobile("8801712345678")).toBe("01712345678");
    expect(normalizeBangladeshMobile("1712345678")).toBe("01712345678");
    expect(normalizeBangladeshMobile("01712-345 678")).toBe("01712345678");
    expect(normalizeBangladeshMobile("01212345678")).toBeNull();
    expect(normalizeBangladeshMobile("+14155552671")).toBeNull();
    expect(toBangladeshMsisdn("01911223344")).toBe("8801911223344");
  });
});

describe("Templates", () => {
  it("escapes HTML and shows product titles instead of ids", () => {
    const email = renderOrderEmail("ORDER_CONFIRMED", context);
    expect(email.subject).toContain("ORD-20261109-ABCD2345");
    expect(email.html).toContain("Gentle Newborn Wash 250ml");
    expect(email.html).toContain("Sharmin &lt;Akter&gt;");
    expect(email.html).toContain("&lt;script&gt;");
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("৳1,500.00");
    expect(email.text).toContain("Gentle Newborn Wash 250ml x2");
  });

  it("keeps SMS bodies ASCII with tracking details", () => {
    const shipped = renderOrderSms("ORDER_SHIPPED", context);
    expect(shipped).toContain("ORD-20261109-ABCD2345");
    expect(shipped).toContain("Steadfast Courier");
    expect(shipped).toContain("15BAEB8A");
    expect(/^[\x20-\x7E]*$/.test(renderOrderSms("ORDER_CONFIRMED", context))).toBe(true);
  });
});

describe("Resend email provider", () => {
  it("is skipped (not sent) when not configured", async () => {
    const provider = new ResendEmailProvider({ apiKey: "", from: "" });
    const outcome = await provider.send({ to: "a@example.com", subject: "s", html: "<p>h</p>", text: "h" });
    expect(outcome.status).toBe("skipped");
  });

  it("sends with EMAIL_FROM, an idempotency key and reports the Resend id", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
    const fetchImpl: FetchLike = async (url, init) => {
      requests.push({ url, init });
      return new Response(JSON.stringify({ id: "re_123" }), { status: 200 });
    };
    const provider = new ResendEmailProvider({ apiKey: "re_test", from: "My Oxygen <orders@example.com>", fetchImpl });
    const outcome = await provider.send({
      to: "a@example.com",
      subject: "Hello",
      html: "<p>Hi</p>",
      text: "Hi",
      idempotencyKey: `${ORDER_ID}/ORDER_CONFIRMED`,
    });
    expect(outcome).toEqual({ status: "sent", messageId: "re_123" });
    expect(requests[0]?.url).toBe("https://api.resend.com/emails");
    const headers = new Headers(requests[0]?.init?.headers);
    expect(headers.get("Authorization")).toBe("Bearer re_test");
    expect(headers.get("Idempotency-Key")).toBe(`${ORDER_ID}/ORDER_CONFIRMED`);
    const body = JSON.parse(String(requests[0]?.init?.body)) as { from: string; to: string[] };
    expect(body.from).toBe("My Oxygen <orders@example.com>");
    expect(body.to).toEqual(["a@example.com"]);
  });

  it("marks 5xx as retryable and 4xx as permanent failures", async () => {
    const failing = (status: number) =>
      new ResendEmailProvider({
        apiKey: "re_test",
        from: "orders@example.com",
        fetchImpl: async () => new Response("{}", { status }),
      });
    const serverError = await failing(503).send({ to: "a@example.com", subject: "s", html: "h", text: "h" });
    expect(serverError).toMatchObject({ status: "failed", retryable: true });
    const clientError = await failing(422).send({ to: "a@example.com", subject: "s", html: "h", text: "h" });
    expect(clientError).toMatchObject({ status: "failed", retryable: false });
  });
});

describe("SSL Wireless SMS provider", () => {
  it("sends to the normalised MSISDN with a deterministic csms_id", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const provider = new SslWirelessSmsProvider({
      apiToken: "token",
      sid: "MYOXYGEN",
      fetchImpl: async (_url, init) => {
        bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return new Response(
          JSON.stringify({ status: "SUCCESS", status_code: 200, smsinfo: [{ sms_status: "SUCCESS", reference_id: "ref-9" }] }),
          { status: 200 },
        );
      },
    });
    const outcome = await provider.send({ phone: "+8801711223344", text: "Hello", reference: `${ORDER_ID}/ORDER_CONFIRMED` });
    expect(outcome).toEqual({ status: "sent", messageId: "ref-9" });
    expect(bodies[0]?.msisdn).toBe("8801711223344");
    expect(bodies[0]?.csms_id).toBe(csmsIdFor(`${ORDER_ID}/ORDER_CONFIRMED`));
    expect(String(bodies[0]?.csms_id)).toHaveLength(20);
  });

  it("reports gateway rejections and invalid numbers as permanent failures", async () => {
    const provider = new SslWirelessSmsProvider({
      apiToken: "token",
      sid: "MYOXYGEN",
      fetchImpl: async () =>
        new Response(JSON.stringify({ status: "FAILED", status_code: 4001, error_message: "Invalid SID" }), { status: 200 }),
    });
    expect(await provider.send({ phone: "01711223344", text: "x", reference: "r" })).toMatchObject({
      status: "failed",
      retryable: false,
    });
    expect(await provider.send({ phone: "12345", text: "x", reference: "r" })).toMatchObject({
      status: "failed",
      retryable: false,
    });
  });
});

describe("Notification service", () => {
  let restore: (() => void) | null = null;
  afterEach(() => {
    restore?.();
    restore = null;
  });

  it("logs a structured 'skipped: not configured' outcome when provider keys are absent", async () => {
    const logs = captureLogs();
    restore = logs.restore;
    let loaderCalls = 0;
    const service = new NotificationService({
      email: new ResendEmailProvider({ apiKey: "", from: "" }),
      sms: new SslWirelessSmsProvider({ apiToken: "", sid: "" }),
      loadOrderContext: async () => {
        loaderCalls += 1;
        return context;
      },
    });

    const email = await service.sendOrderNotification({ orderId: ORDER_ID, template: "ORDER_CONFIRMED", channel: "email" });
    const sms = await service.sendOrderNotification({ orderId: ORDER_ID, template: "ORDER_CONFIRMED", channel: "sms" }, 2);

    expect(email.status).toBe("skipped");
    expect(sms.status).toBe("skipped");
    expect(loaderCalls).toBe(0);

    const entries = logs.lines.filter((line) => line.event === "notification");
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      level: "info",
      channel: "email",
      template: "ORDER_CONFIRMED",
      orderId: ORDER_ID,
      status: "skipped",
      attempt: 1,
    });
    expect(String(entries[0]?.reason)).toStartWith("not configured");
    expect(entries[1]).toMatchObject({ channel: "sms", status: "skipped", attempt: 2 });
    expect(String(entries[1]?.reason)).toStartWith("not configured");
  });

  it("sends to the recipient loaded from the database record and logs 'sent'", async () => {
    const logs = captureLogs();
    restore = logs.restore;
    const email = new RecordingEmail(true);
    const sms = new RecordingSms(true);
    const service = new NotificationService({ email, sms, loadOrderContext: async () => context });

    await service.sendOrderNotification({ orderId: ORDER_ID, template: "ORDER_SHIPPED", channel: "email" });
    await service.sendOrderNotification({ orderId: ORDER_ID, template: "ORDER_SHIPPED", channel: "sms" });

    expect(email.sent[0]?.to).toBe("sharmin@example.com");
    expect(email.sent[0]?.idempotencyKey).toBe(`${ORDER_ID}/ORDER_SHIPPED`);
    expect(sms.sent[0]?.phone).toBe("01711223344");
    expect(sms.sent[0]?.text).toContain("15BAEB8A");
    const statuses = logs.lines.filter((line) => line.event === "notification").map((line) => line.status);
    expect(statuses).toEqual(["sent", "sent"]);
  });

  it("skips email when the customer has no address and never claims success for failures", async () => {
    const logs = captureLogs();
    restore = logs.restore;
    const failingEmail = new RecordingEmail(true, { status: "failed", reason: "Resend responded 500", retryable: true });
    const service = new NotificationService({
      email: failingEmail,
      sms: new RecordingSms(true),
      loadOrderContext: async (orderId) => (orderId === ORDER_ID ? context : { ...context, email: null }),
    });

    const noEmail = await service.sendOrderNotification({
      orderId: "00000000-0000-0000-0000-000000000001",
      template: "ORDER_CONFIRMED",
      channel: "email",
    });
    expect(noEmail).toEqual({ status: "skipped", reason: "customer has no email address" });

    const failed = await service.sendOrderNotification({ orderId: ORDER_ID, template: "ORDER_CONFIRMED", channel: "email" });
    expect(failed).toMatchObject({ status: "failed", retryable: true });
    const failedLog = logs.lines.find((line) => line.event === "notification" && line.status === "failed");
    expect(failedLog).toMatchObject({ level: "error", channel: "email", retryable: true });
  });

  it("skips the inventory digest without ADMIN_ALERT_EMAIL or when there is nothing to report", async () => {
    const logs = captureLogs();
    restore = logs.restore;
    const email = new RecordingEmail(true);
    const digest = {
      generatedFor: "2026-11-09",
      lowStock: [{ productId: "p", title: "Lotion", sku: "L-1", availableStock: 1, lowStockThreshold: 5 }],
      expiringSoon: [],
    };

    const noRecipient = new NotificationService({ email, adminAlertEmail: undefined });
    expect((await noRecipient.sendInventoryDigest(digest)).status).toBe("skipped");

    const withRecipient = new NotificationService({ email, adminAlertEmail: "ops@example.com" });
    expect((await withRecipient.sendInventoryDigest({ ...digest, lowStock: [] })).status).toBe("skipped");
    expect((await withRecipient.sendInventoryDigest(digest)).status).toBe("sent");
    expect(email.sent[0]?.to).toBe("ops@example.com");
    expect(email.sent[0]?.html).toContain("Lotion");
  });
});
