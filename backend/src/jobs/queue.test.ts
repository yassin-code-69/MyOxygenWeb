import { afterEach, describe, expect, it, spyOn } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { categories, invoices, productBatches, products, users } from "../db/schema/tables";
import { addDays, todayInBusinessTz } from "../lib/dates";
import { orderService } from "../services/order.service";
import { jobHandlers } from "./handlers";
import { InProcessJobQueue, type JobHandlers, type JobPayloads } from "./queue";

const ORDER_ID = "3f0c1d9e-8a5b-4c2d-9e1f-0a1b2c3d4e5f";

interface Call {
  name: keyof JobPayloads;
  attempt: number;
  at: number;
}

function handlers(calls: Call[], overrides: Partial<JobHandlers> = {}): JobHandlers {
  return {
    "send-order-notification": async (_payload, context) => {
      calls.push({ name: "send-order-notification", attempt: context.attempt, at: Date.now() });
    },
    "generate-invoice": async (_payload, context) => {
      calls.push({ name: "generate-invoice", attempt: context.attempt, at: Date.now() });
    },
    "inventory-digest": async (_payload, context) => {
      calls.push({ name: "inventory-digest", attempt: context.attempt, at: Date.now() });
    },
    ...overrides,
  };
}

function silenceLogs() {
  const spies = [
    spyOn(console, "log").mockImplementation(() => undefined),
    spyOn(console, "warn").mockImplementation(() => undefined),
    spyOn(console, "error").mockImplementation(() => undefined),
  ];
  return () => {
    for (const spy of spies) spy.mockRestore();
  };
}

