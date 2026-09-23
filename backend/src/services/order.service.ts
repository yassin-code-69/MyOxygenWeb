import { desc, eq, inArray, sql } from "drizzle-orm";
import { db as defaultDb } from "../db";
import {
  orders,
  orderItems,
  products,
} from "../db/schema/tables";
import type { DatabaseClient } from "../db/client";
import type { CheckoutPayload } from "../routes/orders.schema";
import { inventoryService } from "./inventory.service";
import { couponService, type CouponItemInput } from "./coupon.service";

export interface OrderItemWithDetails {
  id: string;
  orderId: string;
  productId: string;
  batchId: string | null;
  quantity: number;
  unitPrice: string;
  totalPrice: string;
  product?: {
    id: string;
    title: string;
    slug: string;
    sku: string;
    images: string[];
    basePrice: string;
  };
  batch?: {
    id: string;
    batchNumber: string;
    expiryDate: string;
  } | null;
}

export function parseShippingAddress(address: unknown) {
  if (!address) return null;
  if (typeof address === "object") return address;
  if (typeof address === "string") {
    try {
      const trimmed = address.trim();
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        return JSON.parse(trimmed);
      }
    } catch {
      // Fallback to raw string
    }
  }
  return address;
}

export class OrderService {
  /**
   * Atomically places an order inside a transaction:
   * 1. Validates product availability and pricing.
   * 2. Runs FEFO allocation and reserves batch stock.
   * 3. Calculates subtotal, delivery fee (free >= 1500, else 60), and coupon discount.
   * 4. Generates unique orderNumber ORD-${Date.now()}-${random4Digits}.
   * 5. Inserts orders and orderItems records.
   */
  async createOrder(
    payload: CheckoutPayload,
    userId: string,
    db: DatabaseClient = defaultDb,
  ) {
    if (!payload.items || payload.items.length === 0) {
      throw new Error("Cart must contain at least one item");
    }

    return await (db as any).transaction(async (tx: any) => {
      const orderId = crypto.randomUUID();
      const random4Digits = Math.floor(1000 + Math.random() * 9000);
      const orderNumber = `ORD-${Date.now()}-${random4Digits}`;

      // Map payment method
      const paymentMethod =
        payload.paymentMethod === "CASH_ON_DELIVERY"
          ? "COD"
          : payload.paymentMethod;

      // 1. Fetch products to get accurate current pricing
      const productIds = payload.items.map((i) => i.productId);
      const dbProducts = await tx
        .select()
        .from(products)
        .where(inArray(products.id, productIds));

      const productMap = new Map<string, any>(dbProducts.map((p: any) => [p.id, p]));

      const itemsWithPrice: CouponItemInput[] = [];
      const orderItemsToInsert: Array<{
        id: string;
        orderId: string;
        productId: string;
        batchId: string | null;
        quantity: number;
        unitPrice: string;
        totalPrice: string;
      }> = [];

      let subtotal = 0;

      // 2. Process each item: allocate batches via FEFO and reserve stock
      for (const item of payload.items) {
        const product = productMap.get(item.productId);
        if (!product) {
          throw new Error(`Product ${item.productId} not found`);
        }
        if (!product.isActive) {
          throw new Error(`Product "${product.title}" is currently unavailable`);
        }

        const unitPrice = parseFloat(product.basePrice);
        itemsWithPrice.push({
          productId: item.productId,
          quantity: item.quantity,
          unitPrice,
        });

        subtotal += unitPrice * item.quantity;

        // Allocate batches using FEFO
        const allocations = await inventoryService.allocateBatchesFEFO(
          item.productId,
          item.quantity,
          tx,
        );

        // Reserve stock on batches
        await inventoryService.reserveStock(allocations, orderId, userId, tx);

        // Create order item rows linking allocated batches
        for (const allocation of allocations) {
          orderItemsToInsert.push({
            id: crypto.randomUUID(),
            orderId,
            productId: item.productId,
            batchId: allocation.batchId,
            quantity: allocation.quantity,
            unitPrice: unitPrice.toFixed(2),
            totalPrice: (unitPrice * allocation.quantity).toFixed(2),
          });
        }
      }

      // 3. Delivery fee: Flat 60 BDT, free over 1500 BDT
      const deliveryFee = subtotal >= 1500 ? 0 : 60;

      // 4. Coupon discount validation if provided
      let discountAmount = 0;
      if (payload.couponCode && payload.couponCode.trim()) {
        const couponResult = await couponService.validateCoupon(
          payload.couponCode,
          subtotal,
          itemsWithPrice,
          tx,
        );
        discountAmount = couponResult.discountAmount;
      }

      // 5. Total calculation
      const total = Math.max(0, subtotal + deliveryFee - discountAmount);

      // 6. Insert Order
      const [newOrder] = await tx
        .insert(orders)
        .values({
          id: orderId,
          orderNumber,
          userId,
          status: "PENDING",
          paymentMethod,
          paymentStatus: "UNPAID",
          shippingAddress:
            typeof payload.shippingAddress === "string"
              ? payload.shippingAddress
              : JSON.stringify(payload.shippingAddress),
          subtotal: subtotal.toFixed(2),
          deliveryFee: deliveryFee.toFixed(2),
          discountAmount: discountAmount.toFixed(2),
          total: total.toFixed(2),
        })
        .returning();

      // 7. Insert Order Line Items
      const createdItems = await tx
        .insert(orderItems)
        .values(orderItemsToInsert)
        .returning();

      return {
        ...newOrder,
        shippingAddress: parseShippingAddress(newOrder.shippingAddress),
        items: createdItems,
      };
    });
  }

  /**
   * Retrieves an order by its UUID or orderNumber, with related items, products, batches, and user.
   */
  async getOrderByIdOrNumber(
    idOrNumber: string,
    db: DatabaseClient = defaultDb,
  ) {
    const isUUID =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        idOrNumber,
      );

    const order = await db.query.orders.findFirst({
      where: isUUID
        ? eq(orders.id, idOrNumber)
        : eq(orders.orderNumber, idOrNumber),
      with: {
        items: {
          with: {
            product: {
              columns: {
                id: true,
                title: true,
                slug: true,
                sku: true,
                images: true,
                basePrice: true,
              },
            },
            batch: {
              columns: {
                id: true,
                batchNumber: true,
                expiryDate: true,
              },
            },
          },
        },
        user: {
          columns: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
          },
        },
      },
    });

    if (!order) return null;

    return {
      ...order,
      shippingAddress: parseShippingAddress(order.shippingAddress),
    };
  }

  /**
   * Retrieves all orders placed by a specific user, sorted most recent first.
   */
  async getUserOrders(userId: string, db: DatabaseClient = defaultDb) {
    const userOrders = await db.query.orders.findMany({
      where: eq(orders.userId, userId),
      orderBy: [desc(orders.createdAt)],
      with: {
        items: {
          with: {
            product: {
              columns: {
                id: true,
                title: true,
                slug: true,
                sku: true,
                images: true,
                basePrice: true,
              },
            },
            batch: {
              columns: {
                id: true,
                batchNumber: true,
                expiryDate: true,
              },
            },
          },
        },
      },
    });

    return userOrders.map((order) => ({
      ...order,
      shippingAddress: parseShippingAddress(order.shippingAddress),
    }));
  }
}

export const orderService = new OrderService();
