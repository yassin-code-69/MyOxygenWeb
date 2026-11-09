/**
 * Customer accounts for the back office (GET/PATCH /admin/customers).
 *
 * - Only `role = CUSTOMER` users are customers; staff ids answer 404 here.
 * - Aggregates are computed in SQL: `ordersCount` and `lastOrderAt` cover every
 *   order, `totalSpent` (and the average order value) exclude CANCELLED and
 *   REFUNDED orders, like every other revenue figure in the admin.
 * - Search matches name, email or phone; phones match in any Bangladeshi
 *   format (01…, 1…, 880…, +880…, with spaces/dashes) and partial digits.
 */
import { and, count, desc, eq, ilike, notInArray, or, sql, type SQL } from "drizzle-orm";
import { db as defaultDb } from "../db/client";
import { orders, users } from "../db/schema/tables";
import { AppError } from "../lib/errors";
import { pageOffset } from "../lib/http";
import type { ShippingAddress } from "../types";
import { type DbExecutor, queryAll } from "./db-executor";
import { readShippingAddress, type OrderSummaryDTO } from "./order-dto";
import { moneyToNumber, paisaToAmount, toPaisa } from "./order-pricing";
import { REVENUE_EXCLUDED_STATUSES } from "./order-state-machine";
import { orderService } from "./order.service";
import { normalizeBangladeshMobile } from "./phone";
import { containsPattern, toIso, toNullableIso } from "./service-utils";

export const CUSTOMER_SORTS = ["newest", "spend_desc", "orders_desc"] as const;
export type CustomerSort = (typeof CUSTOMER_SORTS)[number];

export const RECENT_ORDERS_LIMIT = 10;
export const MAX_CUSTOMER_ADDRESSES = 5;
/** Distinct raw jsonb values inspected before canonical de-duplication. */
const ADDRESS_SCAN_LIMIT = 25;

export interface CustomerListQuery {
  page: number;
  limit: number;
  q?: string;
  sort: CustomerSort;
}

export interface CustomerDTO {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface CustomerListItemDTO extends CustomerDTO {
  ordersCount: number;
  totalSpent: number;
  lastOrderAt: string | null;
}

export interface CustomerStatsDTO {
  ordersCount: number;
  totalSpent: number;
  avgOrderValue: number;
  firstOrderAt: string | null;
  lastOrderAt: string | null;
}

export interface CustomerDetailDTO {
  customer: CustomerDTO;
  stats: CustomerStatsDTO;
  recentOrders: OrderSummaryDTO[];
  addresses: ShippingAddress[];
}

const customerColumns = {
  id: users.id,
  fullName: users.fullName,
  phone: users.phone,
  email: users.email,
  isActive: users.isActive,
  createdAt: users.createdAt,
} as const;

type CustomerRow = {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  isActive: boolean;
  createdAt: Date;
};

function toCustomerDTO(row: CustomerRow): CustomerDTO {
  return {
    id: row.id,
    fullName: row.fullName,
    phone: row.phone,
    email: row.email,
    isActive: row.isActive,
    createdAt: toIso(row.createdAt),
  };
}

/** Orders whose total counts as money spent (not CANCELLED / REFUNDED). */
function revenueOrder(): SQL {
  return notInArray(orders.status, [...REVENUE_EXCLUDED_STATUSES]);
}

const isCustomer = eq(users.role, "CUSTOMER");

/**
 * Digits of a phone-like search term in local form, for partial matches:
 * "+880 1712-34" → "0171234", "1712" → "1712". Null when `q` is not phone-like.
 */
export function phoneSearchDigits(q: string): string | null {
  const compact = q.trim().replace(/[\s().+-]/g, "");
  if (!/^\d{3,}$/.test(compact)) return null;
  if (compact.startsWith("880") && compact.length > 3) return `0${compact.slice(3)}`;
  return compact;
}

export function customerSearchCondition(q: string): SQL {
  const pattern = containsPattern(q);
  const conditions: SQL[] = [
    ilike(users.fullName, pattern),
    ilike(users.email, pattern),
    ilike(users.phone, pattern),
  ];
  const normalized = normalizeBangladeshMobile(q);
  if (normalized !== null) {
    conditions.push(eq(users.phone, normalized));
  }
  const digits = phoneSearchDigits(q);
  if (digits !== null) {
    conditions.push(ilike(users.phone, containsPattern(digits)));
  }
  return or(...conditions) ?? sql`false`;
}

function addressKey(address: ShippingAddress): string {
  return JSON.stringify(
    [
      address.fullName,
      address.phone,
      address.addressLine1,
      address.addressLine2 ?? "",
      address.city,
      address.district,
      address.postalCode,
    ].map((part) => part.trim().toLowerCase()),
  );
}

export class CustomerService {
  constructor(private readonly db: DbExecutor = defaultDb) {}

