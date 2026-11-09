/**
 * Mounted at /admin in src/index.ts. GET /admin/customers, GET /admin/customers/:id, PATCH /admin/customers/:id.
 * See docs/API_CONTRACT.md ("Admin v2" → "Management").
 *
 * Authentication is applied per route (never `use("*")`), so these
 * middlewares do not run for the other /admin sub-apps.
 */
import { Hono } from "hono";
import { z } from "zod";
import { ok, paginated } from "../lib/http";
import { Permissions } from "../lib/rbac";
import { paginationQuery, uuidParam, validate } from "../lib/validation";
import { requireAuth, requirePermission, type AuthContext } from "../middleware/auth";
import { CUSTOMER_SORTS, customerService } from "../services/customer.service";

export const adminCustomersRoute = new Hono<AuthContext>();

const emptyToUndefined = (value: unknown): unknown =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

export const customerListQuerySchema = paginationQuery.extend({
  /** Name, email or phone (any Bangladeshi format, partial digits allowed). */
  q: z.preprocess(emptyToUndefined, z.string().trim().max(100).optional()),
  sort: z.preprocess(emptyToUndefined, z.enum(CUSTOMER_SORTS).default("newest")),
});

export const updateCustomerSchema = z.object({ isActive: z.boolean() }).strict();

// GET /admin/customers — CUSTOMER accounts with order aggregates
adminCustomersRoute.get(
  "/customers",
  requireAuth,
  requirePermission(Permissions.ORDERS_READ),
  validate("query", customerListQuerySchema),
  async (c) => {
    const query = c.req.valid("query");
    const { items, total } = await customerService.listCustomers(query);
    return paginated(c, items, { page: query.page, limit: query.limit, total });
  },
);

// GET /admin/customers/:id — profile, stats, recent orders, addresses
adminCustomersRoute.get(
  "/customers/:id",
  requireAuth,
  requirePermission(Permissions.ORDERS_READ),
  validate("param", uuidParam),
  async (c) => {
    const { id } = c.req.valid("param");
    return ok(c, await customerService.getCustomer(id));
  },
);

// PATCH /admin/customers/:id — activate / deactivate a CUSTOMER account
adminCustomersRoute.patch(
  "/customers/:id",
  requireAuth,
  requirePermission(Permissions.STAFF_MANAGE),
  validate("param", uuidParam),
  validate("json", updateCustomerSchema),
  async (c) => {
    const { id } = c.req.valid("param");
    const { isActive } = c.req.valid("json");
    return ok(c, await customerService.setCustomerActive(id, isActive));
  },
);
