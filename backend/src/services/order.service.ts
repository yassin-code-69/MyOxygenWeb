/**
 * Order placement and order read models.
 *
 * Checkout (`placeOrder`):
 *  1. Price the cart server-side (effective flash-sale prices, merged and
 *     sorted lines) BEFORE opening the transaction.
 *  2. In ONE transaction: resolve the coupon, insert the order, allocate and
 *     reserve stock per line (FEFO, product-id order → consistent locks),
 *     insert the batch-level order items (with `unit_cost` = the product's
 *     cost price at the moment of sale, the COGS snapshot used by the profit
 *     report), consume the coupon atomically and write the first
 *     status-history row (null → PENDING).
 *  3. After commit: invalidate the catalog cache and queue notifications and
 *     invoice generation (fire-and-forget).
 */
import { and, asc, count, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { db, type DatabaseTransaction } from "../db/client";
import { orderItems, orders, orderStatusHistory, products, users } from "../db/schema/tables";
import { isUniqueViolation } from "../lib/db-errors";
import { businessDate } from "../lib/dates";
import { AppError } from "../lib/errors";
import { hasPermission, Permissions } from "../lib/rbac";
import { invalidateCatalogCache } from "../middleware/cache";
import type { ShippingAddress, UserRole } from "../types";
import { couponService } from "./coupon.service";
import { inventoryService, type BatchAllocation } from "./inventory.service";
import {
  customerCanCancel,
  isoOrNull,
  nextStatuses,
  readShippingAddress,
  summarizeLines,
  toOrderItemDTO,
  type AdminOrderListItemDTO,
  type OrderDetailDTO,
  type OrderStatusHistoryEntryDTO,
  type OrderSummaryDTO,
  type PaymentMethod,
  type PaymentStatus,
} from "./order-dto";
import { publishOrderStatusEvent, requestInvoice } from "./order-events";
import {
  deliveryFeeFor,
  moneyToNumber,
  orderPricingService,
  paisaToDecimal,
  type CartLineInput,
  type PricedCart,
  type PricedCartLine,
} from "./order-pricing";
import type { OrderStatus } from "./order-state-machine";
import { normalizeBangladeshMobile } from "./phone";
import { containsPattern } from "./service-utils";
import { onOrAfterBusinessDay, onOrBeforeBusinessDay } from "./sql-time";

export interface OrderViewer {
  id: string;
  role: UserRole;
}

/** Internal reads (invoices, jobs): full visibility, never the owner. */
export const SYSTEM_ORDER_VIEWER: OrderViewer = {
  id: "00000000-0000-0000-0000-000000000000",
  role: "SUPER_ADMIN",
};

export interface PlaceOrderInput {
  items: CartLineInput[];
  shippingAddress: ShippingAddress;
  paymentMethod: PaymentMethod;
  couponCode?: string;
}

export interface AdminOrdersQuery {
  page: number;
  limit: number;
  status?: OrderStatus;
  paymentStatus?: PaymentStatus;
  paymentMethod?: PaymentMethod;
  q?: string;
  from?: string;
  to?: string;
  /** Timestamp the from/to range applies to (default createdAt). */
  dateField?: "createdAt" | "shippedAt" | "deliveredAt";
  /** Courier provider, case-insensitive; "unknown" = no courier recorded. */
  courier?: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ORDER_NUMBER_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 32 unambiguous symbols
const MAX_ORDER_NUMBER_ATTEMPTS = 3;

/** Staff with ORDERS_READ may see every order; everyone else only their own. */
export function isOrderStaff(role: UserRole): boolean {
  return hasPermission(role, Permissions.ORDERS_READ);
}

/** ORD-YYYYMMDD-XXXXXXXX (business date + 40 bits of randomness). */
export function generateOrderNumber(now: Date = new Date()): string {
  const day = businessDate(now).replaceAll("-", "");
  let suffix = "";
  for (const byte of crypto.getRandomValues(new Uint8Array(8))) {
    suffix += ORDER_NUMBER_ALPHABET[byte % ORDER_NUMBER_ALPHABET.length];
  }
  return `ORD-${day}-${suffix}`;
}

export function orderLookupCondition(idOrNumber: string): SQL {
  const value = idOrNumber.trim();
  return UUID_PATTERN.test(value) ? eq(orders.id, value.toLowerCase()) : eq(orders.orderNumber, value.toUpperCase());
}

async function loadOrderGraph(where: SQL) {
  return db.query.orders.findFirst({
    where,
    with: {
      user: { columns: { id: true, fullName: true, email: true, phone: true } },
      discount: { columns: { code: true } },
      items: {
        orderBy: [asc(orderItems.productId), asc(orderItems.createdAt)],
        with: {
          product: { columns: { title: true, slug: true, sku: true, images: true } },
          batch: { columns: { batchNumber: true, expiryDate: true } },
        },
      },
      statusHistory: {
        orderBy: [asc(orderStatusHistory.createdAt)],
        with: { changedByUser: { columns: { id: true, fullName: true, role: true } } },
      },
    },
  });
}

type OrderGraph = NonNullable<Awaited<ReturnType<typeof loadOrderGraph>>>;

function toDetailDTO(row: OrderGraph, viewer: OrderViewer): OrderDetailDTO {
  const staff = isOrderStaff(viewer.role);
  const statusHistory: OrderStatusHistoryEntryDTO[] = row.statusHistory.map((entry) => ({
    id: entry.id,
    fromStatus: entry.fromStatus,
    toStatus: entry.toStatus,
    note: entry.note,
    changedBy:
      staff && entry.changedByUser
        ? { id: entry.changedByUser.id, fullName: entry.changedByUser.fullName, role: entry.changedByUser.role }
        : null,
    createdAt: entry.createdAt.toISOString(),
  }));

  return {
    id: row.id,
    orderNumber: row.orderNumber,
    userId: row.userId,
    status: row.status,
    paymentMethod: row.paymentMethod,
    paymentStatus: row.paymentStatus,
    shippingAddress: readShippingAddress(row.shippingAddress),
    subtotal: moneyToNumber(row.subtotal),
    deliveryFee: moneyToNumber(row.deliveryFee),
    discountAmount: moneyToNumber(row.discountAmount),
    total: moneyToNumber(row.total),
    couponCode: row.discount?.code ?? null,
    courierProvider: row.courierProvider,
    trackingId: row.trackingId,
    invoiceUrl: `/orders/${row.id}/invoice`,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    shippedAt: isoOrNull(row.shippedAt),
    deliveredAt: isoOrNull(row.deliveredAt),
    cancelledAt: isoOrNull(row.cancelledAt),
    customer: {
      id: row.user.id,
      fullName: row.user.fullName,
      email: row.user.email,
      phone: row.user.phone,
    },
    items: row.items.map(toOrderItemDTO),
    statusHistory,
    allowedTransitions: nextStatuses(row.status),
    canCancel: row.userId === viewer.id && customerCanCancel(row.status),
  };
}

export class OrderService {
  /** Places an order for `viewer` and returns it (201 payload). */
  async placeOrder(input: PlaceOrderInput, viewer: OrderViewer): Promise<OrderDetailDTO> {
    const cart = await orderPricingService.priceCart(input.items);
    const deliveryFeePaisa = deliveryFeeFor(cart.subtotalPaisa);

    let orderId: string | null = null;
    for (let attempt = 1; orderId === null; attempt++) {
      try {
        orderId = await db.transaction((tx) => this.insertOrder(tx, input, viewer.id, cart, deliveryFeePaisa));
      } catch (error) {
        // A random order-number collision aborts the transaction; retry with a new number.
        if (attempt < MAX_ORDER_NUMBER_ATTEMPTS && isUniqueViolation(error, "orders_order_number_unique")) {
          continue;
        }
        throw error;
      }
    }

    invalidateCatalogCache();
    publishOrderStatusEvent(orderId, "PENDING");
    requestInvoice(orderId);

    return this.getOrderDetail(orderId, viewer);
  }

  private async insertOrder(
    tx: DatabaseTransaction,
    input: PlaceOrderInput,
    userId: string,
    cart: PricedCart,
    deliveryFeePaisa: number,
  ): Promise<string> {
    const applied = input.couponCode
      ? await couponService.resolveForCheckout(input.couponCode, cart, userId, tx)
      : null;
    const discountPaisa = applied?.discountPaisa ?? 0;
    const totalPaisa = cart.subtotalPaisa - discountPaisa + deliveryFeePaisa;

    const [order] = await tx
      .insert(orders)
      .values({
        orderNumber: generateOrderNumber(),
        userId,
        status: "PENDING",
        paymentMethod: input.paymentMethod,
        paymentStatus: "UNPAID",
        shippingAddress: input.shippingAddress,
        discountId: applied?.coupon.id ?? null,
        subtotal: paisaToDecimal(cart.subtotalPaisa),
        deliveryFee: paisaToDecimal(deliveryFeePaisa),
        discountAmount: paisaToDecimal(discountPaisa),
        total: paisaToDecimal(totalPaisa),
      })
      .returning({ id: orders.id });
    if (order === undefined) {
      throw AppError.internal("Order could not be created");
    }

    const reserved: Array<{ line: PricedCartLine; allocations: BatchAllocation[] }> = [];
    for (const line of cart.lines) {
      const allocations = await inventoryService.allocateBatchesFEFO(line.productId, line.quantity, tx);
      const allocated = allocations.reduce((sum, allocation) => sum + allocation.quantity, 0);
      if (allocated !== line.quantity) {
        throw AppError.insufficientStock(`Only ${allocated} unit(s) of "${line.title}" are available`, {
          productId: line.productId,
          requested: line.quantity,
          available: allocated,
        });
      }
      await inventoryService.reserveStock(allocations, order.id, userId, tx);
      reserved.push({ line, allocations });
    }

    // COGS snapshot. `allocateBatchesFEFO` locked every product row FOR NO KEY
    // UPDATE in this transaction, so these are the cost prices in force at the
    // moment of sale (a concurrent cost edit waits for our COMMIT).
    const costRows = await tx
      .select({ id: products.id, costPrice: products.costPrice })
      .from(products)
      .where(
        inArray(
          products.id,
          cart.lines.map((line) => line.productId),
        ),
      );
    const costByProduct = new Map(costRows.map((row) => [row.id, row.costPrice]));

    const itemRows: (typeof orderItems.$inferInsert)[] = [];
    for (const { line, allocations } of reserved) {
      const unitCost = costByProduct.get(line.productId);
      if (unitCost === undefined) {
        throw AppError.internal("Product cost price could not be read during checkout");
      }
      for (const allocation of allocations) {
        itemRows.push({
          orderId: order.id,
          productId: line.productId,
          batchId: allocation.batchId,
          quantity: allocation.quantity,
          unitPrice: paisaToDecimal(line.unitPricePaisa),
          totalPrice: paisaToDecimal(line.unitPricePaisa * allocation.quantity),
          unitCost,
        });
      }
    }
    await tx.insert(orderItems).values(itemRows);

    if (applied !== null) {
      await couponService.redeem(applied, userId, tx);
    }

    await tx.insert(orderStatusHistory).values({
      orderId: order.id,
      fromStatus: null,
      toStatus: "PENDING",
      changedBy: userId,
      note: "Order placed",
    });

    return order.id;
  }

  /** Full order (items, history) by id. 404 when missing. */
  async getOrderDetail(orderId: string, viewer: OrderViewer): Promise<OrderDetailDTO> {
    const row = await loadOrderGraph(eq(orders.id, orderId));
    if (!row) throw AppError.notFound("Order");
    return toDetailDTO(row, viewer);
  }

  /** Order by UUID or order number for its owner or ORDERS_READ staff (404 / 403). */
  async getOrderForViewer(idOrNumber: string, viewer: OrderViewer): Promise<OrderDetailDTO> {
    const row = await loadOrderGraph(orderLookupCondition(idOrNumber));
    if (!row) throw AppError.notFound("Order");
    if (row.userId !== viewer.id && !isOrderStaff(viewer.role)) {
      throw AppError.forbidden("You do not have access to this order");
    }
    return toDetailDTO(row, viewer);
  }

  /** The caller's orders, newest first. */
  async listCustomerOrders(
    userId: string,
    page: number,
    limit: number,
  ): Promise<{ items: OrderSummaryDTO[]; total: number }> {
    const where = eq(orders.userId, userId);
    const [totalRow] = await db.select({ value: count() }).from(orders).where(where);
    const rows = await db.query.orders.findMany({
      where,
      orderBy: [desc(orders.createdAt), desc(orders.id)],
      limit,
      offset: (page - 1) * limit,
      with: {
        items: {
          orderBy: [asc(orderItems.productId)],
          with: {
            product: { columns: { title: true, slug: true, sku: true, images: true } },
            batch: { columns: { batchNumber: true, expiryDate: true } },
          },
        },
      },
    });

    const items = rows.map((row): OrderSummaryDTO => {
      const lines = row.items.map(toOrderItemDTO);
      return {
        id: row.id,
        orderNumber: row.orderNumber,
        status: row.status,
        paymentMethod: row.paymentMethod,
        paymentStatus: row.paymentStatus,
        subtotal: moneyToNumber(row.subtotal),
        deliveryFee: moneyToNumber(row.deliveryFee),
        discountAmount: moneyToNumber(row.discountAmount),
        total: moneyToNumber(row.total),
        itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
        items: summarizeLines(lines),
        trackingId: row.trackingId,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      };
    });

    return { items, total: Number(totalRow?.value ?? 0) };
  }

  /** Back-office order list with filters (status, payment status/method, free-text search, business-date range). */
  async listAdminOrders(query: AdminOrdersQuery): Promise<{ items: AdminOrderListItemDTO[]; total: number }> {
    const conditions: SQL[] = [];
    if (query.status) {
      conditions.push(eq(orders.status, query.status));
    }
    if (query.paymentStatus) {
      conditions.push(eq(orders.paymentStatus, query.paymentStatus));
    }
    if (query.paymentMethod) {
      conditions.push(eq(orders.paymentMethod, query.paymentMethod));
    }
    if (query.q) {
      const pattern = containsPattern(query.q);
      const phone = normalizeBangladeshMobile(query.q);
      const phonePattern = phone === null ? pattern : `%${phone}%`;
      conditions.push(
        sql`(
          ${orders.orderNumber} ILIKE ${pattern}
          OR ${orders.shippingAddress}->>'fullName' ILIKE ${pattern}
          OR ${orders.shippingAddress}->>'phone' ILIKE ${phonePattern}
          OR EXISTS (
            SELECT 1 FROM ${users}
            WHERE ${users.id} = ${orders.userId}
              AND (${users.fullName} ILIKE ${pattern} OR ${users.phone} ILIKE ${phonePattern} OR ${users.email} ILIKE ${pattern})
          )
        )`,
      );
    }
    if (query.courier) {
      conditions.push(
        query.courier.toLowerCase() === "unknown"
          ? sql`${orders.courierProvider} IS NULL`
          : sql`lower(${orders.courierProvider}) = lower(${query.courier})`,
      );
    }
    // The range filters on the requested timestamp; rows where it is NULL
    // (e.g. never shipped) never match a shippedAt / deliveredAt range.
    const dateColumn =
      query.dateField === "shippedAt"
        ? orders.shippedAt
        : query.dateField === "deliveredAt"
          ? orders.deliveredAt
          : orders.createdAt;
    if (query.from) conditions.push(onOrAfterBusinessDay(dateColumn, query.from));
    if (query.to) conditions.push(onOrBeforeBusinessDay(dateColumn, query.to));
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalRow] = await db.select({ value: count() }).from(orders).where(where);
    const page = await db
      .select({ id: orders.id })
      .from(orders)
      .where(where)
      .orderBy(desc(orders.createdAt), desc(orders.id))
      .limit(query.limit)
      .offset((query.page - 1) * query.limit);
    const ids = page.map((row) => row.id);
    if (ids.length === 0) {
      return { items: [], total: Number(totalRow?.value ?? 0) };
    }

    const rows = await db.query.orders.findMany({
      where: inArray(orders.id, ids),
      with: {
        user: { columns: { id: true, fullName: true, email: true, phone: true } },
        discount: { columns: { code: true } },
        items: {
          orderBy: [asc(orderItems.productId), asc(orderItems.createdAt)],
          with: {
            product: { columns: { title: true, slug: true, sku: true, images: true } },
            batch: { columns: { batchNumber: true, expiryDate: true } },
          },
        },
      },
    });
    const byId = new Map(rows.map((row) => [row.id, row]));

    const items: AdminOrderListItemDTO[] = [];
    for (const id of ids) {
      const row = byId.get(id);
      if (!row) continue;
      const lines = row.items.map(toOrderItemDTO);
      items.push({
        id: row.id,
        orderNumber: row.orderNumber,
        status: row.status,
        paymentMethod: row.paymentMethod,
        paymentStatus: row.paymentStatus,
        subtotal: moneyToNumber(row.subtotal),
        deliveryFee: moneyToNumber(row.deliveryFee),
        discountAmount: moneyToNumber(row.discountAmount),
        total: moneyToNumber(row.total),
        itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
        couponCode: row.discount?.code ?? null,
        courierProvider: row.courierProvider,
        trackingId: row.trackingId,
        shippingAddress: readShippingAddress(row.shippingAddress),
        customer: { id: row.user.id, fullName: row.user.fullName, email: row.user.email, phone: row.user.phone },
        items: lines,
        allowedTransitions: nextStatuses(row.status),
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        shippedAt: isoOrNull(row.shippedAt),
        deliveredAt: isoOrNull(row.deliveredAt),
        cancelledAt: isoOrNull(row.cancelledAt),
      });
    }

    return { items, total: Number(totalRow?.value ?? 0) };
  }
}

export const orderService = new OrderService();