describe("In-process job queue", () => {
  let restoreLogs: (() => void) | null = null;
  afterEach(() => {
    restoreLogs?.();
    restoreLogs = null;
  });

  it("buffers jobs until a worker starts, then runs them", async () => {
    const queue = new InProcessJobQueue();
    const calls: Call[] = [];
    await queue.enqueue("generate-invoice", { orderId: ORDER_ID });
    expect(queue.bufferedCount).toBe(1);
    expect(calls).toHaveLength(0);

    await queue.start(handlers(calls));
    await queue.onIdle();
    expect(calls.map((call) => call.name)).toEqual(["generate-invoice"]);
    expect(queue.bufferedCount).toBe(0);
    await queue.stop();
  });

  it("retries failures with exponential backoff up to the attempt limit", async () => {
    restoreLogs = silenceLogs();
    const queue = new InProcessJobQueue({ policies: { "generate-invoice": { attempts: 3, backoffMs: 20 } } });
    const calls: Call[] = [];
    await queue.start(
      handlers(calls, {
        "generate-invoice": async (_payload, context) => {
          calls.push({ name: "generate-invoice", attempt: context.attempt, at: Date.now() });
          if (context.attempt < 3) throw new Error("transient failure");
        },
      }),
    );

    await queue.enqueue("generate-invoice", { orderId: ORDER_ID });
    await queue.onIdle();

    expect(calls.map((call) => call.attempt)).toEqual([1, 2, 3]);
    const [first, second, third] = calls;
    expect((second?.at ?? 0) - (first?.at ?? 0)).toBeGreaterThanOrEqual(15); // ~20ms
    expect((third?.at ?? 0) - (second?.at ?? 0)).toBeGreaterThanOrEqual(35); // ~40ms
    await queue.stop();
  });

  it("gives up after the last attempt and logs job_failed", async () => {
    const errors: string[] = [];
    const errorSpy = spyOn(console, "error").mockImplementation((line: unknown) => {
      errors.push(String(line));
    });
    const warnSpy = spyOn(console, "warn").mockImplementation(() => undefined);
    restoreLogs = () => {
      errorSpy.mockRestore();
      warnSpy.mockRestore();
    };

    const queue = new InProcessJobQueue({ policies: { "inventory-digest": { attempts: 2, backoffMs: 5 } } });
    let attempts = 0;
    await queue.start(
      handlers([], {
        "inventory-digest": async () => {
          attempts += 1;
          throw new Error("smtp down");
        },
      }),
    );
    await queue.enqueue("inventory-digest", { trigger: "manual" });
    await queue.onIdle();

    expect(attempts).toBe(2);
    const failure = errors.map((line) => JSON.parse(line) as Record<string, unknown>).find((entry) => entry.event === "job_failed");
    expect(failure).toMatchObject({ job: "inventory-digest", attempt: 2, maxAttempts: 2, message: "smtp down" });
    await queue.stop();
  });

  it("de-duplicates jobs by id while they are pending", async () => {
    const queue = new InProcessJobQueue();
    const calls: Call[] = [];
    const payload = { orderId: ORDER_ID, template: "ORDER_CONFIRMED", channel: "sms" } as const;
    await queue.enqueue("send-order-notification", payload, { jobId: "notify-1" });
    await queue.enqueue("send-order-notification", payload, { jobId: "notify-1" });
    await queue.start(handlers(calls));
    await queue.onIdle();
    expect(calls).toHaveLength(1);
    await queue.stop();
  });

  it("rejects malformed payloads without retrying", async () => {
    restoreLogs = silenceLogs();
    const queue = new InProcessJobQueue({ policies: { "generate-invoice": { attempts: 5, backoffMs: 5 } } });
    const calls: Call[] = [];
    await queue.start(handlers(calls));
    await queue.enqueue("generate-invoice", { orderId: "not-a-uuid" });
    await queue.onIdle();
    expect(calls).toHaveLength(0);
    await queue.stop();
  });

  it("runs the real handlers: invoice generation and a 'skipped' notification without provider keys", async () => {
    const run = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
    const [user] = await db
      .insert(users)
      .values({
        fullName: "Queue Customer",
        email: `queue-${run}@test.myoxygen.local`,
        phone: `017${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`,
        passwordHash: "not-used",
        role: "CUSTOMER",
      })
      .returning({ id: users.id });
    const [category] = await db
      .insert(categories)
      .values({ name: `Queue ${run}`, slug: `queue-${run}` })
      .returning({ id: categories.id });
    if (!user || !category) throw new Error("fixtures failed");
    const [product] = await db
      .insert(products)
      .values({
        categoryId: category.id,
        title: `Queue Lotion ${run}`,
        slug: `queue-lotion-${run}`,
        sku: `QUEUE-${run}`,
        description: "Queue fixture",
        basePrice: "250.00",
        costPrice: "100.00",
      })
      .returning({ id: products.id });
    if (!product) throw new Error("product fixture failed");
    await db.insert(productBatches).values({
      productId: product.id,
      batchNumber: `Q-${run}`,
      expiryDate: addDays(todayInBusinessTz(), 200),
      initialQuantity: 10,
      availableQuantity: 10,
    });
    const order = await orderService.placeOrder(
      {
        items: [{ productId: product.id, quantity: 2 }],
        paymentMethod: "COD",
        shippingAddress: {
          fullName: "Queue Customer",
          phone: "01711000000",
          addressLine1: "Queue Road 1",
          city: "Dhaka",
          district: "Dhaka",
          postalCode: "1200",
        },
      },
      { id: user.id, role: "CUSTOMER" },
    );

    const lines: Array<Record<string, unknown>> = [];
    const capture = (...args: unknown[]) => {
      for (const arg of args) {
        if (typeof arg === "string" && arg.startsWith("{")) lines.push(JSON.parse(arg) as Record<string, unknown>);
      }
    };
    const logSpy = spyOn(console, "log").mockImplementation(capture);
    const errorSpy = spyOn(console, "error").mockImplementation(capture);
    restoreLogs = () => {
      logSpy.mockRestore();
      errorSpy.mockRestore();
    };

    const queue = new InProcessJobQueue();
    await queue.start(jobHandlers);
    await queue.enqueue("generate-invoice", { orderId: order.id });
    await queue.enqueue("send-order-notification", { orderId: order.id, template: "ORDER_CONFIRMED", channel: "sms" });
    await queue.onIdle();
    await queue.stop();

    const [invoice] = await db
      .select({ number: invoices.invoiceNumber, method: invoices.paymentMethod })
      .from(invoices)
      .where(eq(invoices.orderId, order.id));
    expect(invoice).toEqual({ number: order.orderNumber.replace(/^ORD-/, "INV-"), method: "COD" });

    const notification = lines.find((line) => line.event === "notification" && line.orderId === order.id);
    expect(notification).toMatchObject({ channel: "sms", template: "ORDER_CONFIRMED", status: "skipped" });
    expect(String(notification?.reason)).toStartWith("not configured");
    expect(lines.some((line) => line.event === "job_failed")).toBe(false);
  }, 30_000);

  it("stops processing on stop() and keeps unprocessed jobs buffered", async () => {
    restoreLogs = silenceLogs();
    const queue = new InProcessJobQueue();
    const calls: Call[] = [];
    await queue.start(handlers(calls));
    await queue.stop();
    await queue.enqueue("generate-invoice", { orderId: ORDER_ID });
    expect(queue.bufferedCount).toBe(1);
    expect(calls).toHaveLength(0);
  });
});
