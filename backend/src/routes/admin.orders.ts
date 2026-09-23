import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, count, desc, eq, ilike, or } from "drizzle-orm";
import { db } from "../db";
import { orders } from "../db/schema/tables";
import { Permissions } from "../lib/rbac";
import { requireAuth, requirePermission, type AuthContext } from "../middleware/auth";
import { adminTelemetryService } from "../services/admin-telemetry.service";
import { inventoryService } from "../services/inventory.service";
import { courierService } from "../services/courier/courier.service";
import { parseShippingAddress } from "../services/order.service";
import {
  orderStatusEnumValues,
  updateOrderStatusSchema,
} from "./admin.schema";

export const adminOrdersRoute = new Hono<AuthContext>();

// All admin order & telemetry routes enforce valid JWT authentication
adminOrdersRoute.use("*", requireAuth);

// ─────────────────────────────────────────────────────────────
// GET /admin/analytics/summary — Telemetry Metrics & Aggregation
// ─────────────────────────────────────────────────────────────
adminOrdersRoute.get(
  "/analytics/summary",
  requirePermission(Permissions.ANALYTICS_READ),
  async (c) => {
    try {
      const summary = await adminTelemetryService.getTelemetrySummary(db);
      return c.json({
        success: true,
        data: summary,
      });
    } catch (error: any) {
      return c.json(
        {
          success: false,
          error: error.message || "Failed to fetch telemetry summary",
        },
        500,
      );
    }
  },
);

// ─────────────────────────────────────────────────────────────
// GET /admin/orders — Paginated Order Management
// ─────────────────────────────────────────────────────────────
adminOrdersRoute.get(
  "/orders",
  requirePermission(Permissions.ORDERS_READ),
  async (c) => {
    try {
      const page = Math.max(1, Number(c.req.query("page") || 1));
      const limit = Math.min(
        100,
        Math.max(1, Number(c.req.query("limit") || 10)),
      );
      const offset = (page - 1) * limit;
      const statusParam = c.req.query("status");
      const searchParam = c.req.query("search")?.trim();

      const conditions: any[] = [];
      if (
        statusParam &&
        orderStatusEnumValues.includes(statusParam as any)
      ) {
        conditions.push(eq(orders.status, statusParam as any));
      }
      if (searchParam) {
        conditions.push(
          or(
            ilike(orders.orderNumber, `%${searchParam}%`),
            ilike(orders.shippingAddress, `%${searchParam}%`),
          ),
        );
      }

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const [totalRes] = await db
        .select({ count: count() })
        .from(orders)
        .where(where);
      const total = Number(totalRes?.count || 0);

      const orderList = await db.query.orders.findMany({
        where,
        limit,
        offset,
        orderBy: [desc(orders.createdAt)],
        with: {
          user: {
            columns: {
              id: true,
              fullName: true,
              email: true,
              phone: true,
              role: true,
            },
          },
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

      const formattedOrders = orderList.map((ord) => ({
        ...ord,
        shippingAddress: parseShippingAddress(ord.shippingAddress),
      }));

      return c.json({
        success: true,
        data: formattedOrders,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasNextPage: page * limit < total,
          hasPrevPage: page > 1,
        },
      });
    } catch (error: any) {
      return c.json(
        {
          success: false,
          error: error.message || "Failed to fetch orders",
        },
        500,
      );
    }
  },
);

// ─────────────────────────────────────────────────────────────
// PATCH /admin/orders/:id/status — Status Transition & Cancellation
// ─────────────────────────────────────────────────────────────
adminOrdersRoute.patch(
  "/orders/:id/status",
  requirePermission(Permissions.ORDERS_STATUS_UPDATE),
  zValidator("json", updateOrderStatusSchema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          success: false,
          error: "Validation failed",
          details: result.error.flatten(),
        },
        400,
      );
    }
  }),
  async (c) => {
    const { id } = c.req.param();
    const body = c.req.valid("json");
    const userPayload = c.get("user");
    const userId = userPayload.sub;

    try {
      const order = await db.query.orders.findFirst({
        where: eq(orders.id, id),
      });

      if (!order) {
        return c.json({ success: false, error: "Order not found" }, 404);
      }

      // If transitioning to CANCELLED, release reserved stock
      if (body.status === "CANCELLED") {
        if (order.status === "CANCELLED") {
          return c.json(
            { success: false, error: "Order is already cancelled" },
            400,
          );
        }
        await inventoryService.releaseReservation(id, userId, db);
      }

      const updateValues: Record<string, any> = {
        status: body.status,
        updatedAt: new Date(),
      };
      if (body.courierProvider !== undefined) {
        updateValues.courierProvider = body.courierProvider;
      }
      if (body.trackingId !== undefined) {
        updateValues.trackingId = body.trackingId;
      }

      const [updatedOrder] = await db
        .update(orders)
        .set(updateValues)
        .where(eq(orders.id, id))
        .returning();

      return c.json({
        success: true,
        data: {
          ...updatedOrder,
          shippingAddress: parseShippingAddress(updatedOrder.shippingAddress),
        },
      });
    } catch (error: any) {
      return c.json(
        {
          success: false,
          error: error.message || "Failed to update order status",
        },
        400,
      );
    }
  },
);

