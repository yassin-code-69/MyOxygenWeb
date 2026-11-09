/**
 * Back-office order, fulfillment and telemetry endpoints (mounted at /admin).
 * Authentication is applied per route (not with `use("*")`) so these
 * middlewares never run for other /admin sub-apps.
 */
import { Hono, type Context } from "hono";
import { ok, paginated } from "../lib/http";
import { Permissions } from "../lib/rbac";
import { uuidParam, validate } from "../lib/validation";
import { requireAuth, requirePermission, type AuthContext } from "../middleware/auth";
import { adminTelemetryService } from "../services/admin-telemetry.service";
import { orderFulfillmentService } from "../services/order-fulfillment.service";
import { orderStatusService } from "../services/order-status.service";
import { orderService, type OrderViewer } from "../services/order.service";
import {
  adminOrdersQuerySchema,
  analyticsQuerySchema,
  dispatchCourierSchema,
  updateOrderStatusSchema,
} from "./admin.schema";

export const adminOrdersRoute = new Hono<AuthContext>();

function viewerOf(c: Context<AuthContext>): OrderViewer {
  const user = c.get("user");
  return { id: user.sub, role: user.role };
}

// GET /admin/analytics/summary — dashboard telemetry
adminOrdersRoute.get(
  "/analytics/summary",
  requireAuth,
  requirePermission(Permissions.ANALYTICS_READ),
  validate("query", analyticsQuerySchema),
  async (c) => {
    const summary = await adminTelemetryService.getSummary(c.req.valid("query"));
    return ok(c, summary);
  },
);

// GET /admin/orders — paginated, filterable order list
adminOrdersRoute.get(
  "/orders",
  requireAuth,
  requirePermission(Permissions.ORDERS_READ),
  validate("query", adminOrdersQuerySchema),
  async (c) => {
    const query = c.req.valid("query");
    const { items, total } = await orderService.listAdminOrders(query);
    return paginated(c, items, { page: query.page, limit: query.limit, total });
  },
);

// PATCH /admin/orders/:id/status — state-machine transition
adminOrdersRoute.patch(
  "/orders/:id/status",
  requireAuth,
  requirePermission(Permissions.ORDERS_STATUS_UPDATE),
  validate("param", uuidParam),
  validate("json", updateOrderStatusSchema),
  async (c) => {
    const { id } = c.req.valid("param");
    const order = await orderStatusService.changeStatus(id, c.req.valid("json"), viewerOf(c));
    return ok(c, order);
  },
);

// POST /admin/orders/:id/dispatch-courier — book the parcel, PROCESSING → SHIPPED
adminOrdersRoute.post(
  "/orders/:id/dispatch-courier",
  requireAuth,
  requirePermission(Permissions.COURIER_ASSIGN),
  validate("param", uuidParam),
  validate("json", dispatchCourierSchema),
  async (c) => {
    const { id } = c.req.valid("param");
    const result = await orderFulfillmentService.dispatch(id, c.req.valid("json"), viewerOf(c));
    return ok(c, result);
  },
);

// GET /admin/orders/:id/tracking — live courier status + stored timeline
adminOrdersRoute.get(
  "/orders/:id/tracking",
  requireAuth,
  requirePermission(Permissions.ORDERS_READ),
  validate("param", uuidParam),
  async (c) => {
    const { id } = c.req.valid("param");
    const tracking = await orderFulfillmentService.getTracking(id, viewerOf(c));
    return ok(c, tracking);
  },
);