  /** Paginated CUSTOMER accounts with order aggregates. */
  async listCustomers(query: CustomerListQuery): Promise<{ items: CustomerListItemDTO[]; total: number }> {
    const where = query.q ? and(isCustomer, customerSearchCondition(query.q)) : isCustomer;

    const stats = this.db
      .select({
        userId: orders.userId,
        ordersCount: sql<number>`count(*)::int`.as("orders_count"),
        totalSpent: sql<string>`coalesce(sum(${orders.total}) filter (where ${revenueOrder()}), 0)`.as("total_spent"),
        lastOrderAt: sql<string | null>`max(${orders.createdAt})`.as("last_order_at"),
      })
      .from(orders)
      .groupBy(orders.userId)
      .as("customer_stats");

    const ordersCount = sql<number>`coalesce(${stats.ordersCount}, 0)`.mapWith(Number);
    const totalSpent = sql<string>`coalesce(${stats.totalSpent}, 0)`;
    const lastOrderAt = sql<Date | null>`${stats.lastOrderAt}`.mapWith(orders.createdAt);

    const orderBy: SQL[] =
      query.sort === "spend_desc"
        ? [desc(totalSpent), desc(users.createdAt), desc(users.id)]
        : query.sort === "orders_desc"
          ? [desc(ordersCount), sql`${stats.lastOrderAt} DESC NULLS LAST`, desc(users.createdAt), desc(users.id)]
          : [desc(users.createdAt), desc(users.id)];

    const [totalRows, rows] = await queryAll(
      this.db,
      () => this.db.select({ value: count() }).from(users).where(where),
      () =>
        this.db
          .select({ ...customerColumns, ordersCount, totalSpent, lastOrderAt })
          .from(users)
          .leftJoin(stats, eq(stats.userId, users.id))
          .where(where)
          .orderBy(...orderBy)
          .limit(query.limit)
          .offset(pageOffset(query.page, query.limit)),
    );

    const items = rows.map(
      (row): CustomerListItemDTO => ({
        ...toCustomerDTO(row),
        ordersCount: row.ordersCount,
        totalSpent: moneyToNumber(row.totalSpent),
        lastOrderAt: toNullableIso(row.lastOrderAt),
      }),
    );
    return { items, total: Number(totalRows[0]?.value ?? 0) };
  }

  /** Profile, lifetime stats, the 10 latest orders and up to 5 distinct shipping addresses. */
  async getCustomer(id: string): Promise<CustomerDetailDTO> {
    const customer = await this.findCustomer(id);
    const byCustomer = eq(orders.userId, id);

    const [statsRows, addressRows, recent] = await queryAll(
      this.db,
      () =>
        this.db
          .select({
            ordersCount: sql<number>`count(*)::int`.mapWith(Number),
            revenueOrders: sql<number>`(count(*) filter (where ${revenueOrder()}))::int`.mapWith(Number),
            totalSpent: sql<string>`coalesce(sum(${orders.total}) filter (where ${revenueOrder()}), 0)`,
            firstOrderAt: sql<Date | null>`min(${orders.createdAt})`.mapWith(orders.createdAt),
            lastOrderAt: sql<Date | null>`max(${orders.createdAt})`.mapWith(orders.createdAt),
          })
          .from(orders)
          .where(byCustomer),
      () =>
        this.db
          .select({ shippingAddress: orders.shippingAddress })
          .from(orders)
          .where(byCustomer)
          .groupBy(orders.shippingAddress)
          .orderBy(desc(sql`max(${orders.createdAt})`))
          .limit(ADDRESS_SCAN_LIMIT),
      () => orderService.listCustomerOrders(id, 1, RECENT_ORDERS_LIMIT),
    );

    const stats = statsRows[0];
    const totalSpentPaisa = toPaisa(stats?.totalSpent ?? 0);
    const revenueOrders = stats?.revenueOrders ?? 0;

    const addresses: ShippingAddress[] = [];
    const seen = new Set<string>();
    for (const row of addressRows) {
      const address = readShippingAddress(row.shippingAddress);
      const key = addressKey(address);
      if (seen.has(key)) continue;
      seen.add(key);
      addresses.push(address);
      if (addresses.length === MAX_CUSTOMER_ADDRESSES) break;
    }

    return {
      customer,
      stats: {
        ordersCount: stats?.ordersCount ?? 0,
        totalSpent: paisaToAmount(totalSpentPaisa),
        avgOrderValue: revenueOrders === 0 ? 0 : paisaToAmount(Math.round(totalSpentPaisa / revenueOrders)),
        firstOrderAt: toNullableIso(stats?.firstOrderAt),
        lastOrderAt: toNullableIso(stats?.lastOrderAt),
      },
      recentOrders: recent.items,
      addresses,
    };
  }

  /** Activates or deactivates a CUSTOMER account (404 for staff and unknown ids). */
  async setCustomerActive(id: string, isActive: boolean): Promise<CustomerDTO> {
    const [row] = await this.db
      .update(users)
      .set({ isActive })
      .where(and(eq(users.id, id), isCustomer))
      .returning(customerColumns);
    if (!row) throw AppError.notFound("Customer");
    return toCustomerDTO(row);
  }

  private async findCustomer(id: string): Promise<CustomerDTO> {
    const [row] = await this.db
      .select(customerColumns)
      .from(users)
      .where(and(eq(users.id, id), isCustomer))
      .limit(1);
    if (!row) throw AppError.notFound("Customer");
    return toCustomerDTO(row);
  }
}

export const customerService = new CustomerService();
