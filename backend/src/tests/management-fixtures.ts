/**
 * Fixtures for the admin management test-suites (customers, staff, catalog
 * meta, system, delivery). The test database is SHARED with other agents and
 * the live dev server, so:
 * - every row gets a unique RUN-scoped name / email / phone / slug;
 * - nothing is truncated: each suite deletes exactly the rows it created;
 * - range-based fixtures use random historic dates so they never move
 *   "today" / "last 30 days" figures of other suites.
 */
import { inArray } from "drizzle-orm";
import { db } from "../db/client";
import { categories, orderItems, orders, products, stockHistoryLogs, users } from "../db/schema/tables";
import { app } from "../index";
import { signAccessToken } from "../lib/jwt";
import { generateOrderNumber } from "../services/order.service";
import type { OrderStatus } from "../services/order-state-machine";
import type { PaginationMeta, ShippingAddress, UserRole } from "../types";

export const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

export interface Envelope<T> {
  success: boolean;
  data: T;
  meta?: PaginationMeta;
  error?: { code: string; message: string; details?: unknown };
}

export interface CallResult<T> {
  status: number;
  headers: Headers;
  body: Envelope<T>;
  /** Raw response text (for "never contains X" assertions). */
  text: string;
}

export type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export async function call<T>(
  method: HttpMethod,
  path: string,
  options: { token?: string; body?: unknown } = {},
): Promise<CallResult<T>> {
  const headers: Record<string, string> = {};
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  const response = await app.request(path, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  const body = (text ? JSON.parse(text) : {}) as Envelope<T>;
  return { status: response.status, headers: response.headers, body, text };
}

/** Random, valid, canonical Bangladeshi mobile number (01[3-9]XXXXXXXX). */
export function uniquePhone(): string {
  return `01${3 + Math.floor(Math.random() * 7)}${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
}

export interface TestUser {
  id: string;
  token: string;
  role: UserRole;
  fullName: string;
  email: string | null;
  phone: string;
}

export interface UserOverrides {
  fullName?: string;
  email?: string | null;
  phone?: string;
  isActive?: boolean;
  createdAt?: Date;
}

export interface OrderFixture {
  status: OrderStatus;
  total: number;
  createdAt?: Date;
  shippedAt?: Date | null;
  deliveredAt?: Date | null;
  cancelledAt?: Date | null;
  courierProvider?: string | null;
  shippingAddress?: ShippingAddress;
  items?: Array<{ productId: string; quantity: number }>;
}

export function address(label: string, overrides: Partial<ShippingAddress> = {}): ShippingAddress {
  return {
    fullName: `Receiver ${label}`,
    phone: "01711111111",
    addressLine1: `House ${label}, Road 7`,
    city: "Dhaka",
    district: "Dhaka",
    postalCode: "1207",
    ...overrides,
  };
}

/** Instant at `HH:MM` on business date `isoDate` in Asia/Dhaka (UTC+6, no DST). */
export function dhakaTime(isoDate: string, hhmm: string): Date {
  return new Date(`${isoDate}T${hhmm}:00+06:00`);
}

export class ManagementFixtures {
  readonly userIds: string[] = [];
  readonly categoryIds: string[] = [];
  readonly productIds: string[] = [];
  readonly orderIds: string[] = [];
  private sequence = 0;

  constructor(private readonly label: string) {}

  private next(): number {
    this.sequence += 1;
    return this.sequence;
  }

  async user(role: UserRole, overrides: UserOverrides = {}): Promise<TestUser> {
    const n = this.next();
    const phone = overrides.phone ?? uniquePhone();
    const email =
      overrides.email === undefined ? `r1b-${this.label}-${role.toLowerCase()}-${RUN}-${n}@test.myoxygen.local` : overrides.email;
    const fullName = overrides.fullName ?? `R1b ${this.label} ${role} ${RUN} ${n}`;
    const [row] = await db
      .insert(users)
      .values({
        fullName,
        email,
        phone,
        role,
        passwordHash: "not-used",
        isActive: overrides.isActive ?? true,
        ...(overrides.createdAt ? { createdAt: overrides.createdAt } : {}),
      })
      .returning({ id: users.id });
    if (!row) throw new Error("user fixture failed");
    this.userIds.push(row.id);
    return { id: row.id, role, fullName, email, phone, token: await signAccessToken({ sub: row.id, role, phone }) };
  }

  async category(name?: string): Promise<string> {
    const n = this.next();
    const [row] = await db
      .insert(categories)
      .values({ name: name ?? `R1b ${this.label} ${RUN} ${n}`, slug: `r1b-${this.label}-${RUN}-${n}` })
      .returning({ id: categories.id });
    if (!row) throw new Error("category fixture failed");
    this.categoryIds.push(row.id);
    return row.id;
  }

  async product(
    categoryId: string,
    options: { brand?: string | null; isActive?: boolean; autoDeactivatedAt?: Date | null } = {},
  ): Promise<string> {
    const n = this.next();
    const [row] = await db
      .insert(products)
      .values({
        categoryId,
        title: `R1b ${this.label} Product ${RUN} ${n}`,
        slug: `r1b-${this.label}-product-${RUN}-${n}`,
        sku: `R1B-${this.label}-${RUN}-${n}`.toUpperCase(),
        brand: options.brand ?? null,
        description: "R1b management fixture",
        basePrice: "100.00",
        costPrice: "60.00",
        isActive: options.isActive ?? true,
        autoDeactivatedAt: options.autoDeactivatedAt ?? null,
      })
      .returning({ id: products.id });
    if (!row) throw new Error("product fixture failed");
    this.productIds.push(row.id);
    return row.id;
  }

  async order(userId: string, fixture: OrderFixture): Promise<string> {
    const total = fixture.total.toFixed(2);
    const [row] = await db
      .insert(orders)
      .values({
        orderNumber: generateOrderNumber(),
        userId,
        status: fixture.status,
        paymentMethod: "COD",
        paymentStatus: fixture.status === "DELIVERED" ? "PAID" : fixture.status === "REFUNDED" ? "REFUNDED" : "UNPAID",
        shippingAddress: fixture.shippingAddress ?? address(`${RUN}`),
        subtotal: total,
        deliveryFee: "0.00",
        total,
        courierProvider: fixture.courierProvider ?? null,
        shippedAt: fixture.shippedAt ?? null,
        deliveredAt: fixture.deliveredAt ?? null,
        cancelledAt: fixture.cancelledAt ?? null,
        ...(fixture.createdAt ? { createdAt: fixture.createdAt } : {}),
      })
      .returning({ id: orders.id });
    if (!row) throw new Error("order fixture failed");
    this.orderIds.push(row.id);
    if (fixture.items && fixture.items.length > 0) {
      await db.insert(orderItems).values(
        fixture.items.map((item) => ({
          orderId: row.id,
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: "100.00",
          totalPrice: (100 * item.quantity).toFixed(2),
          unitCost: "60.00",
        })),
      );
    }
    return row.id;
  }

  /** Records rows created through the API so cleanup() removes them too. */
  trackUser(id: string): void {
    this.userIds.push(id);
  }

  trackCategory(id: string): void {
    this.categoryIds.push(id);
  }

  /** Deletes exactly the rows this suite created (dependents first). */
  async cleanup(): Promise<void> {
    if (this.orderIds.length > 0) {
      await db.delete(orders).where(inArray(orders.id, this.orderIds));
    }
    if (this.userIds.length > 0) {
      await db.delete(orders).where(inArray(orders.userId, this.userIds));
    }
    if (this.productIds.length > 0) {
      await db.delete(stockHistoryLogs).where(inArray(stockHistoryLogs.productId, this.productIds));
      await db.delete(products).where(inArray(products.id, this.productIds));
    }
    if (this.categoryIds.length > 0) {
      await db.delete(categories).where(inArray(categories.id, this.categoryIds));
    }
    if (this.userIds.length > 0) {
      await db.delete(users).where(inArray(users.id, this.userIds));
    }
  }
}
