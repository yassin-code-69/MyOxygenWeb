import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { requireAuth, type AuthContext } from "../middleware/auth";
import {
  checkoutSchema,
  validateCouponSchema,
} from "./orders.schema";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { orders } from "../db/schema/tables";
import { Permissions, RolePermissions } from "../lib/rbac";
import { orderService } from "../services/order.service";
import { couponService } from "../services/coupon.service";
import { invoiceService } from "../services/invoice/invoice.service";
import { notificationService } from "../services/notification/notification.service";

export const ordersRoute = new Hono<AuthContext>();

// ──────────────────────────────────────────────
// POST /orders/checkout — Place Order
// ──────────────────────────────────────────────
ordersRoute.post(
  "/checkout",
  requireAuth,
  zValidator("json", checkoutSchema, (result, c) => {
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
    const body = c.req.valid("json");
    const userPayload = c.get("user");
    const userId = userPayload.sub;

    try {
      const order = await orderService.createOrder(body, userId);

      // Fire-and-forget multi-channel notification dispatch
      try {
        const addressObj =
          typeof body.shippingAddress === "object"
            ? (body.shippingAddress as any)
            : {};
        const recipientPhone = addressObj.phone || (userPayload as any).phone || "";
        const recipientName =
          addressObj.recipientName ||
          addressObj.fullName ||
          (userPayload as any).fullName ||
          "Valued Customer";

        notificationService
          .sendOrderConfirmation({
            orderNumber: order.orderNumber,
            customerName: recipientName,
            recipientEmail: (userPayload as any).email || null,
            recipientPhone,
            subtotal: order.subtotal,
            deliveryFee: order.deliveryFee,
            discountAmount: order.discountAmount,
            total: order.total,
            items: (order.items || []).map((i: any) => ({
              title: `Item #${i.productId ? i.productId.slice(0, 8) : "N/A"}`,
              quantity: i.quantity,
              unitPrice: i.unitPrice,
              totalPrice: i.totalPrice,
            })),
          })
          .catch((err) => {
            console.error("Order notification fire-and-forget failed:", err);
          });
      } catch {
        // Notification failure never blocks checkout response
      }

      return c.json(
        {
          success: true,
          data: order,
        },
        201,
      );
    } catch (error: any) {
      return c.json(
        {
          success: false,
          error: error.message || "Failed to process order",
        },
        400,
      );
    }
  },
);

// ──────────────────────────────────────────────
// POST /orders/validate-coupon — Check Coupon
// ──────────────────────────────────────────────
ordersRoute.post(
  "/validate-coupon",
  zValidator("json", validateCouponSchema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          success: false,
          error: "Invalid coupon payload",
          details: result.error.flatten(),
        },
        400,
      );
    }
  }),
  async (c) => {
    const { code, items } = c.req.valid("json");

    try {
      const validationResult = await couponService.validateCouponForCart(
        code,
        items,
      );

      return c.json({
        success: true,
        data: validationResult,
      });
    } catch (error: any) {
      return c.json(
        {
          success: false,
          error: error.message || "Failed to validate coupon",
        },
        400,
      );
    }
  },
);

// ──────────────────────────────────────────────
// GET /orders/my-orders — Current User's Order History
// ──────────────────────────────────────────────
ordersRoute.get("/my-orders", requireAuth, async (c) => {
  const userPayload = c.get("user");
  const userId = userPayload.sub;

  try {
    const ordersList = await orderService.getUserOrders(userId);
    return c.json({
      success: true,
      data: ordersList,
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
});

// ──────────────────────────────────────────────
// GET /orders/:id/invoice — Download or View PDF Invoice
// ──────────────────────────────────────────────
ordersRoute.get("/:id/invoice", requireAuth, async (c) => {
  const id = c.req.param("id");
  const userPayload = c.get("user");
  const userId = userPayload.sub;

  try {
    const order = await orderService.getOrderByIdOrNumber(id);

    if (!order) {
      return c.json(
        {
          success: false,
          error: "Order not found",
        },
        404,
      );
    }

    // Role check: customer must own order or have ORDERS_READ permission
    const userRole = userPayload.role || "CUSTOMER";
    const hasOrdersRead =
      userRole === "SUPER_ADMIN" ||
      userRole === "ORDER_MANAGER" ||
      userRole === "SUPPORT_STAFF" ||
      Boolean(RolePermissions[userRole]?.includes(Permissions.ORDERS_READ));

    if (!hasOrdersRead && order.userId !== userId) {
      return c.json(
        {
          success: false,
          error: "Forbidden: You do not have permission to view this order invoice",
        },
        403,
      );
    }

    // Check if invoice already exists in database
    let existingInvoice = await invoiceService.getInvoiceByOrderId(order.id);
    let pdfBytes: Uint8Array;

    if (existingInvoice && existingInvoice.pdfBase64) {
      pdfBytes = new Uint8Array(Buffer.from(existingInvoice.pdfBase64, "base64"));
    } else {
      // Generate on the fly and persist purely into PostgreSQL database
      const result = await invoiceService.generateAndSaveInvoice(order as any);
      existingInvoice = result.invoice;
      pdfBytes = result.pdfBytes;

      // Update orders.pdfInvoiceUrl to endpoint URL
      try {
        await db
          .update(orders)
          .set({ pdfInvoiceUrl: `/orders/${order.id}/invoice` })
          .where(eq(orders.id, order.id));
      } catch {
        // Non-fatal if DB update fails
      }
    }

    const headers = new Headers();
    headers.set("Content-Type", "application/pdf");
    headers.set(
      "Content-Disposition",
      `inline; filename="invoice-${order.orderNumber}.pdf"`,
    );
    headers.set("Content-Length", String(pdfBytes.length));

    return new Response(pdfBytes.buffer as ArrayBuffer, {
      status: 200,
      headers,
    });
  } catch (error: any) {
    return c.json(
      {
        success: false,
        error: error.message || "Failed to retrieve invoice",
      },
      500,
    );
  }
});

// ──────────────────────────────────────────────
// GET /orders/:idOrNumber — Order Details
// ──────────────────────────────────────────────
ordersRoute.get("/:idOrNumber", requireAuth, async (c) => {
  const idOrNumber = c.req.param("idOrNumber");
  const userPayload = c.get("user");
  const userId = userPayload.sub;

  try {
    const order = await orderService.getOrderByIdOrNumber(idOrNumber);

    if (!order) {
      return c.json(
        {
          success: false,
          error: "Order not found",
        },
        404,
      );
    }

    // Role check: non-privileged users can only view their own orders
    const isStaff =
      userPayload.role === "SUPER_ADMIN" ||
      userPayload.role === "ORDER_MANAGER" ||
      userPayload.role === "SUPPORT_STAFF";

    if (!isStaff && order.userId !== userId) {
      return c.json(
        {
          success: false,
          error: "Forbidden: You do not have permission to view this order",
        },
        403,
      );
    }

    return c.json({
      success: true,
      data: order,
    });
  } catch (error: any) {
    return c.json(
      {
        success: false,
        error: error.message || "Failed to fetch order",
      },
      500,
    );
  }
});
