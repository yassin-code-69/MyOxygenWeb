/**
 * Mounted at /admin in src/index.ts. See docs/API_CONTRACT.md ("Admin v2").
 *
 *   GET /admin/search?q=   any staff role (q: 2–100 chars)
 *
 * Groups the caller lacks permission for come back empty (and are not
 * queried): products need PRODUCTS_READ, orders and customers ORDERS_READ.
 */
import { Hono } from "hono";
import { ok } from "../lib/http";
import { hasPermission, Permissions } from "../lib/rbac";
import { validate } from "../lib/validation";
import { requireAuth, requireRole, type AuthContext } from "../middleware/auth";
import { searchService } from "../services/search.service";
import { USER_ROLES, type UserRole } from "../types";
import { adminSearchQuerySchema } from "./admin.schema";

export const adminSearchRoute = new Hono<AuthContext>();

const STAFF_ROLES: UserRole[] = USER_ROLES.filter((role) => role !== "CUSTOMER");

adminSearchRoute.get(
  "/search",
  requireAuth,
  requireRole(...STAFF_ROLES),
  validate("query", adminSearchQuerySchema),
  async (c) => {
    const { role } = c.get("user");
    const { q } = c.req.valid("query");
    const canReadOrders = hasPermission(role, Permissions.ORDERS_READ);
    const results = await searchService.search(q, {
      products: hasPermission(role, Permissions.PRODUCTS_READ),
      orders: canReadOrders,
      customers: canReadOrders,
    });
    return ok(c, results);
  },
);
