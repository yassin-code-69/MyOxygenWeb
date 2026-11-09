/**
 * Mounted at /admin in src/index.ts. See docs/API_CONTRACT.md ("Admin v2").
 *
 *   GET /admin/payments/summary?from&to   ORDERS_READ   collected / pending COD / refunded / failed,
 *                                                       per method and per payment status
 * (The `paymentStatus` / `paymentMethod` filters of GET /admin/orders live in admin.orders.ts.)
 */
import { Hono } from "hono";
import { ok } from "../lib/http";
import { Permissions } from "../lib/rbac";
import { validate } from "../lib/validation";
import { requireAuth, requirePermission, type AuthContext } from "../middleware/auth";
import { paymentService } from "../services/payment.service";
import { paymentSummaryQuerySchema } from "./admin.schema";

export const adminPaymentsRoute = new Hono<AuthContext>();

adminPaymentsRoute.get(
  "/payments/summary",
  requireAuth,
  requirePermission(Permissions.ORDERS_READ),
  validate("query", paymentSummaryQuerySchema),
  async (c) => {
    return ok(c, await paymentService.summary(c.req.valid("query")));
  },
);
