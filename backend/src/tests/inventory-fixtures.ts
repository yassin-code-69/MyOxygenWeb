/**
 * Test fixtures for the catalog / inventory suites (local test DB only).
 *
 * Every row gets a run-unique identifier and is tracked so `cleanup()` can
 * delete exactly what the suite created (never truncate shared tables: other
 * suites run against the same database concurrently).
 */
import { inArray } from "drizzle-orm";
import { db } from "../db/client";
import {
  categories,
  discounts,
  orders,
  productBatches,
  products,
  stockHistoryLogs,
  users,
} from "../db/schema/tables";
import { signAccessToken } from "../lib/jwt";
import type { UserRole } from "../types";

let sequence = 0;

/** Short unique token for slugs, SKUs, phones... */
export function uniqueId(prefix = ""): string {
  sequence += 1;
  const random = Math.floor(Math.random() * 1e6)
    .toString(36)
    .padStart(4, "0");
  return `${prefix}${Date.now().toString(36)}${random}${sequence.toString(36)}`.toLowerCase();
}

export interface TestUser {
  id: string;
  role: UserRole;
  token: string;
}

export interface ProductFixture {
  categoryId: string;
  title?: string;
  brand?: string | null;
  basePrice?: string;
  costPrice?: string;
  requiresBatchTracking?: boolean;
  isActive?: boolean;
  lowStockThreshold?: number;
  createdAt?: Date;
}

export class FixtureRegistry {
  readonly userIds: string[] = [];
  readonly categoryIds: string[] = [];
  readonly productIds: string[] = [];
  readonly discountIds: string[] = [];
  readonly orderIds: string[] = [];

  async user(role: UserRole): Promise<TestUser> {
    const tag = uniqueId();
    const digits = `${Date.now()}${Math.floor(Math.random() * 1e6)}`.slice(-9);
    const phone = `+8801${digits}${sequence % 10}`;
    const [row] = await db
      .insert(users)
      .values({
        fullName: `Test ${role} ${tag}`,
        email: `${role.toLowerCase()}-${tag}@oxygen.test`,
        phone,
        role,
      })
      .returning({ id: users.id });
    if (!row) throw new Error("user fixture insert failed");
    this.userIds.push(row.id);
    const token = await signAccessToken({ sub: row.id, role, phone });
    return { id: row.id, role, token };
  }

  async category(name = "Test Category", sortOrder = 0): Promise<{ id: string; slug: string; name: string }> {
    const slug = uniqueId("cat-");
    const fullName = `${name} ${slug}`;
    const [row] = await db
      .insert(categories)
      .values({ name: fullName, slug, sortOrder })
      .returning({ id: categories.id });
    if (!row) throw new Error("category fixture insert failed");
    this.categoryIds.push(row.id);
    return { id: row.id, slug, name: fullName };
  }

  async product(fixture: ProductFixture): Promise<{ id: string; slug: string; sku: string; title: string }> {
    const tag = uniqueId();
    const title = fixture.title ?? `Fixture Product ${tag}`;
    const slug = `p-${tag}`;
    const sku = `T-${tag}`.toUpperCase();
    const [row] = await db
      .insert(products)
      .values({
        categoryId: fixture.categoryId,
        title,
        slug,
        sku,
        brand: fixture.brand === undefined ? null : fixture.brand,
        description: `Fixture description for ${title}`,
        basePrice: fixture.basePrice ?? "100.00",
        costPrice: fixture.costPrice ?? "50.00",
        images: ["/images/products/fixture.jpg"],
        requiresBatchTracking: fixture.requiresBatchTracking ?? true,
        isActive: fixture.isActive ?? true,
        lowStockThreshold: fixture.lowStockThreshold ?? 5,
        ...(fixture.createdAt ? { createdAt: fixture.createdAt } : {}),
      })
      .returning({ id: products.id });
    if (!row) throw new Error("product fixture insert failed");
    this.productIds.push(row.id);
    return { id: row.id, slug, sku, title };
  }

  /** Raw batch insert (bypasses import validation, e.g. for already-expired batches). */
  async batch(productId: string, expiryDate: string, quantity: number, batchNumber = uniqueId("B-").toUpperCase()) {
    const [row] = await db
      .insert(productBatches)
      .values({
        productId,
        batchNumber,
        expiryDate,
        initialQuantity: Math.max(quantity, 1),
        availableQuantity: quantity,
      })
      .returning({ id: productBatches.id, batchNumber: productBatches.batchNumber });
    if (!row) throw new Error("batch fixture insert failed");
    return row;
  }

  async order(userId: string): Promise<string> {
    const [row] = await db
      .insert(orders)
      .values({
        orderNumber: uniqueId("ORD-T-").toUpperCase(),
        userId,
        paymentMethod: "COD",
        shippingAddress: {
          fullName: "Fixture Customer",
          phone: "01700000000",
          addressLine1: "House 1, Road 1",
          city: "Dhaka",
          district: "Dhaka",
          postalCode: "1207",
        },
        subtotal: "0.00",
        deliveryFee: "0.00",
        total: "0.00",
      })
      .returning({ id: orders.id });
    if (!row) throw new Error("order fixture insert failed");
    this.orderIds.push(row.id);
    return row.id;
  }

  trackOrder(orderId: string): void {
    this.orderIds.push(orderId);
  }

  trackProduct(productId: string): void {
    this.productIds.push(productId);
  }

  trackDiscount(discountId: string): void {
    this.discountIds.push(discountId);
  }

  /** Deletes everything this registry created (FK-safe order). */
  async cleanup(): Promise<void> {
    if (this.orderIds.length > 0) {
      await db.delete(orders).where(inArray(orders.id, this.orderIds));
    }
    if (this.discountIds.length > 0) {
      await db.delete(discounts).where(inArray(discounts.id, this.discountIds));
    }
    if (this.productIds.length > 0) {
      await db.delete(stockHistoryLogs).where(inArray(stockHistoryLogs.productId, this.productIds));
      await db.delete(products).where(inArray(products.id, this.productIds));
    }
    if (this.categoryIds.length > 0) {
      const scoped = inArray(products.categoryId, this.categoryIds);
      const leftovers = await db.select({ id: products.id }).from(products).where(scoped);
      if (leftovers.length > 0) {
        const ids = leftovers.map((p) => p.id);
        await db.delete(stockHistoryLogs).where(inArray(stockHistoryLogs.productId, ids));
        await db.delete(products).where(inArray(products.id, ids));
      }
      await db.delete(discounts).where(inArray(discounts.categoryId, this.categoryIds));
      await db.delete(categories).where(inArray(categories.id, this.categoryIds));
    }
    if (this.userIds.length > 0) {
      await db.delete(orders).where(inArray(orders.userId, this.userIds));
      await db.delete(users).where(inArray(users.id, this.userIds));
    }
  }
}
