/**
 * Fixtures for the reporting / expense / payment / search suites (local test
 * DB only). Rows are run-unique and tracked; `cleanup()` deletes exactly what
 * was created (the database is shared with suites running concurrently, so
 * nothing is ever truncated).
 *
 * Exact-number assertions use a random business day far in the past
 * (`isolatedDay`): no other fixture or demo data lives there.
 */
import { inArray } from "drizzle-orm";
import { db } from "../db/client";
import { expenses, orderItems, orders, orderStatusHistory, users } from "../db/schema/tables";
import { app } from "../index";
import { addDays } from "../lib/dates";
import { signAccessToken } from "../lib/jwt";
import type { OrderStatus } from "../services/order-state-machine";
import type { PaginationMeta, ShippingAddress, UserRole } from "../types";
import { FixtureRegistry, uniqueId } from "./inventory-fixtures";

export interface Envelope<T, M = PaginationMeta> {
  success: boolean;
  data: T;
  meta?: M;
  error?: { code: string; message: string; details?: unknown };
}

export async function call<T, M = PaginationMeta>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  options: { token?: string; body?: unknown } = {},
): Promise<{ status: number; body: Envelope<T, M> }> {
  const headers: Record<string, string> = {};
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  const response = await app.request(path, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  return { status: response.status, body: (text ? JSON.parse(text) : {}) as Envelope<T, M> };
}

/** A random business day in [startYear, startYear + spanYears). */
export function isolatedDay(startYear: number, spanYears: number): string {
  return addDays(`${startYear}-01-15`, Math.floor(Math.random() * spanYears * 360));
}

/** Instant of hh:mm on a business day in Asia/Dhaka (UTC+6, no DST). */
export function dhakaTime(date: string, hhmm: string): Date {
  return new Date(`${date}T${hhmm}:00+06:00`);
}

let phoneCounter = 0;
/** Canonical, run-unique Bangladeshi mobile number (01XXXXXXXXX). */
export function uniquePhone(): string {
  phoneCounter += 1;
  const digits = `${Date.now() % 1e6}${Math.floor(Math.random() * 100)}${phoneCounter % 10}`.padStart(8, "0").slice(-8);
  return `01${3 + Math.floor(Math.random() * 7)}${digits}`;
}

export interface FixtureLine {
  productId: string;
  quantity: number;
  unitPrice: string;
  unitCost: string;
}

export interface FixtureOrder {
  userId: string;
  status: OrderStatus;
  createdAt: Date;
  paymentMethod?: "COD" | "ONLINE_GATEWAY";
  paymentStatus?: "UNPAID" | "PAID" | "REFUNDED" | "FAILED";
  discountAmount?: string;
  deliveryFee?: string;
  district?: string;
  lines: FixtureLine[];
}

const toCents = (value: string): number => Math.round(Number(value) * 100);
const fromCents = (cents: number): string => (cents / 100).toFixed(2);

export class ReportFixtures extends FixtureRegistry {
  readonly expenseIds: string[] = [];

  async staff(role: UserRole): Promise<{ id: string; token: string }> {
    const user = await this.user(role);
    return { id: user.id, token: user.token };
  }

  /** CUSTOMER account with an explicit sign-up time (and canonical phone). */
  async customer(fullName: string, createdAt: Date, email?: string): Promise<{ id: string; token: string; phone: string }> {
    const phone = uniquePhone();
    const [row] = await db
      .insert(users)
      .values({
        fullName,
        email: email ?? `${uniqueId("rep-")}@reports.test`,
        phone,
        role: "CUSTOMER",
        createdAt,
        updatedAt: createdAt,
      })
      .returning({ id: users.id });
    if (!row) throw new Error("customer fixture insert failed");
    this.userIds.push(row.id);
    return { id: row.id, phone, token: await signAccessToken({ sub: row.id, role: "CUSTOMER", phone }) };
  }

  /** Inserts an order with explicit money, status and timestamps (bypasses checkout). */
  async insertOrder(fixture: FixtureOrder): Promise<string> {
    const subtotalCents = fixture.lines.reduce((sum, line) => sum + toCents(line.unitPrice) * line.quantity, 0);
    const discountCents = toCents(fixture.discountAmount ?? "0");
    const deliveryCents = toCents(fixture.deliveryFee ?? (subtotalCents >= 150_000 ? "0" : "60"));
    const shippingAddress: ShippingAddress = {
      fullName: "Report Fixture",
      phone: "01700000000",
      addressLine1: "House 1, Road 1",
      city: "Dhaka",
      district: fixture.district ?? "Dhaka",
      postalCode: "1207",
    };
    const [order] = await db
      .insert(orders)
      .values({
        orderNumber: uniqueId("ORD-R-").toUpperCase(),
        userId: fixture.userId,
        status: fixture.status,
        paymentMethod: fixture.paymentMethod ?? "COD",
        paymentStatus: fixture.paymentStatus ?? "UNPAID",
        shippingAddress,
        subtotal: fromCents(subtotalCents),
        deliveryFee: fromCents(deliveryCents),
        discountAmount: fromCents(discountCents),
        total: fromCents(subtotalCents - discountCents + deliveryCents),
        createdAt: fixture.createdAt,
        updatedAt: fixture.createdAt,
      })
      .returning({ id: orders.id });
    if (!order) throw new Error("order fixture insert failed");
    this.orderIds.push(order.id);
    await db.insert(orderItems).values(
      fixture.lines.map((line) => ({
        orderId: order.id,
        productId: line.productId,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        totalPrice: fromCents(toCents(line.unitPrice) * line.quantity),
        unitCost: line.unitCost,
        createdAt: fixture.createdAt,
      })),
    );
    await db.insert(orderStatusHistory).values({
      orderId: order.id,
      fromStatus: null,
      toStatus: "PENDING",
      changedBy: fixture.userId,
      note: "Fixture",
      createdAt: fixture.createdAt,
    });
    return order.id;
  }

  trackExpense(id: string): void {
    this.expenseIds.push(id);
  }

  override async cleanup(): Promise<void> {
    if (this.expenseIds.length > 0) {
      await db.delete(expenses).where(inArray(expenses.id, this.expenseIds));
    }
    await super.cleanup();
  }
}
