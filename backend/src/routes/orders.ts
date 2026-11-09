/**
 * Customer order endpoints (mounted at /orders). HTTP concerns only: every
 * rule lives in the services. Errors are thrown as AppError and rendered by
 * the global error handler.
 */
import { Hono, type Context } from "hono";
import { verifyAccessToken } from "../lib/jwt";
import { hasPermission, Permissions } from "../lib/rbac";
import { created, ok, paginated } from "../lib/http";
import { validate } from "../lib/validation";
import { requireAuth, type AuthContext } from "../middleware/auth";
import { rateLimiter } from "../middleware/rate-limiter";
import { couponService } from "../services/coupon.service";
import { invoiceService, pdfDownload } from "../services/invoice/invoice.service";
import { orderFulfillmentService } from "../services/order-fulfillment.service";
import { orderPricingService } from "../services/order-pricing";
import { orderStatusService } from "../services/order-status.service";
import { orderService, type OrderViewer } from "../services/order.service";
import {
  cancelOrderSchema,
  checkoutSchema,
  myOrdersQuerySchema,
  orderIdParam,
  orderNumberParam,
  orderRefParam,
  validateCouponSchema,
} from "./orders.schema";

export const ordersRoute = new Hono<AuthContext>();

/** Coupon guessing protection: 30 previews per minute per client IP. */
const couponPreviewLimiter = rateLimiter({ name: "orders:validate-coupon", maxRequests: 30, windowMs: 60_000 });

function viewerOf(c: Context<AuthContext>): OrderViewer {
  const user = c.get("user");
  return { id: user.sub, role: user.role };
}

/** Caller id when a valid access token is sent; anonymous otherwise (never 401). */
async function optionalUserId(c: Context): Promise<string | null> {
  const match = c.req.header("Authorization")?.match(/^Bearer\s+(\S+)$/i);
  if (!match) return null;
  try {
    const payload = await verifyAccessToken(match[1]);
    return payload.sub;
  } catch {
    return null;
  }
}

// POST /orders/checkout — place an order (201)
ordersRoute.post("/checkout", requireAuth, validate("json", checkoutSchema), async (c) => {
  const body = c.req.valid("json");
  const order = await orderService.placeOrder(
    {
      items: body.items,
      shippingAddress: body.shippingAddress,
      paymentMethod: body.paymentMethod,
      couponCode: body.couponCode,
    },
    viewerOf(c),
  );
  return created(c, order);
});

// POST /orders/validate-coupon — read-only coupon preview at server prices
ordersRoute.post("/validate-coupon", couponPreviewLimiter, validate("json", validateCouponSchema), async (c) => {
  const { code, items } = c.req.valid("json");
  const cart = await orderPricingService.priceCart(items);
  const preview = await couponService.preview(code, cart, await optionalUserId(c));
  return ok(c, preview);
});

// GET /orders/my-orders — the caller's orders, newest first
ordersRoute.get("/my-orders", requireAuth, validate("query", myOrdersQuerySchema), async (c) => {
  const { page, limit } = c.req.valid("query");
  const { items, total } = await orderService.listCustomerOrders(c.get("user").sub, page, limit);
  return paginated(c, items, { page, limit, total });
});

// GET /orders/:id/invoice — PDF invoice (owner or ORDERS_READ). A missing PDF
// is generated only for the owner or staff with INVOICE_GENERATE.
ordersRoute.get("/:id/invoice", requireAuth, validate("param", orderIdParam), async (c) => {
  const { id } = c.req.valid("param");
  const viewer = viewerOf(c);
  const order = await orderService.getOrderForViewer(id, viewer);
  const canGenerate = order.userId === viewer.id || hasPermission(viewer.role, Permissions.INVOICE_GENERATE);
  const file = await invoiceService.getOrCreateOrderPdf(order.id, canGenerate);
  const download = pdfDownload(file, `invoice-${order.orderNumber}.pdf`);
  return c.body(download.body, 200, download.headers);
});

// POST /orders/:id/cancel — owner cancels a PENDING order
ordersRoute.post(
  "/:id/cancel",
  requireAuth,
  validate("param", orderIdParam),
  validate("json", cancelOrderSchema),
  async (c) => {
    const { id } = c.req.valid("param");
    const { reason } = c.req.valid("json");
    const order = await orderStatusService.cancelByCustomer(id, viewerOf(c), reason);
    return ok(c, order);
  },
);

// GET /orders/:orderNumber/track — status timeline + live courier status (owner or ORDERS_READ)
ordersRoute.get("/:orderNumber/track", requireAuth, validate("param", orderNumberParam), async (c) => {
  const { orderNumber } = c.req.valid("param");
  const tracking = await orderFulfillmentService.getTracking(orderNumber, viewerOf(c));
  return ok(c, tracking);
});

// GET /orders/:idOrNumber — order detail (owner or ORDERS_READ)
ordersRoute.get("/:idOrNumber", requireAuth, validate("param", orderRefParam), async (c) => {
  const { idOrNumber } = c.req.valid("param");
  const order = await orderService.getOrderForViewer(idOrNumber, viewerOf(c));
  return ok(c, order);
});
