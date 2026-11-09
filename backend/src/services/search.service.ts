/**
 * Global admin search (GET /admin/search?q=): up to 5 products, orders and
 * customers. The route decides which groups the caller may see (products:
 * PRODUCTS_READ; orders and customers: ORDERS_READ); skipped groups are empty
 * and never queried.
 *
 * Matching:
 *  - products : title or SKU contains q (case-insensitive), or the title is a
 *               trigram word match (>= 0.45, typo tolerant) for q >= 3 chars.
 *               Ranked exact SKU > title prefix > contains > similarity.
 *  - orders   : order number, customer / recipient name contain q, or — when
 *               q looks like a phone number — the account or delivery phone
 *               contains its digits (01…, 880…, +880…, spaces/dashes all work).
 *  - customers: CUSTOMER accounts by name, email or phone (same phone rule).
 * `href` values are admin routes.
 */
import { and, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db as defaultDb } from "../db/client";
import { orders, products, users } from "../db/schema/tables";
import type { DbExecutor } from "./db-executor";
import type { OrderStatus } from "./order-state-machine";
import { moneyToNumber } from "./order-pricing";
import { firstImageSql } from "./reports/sql";
import { containsPattern, escapeLikePattern } from "./service-utils";

export const SEARCH_RESULT_LIMIT = 5;
export const SEARCH_MIN_LENGTH = 2;
const TRIGRAM_MIN_LENGTH = 3;
const TRIGRAM_THRESHOLD = 0.45;

export interface SearchGroups {
  products: boolean;
  orders: boolean;
  customers: boolean;
}

export interface AdminSearchResultDTO {
  products: Array<{ id: string; title: string; sku: string; image: string | null; href: string }>;
  orders: Array<{ id: string; orderNumber: string; customerName: string; total: number; status: OrderStatus; href: string }>;
  customers: Array<{ id: string; fullName: string; phone: string; email: string | null; href: string }>;
}

/**
 * Digits to look for in stored phones (canonical 01XXXXXXXXX), or null when
 * `q` does not look like a phone number. "+880 1712-34" → "0171234".
 */
export function phoneSearchDigits(q: string): string | null {
  if (!/^[\d\s()+-]+$/.test(q)) return null;
  const digits = q.replace(/\D/g, "");
  if (digits.length < 3) return null;
  return digits.startsWith("880") ? `0${digits.slice(3)}` : digits;
}

export class SearchService {
  constructor(private readonly db: DbExecutor = defaultDb) {}

  async search(rawQuery: string, groups: SearchGroups): Promise<AdminSearchResultDTO> {
    const q = rawQuery.trim();
    // Sequential: one pooled connection per keystroke-driven request.
    const productResults = groups.products ? await this.searchProducts(q) : [];
    const orderResults = groups.orders ? await this.searchOrders(q) : [];
    const customerResults = groups.customers ? await this.searchCustomers(q) : [];
    return { products: productResults, orders: orderResults, customers: customerResults };
  }

  private async searchProducts(q: string): Promise<AdminSearchResultDTO["products"]> {
    const pattern = containsPattern(q);
    const prefix = `${escapeLikePattern(q)}%`;
    const useTrigram = q.length >= TRIGRAM_MIN_LENGTH;
    const similarity = sql<number>`extensions.word_similarity(${q}, ${products.title})`;
    const matches: SQL[] = [ilike(products.title, pattern), ilike(products.sku, pattern)];
    if (useTrigram) matches.push(sql`${similarity} >= ${TRIGRAM_THRESHOLD}`);
    const rank = sql<number>`(
      CASE
        WHEN upper(${products.sku}) = upper(${q}) THEN 3
        WHEN ${products.title} ILIKE ${prefix} THEN 2
        WHEN ${products.title} ILIKE ${pattern} OR ${products.sku} ILIKE ${pattern} THEN 1
        ELSE 0
      END + ${useTrigram ? similarity : sql`0`}
    )`;

    const rows = await this.db
      .select({
        id: products.id,
        title: products.title,
        sku: products.sku,
        image: firstImageSql(products.images),
      })
      .from(products)
      .where(or(...matches))
      .orderBy(desc(rank), products.title, products.id)
      .limit(SEARCH_RESULT_LIMIT);
    return rows.map((row) => ({ ...row, href: `/admin/products?productId=${row.id}` }));
  }

  private async searchOrders(q: string): Promise<AdminSearchResultDTO["orders"]> {
    const pattern = containsPattern(q);
    const digits = phoneSearchDigits(q);
    const matches: SQL[] = [
      ilike(orders.orderNumber, pattern),
      ilike(users.fullName, pattern),
      sql`${orders.shippingAddress}->>'fullName' ILIKE ${pattern}`,
    ];
    if (digits !== null) {
      const phonePattern = `%${digits}%`;
      matches.push(sql`${orders.shippingAddress}->>'phone' LIKE ${phonePattern}`);
      matches.push(sql`${users.phone} LIKE ${phonePattern}`);
    }

    const rows = await this.db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        customerName: users.fullName,
        total: orders.total,
        status: orders.status,
      })
      .from(orders)
      .innerJoin(users, eq(users.id, orders.userId))
      .where(or(...matches))
      .orderBy(desc(orders.createdAt), desc(orders.id))
      .limit(SEARCH_RESULT_LIMIT);
    return rows.map((row) => ({
      id: row.id,
      orderNumber: row.orderNumber,
      customerName: row.customerName,
      total: moneyToNumber(row.total),
      status: row.status,
      href: `/admin/orders?orderId=${row.id}`,
    }));
  }

  private async searchCustomers(q: string): Promise<AdminSearchResultDTO["customers"]> {
    const pattern = containsPattern(q);
    const digits = phoneSearchDigits(q);
    const matches: SQL[] = [ilike(users.fullName, pattern), ilike(users.email, pattern)];
    if (digits !== null) matches.push(sql`${users.phone} LIKE ${`%${digits}%`}`);

    const rows = await this.db
      .select({ id: users.id, fullName: users.fullName, phone: users.phone, email: users.email })
      .from(users)
      .where(and(eq(users.role, "CUSTOMER"), or(...matches)))
      .orderBy(desc(users.createdAt), desc(users.id))
      .limit(SEARCH_RESULT_LIMIT);
    return rows.map((row) => ({ ...row, href: `/admin/customers?customerId=${row.id}` }));
  }
}

export const searchService = new SearchService();