// ─────────────────────────────────────────────────────────────
// POST /admin/orders/:id/dispatch-courier — Steadfast Courier Dispatch
// ─────────────────────────────────────────────────────────────
adminOrdersRoute.post(
  "/orders/:id/dispatch-courier",
  requirePermission(Permissions.COURIER_ASSIGN),
  async (c) => {
    const { id } = c.req.param();

    try {
      let reqBody: any = {};
      try {
        reqBody = await c.req.json();
      } catch {
        // Body is optional
      }

      const order = await db.query.orders.findFirst({
        where: eq(orders.id, id),
        with: {
          user: true,
          items: true,
        },
      });

      if (!order) {
        return c.json({ success: false, error: "Order not found" }, 404);
      }

      if (order.status === "CANCELLED") {
        return c.json(
          { success: false, error: "Cannot dispatch a cancelled order" },
          400,
        );
      }

      const address = parseShippingAddress(order.shippingAddress);
      let recipientName = order.user?.fullName || "Valued Customer";
      let recipientPhone = order.user?.phone || "";
      let recipientAddress = "Dhaka";
      let city = "Dhaka";

      if (typeof address === "object" && address !== null) {
        recipientName =
          (address as any).fullName ||
          (address as any).recipientName ||
          recipientName;
        recipientPhone =
          (address as any).phone ||
          (address as any).recipientPhone ||
          recipientPhone;
        recipientAddress =
          (address as any).addressLine1 ||
          (address as any).address ||
          recipientAddress;
        city = (address as any).city || city;
      } else if (typeof address === "string" && address.trim()) {
        recipientAddress = address.trim();
      }

      const codAmount =
        order.paymentMethod === "COD" && order.paymentStatus === "UNPAID"
          ? parseFloat(order.total)
          : 0;

      const parcelResult = await courierService.createParcel(
        {
          orderNumber: order.orderNumber,
          recipientName,
          recipientPhone,
          recipientAddress,
          city: reqBody?.city || city,
          codAmount,
          note: reqBody?.note || `Order #${order.orderNumber}`,
          weight: reqBody?.weight ?? 0.5,
        },
        reqBody?.courierProvider,
      );

      const [updatedOrder] = await db
        .update(orders)
        .set({
          status: "SHIPPED",
          trackingId: parcelResult.trackingId,
          courierProvider: parcelResult.provider,
          updatedAt: new Date(),
        })
        .where(eq(orders.id, id))
        .returning();

      return c.json({
        success: true,
        data: {
          ...updatedOrder,
          shippingAddress: parseShippingAddress(updatedOrder.shippingAddress),
          parcel: parcelResult,
        },
      });
    } catch (error: any) {
      return c.json(
        {
          success: false,
          error: error.message || "Failed to dispatch courier",
        },
        400,
      );
    }
  },
);
