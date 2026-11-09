/**
 * Mounted at /admin in src/index.ts. See docs/API_CONTRACT.md ("Admin v2").
 *
 *   GET /admin/analytics/activity              ANALYTICS_READ   recent activity feed
 *   GET /admin/reports/products                ANALYTICS_READ   product sales report (paginated, meta.totals)
 *   GET /admin/reports/customers               ANALYTICS_READ   customer report (meta paginates topCustomers)
 *   GET /admin/reports/inventory               ANALYTICS_READ   inventory snapshot
 *   GET /admin/reports/profit                  SUPER_ADMIN      profit & margin overview
 *   GET /admin/reports/profit/products         SUPER_ADMIN      product profitability (paginated)
 *   GET /admin/reports/profit/products/:id     SUPER_ADMIN      one product's profitability
 *
 * Authentication is applied per route (never `use("*")`) so these middlewares
 * do not run for the other /admin sub-apps. Formulas live in the services
 * under src/services/reports.
 */
import { Hono, type Context } from "hono";
import { buildPaginationMeta, ok, paginated } from "../lib/http";
import { Permissions } from "../lib/rbac";
import { uuidParam, validate } from "../lib/validation";
import { requireAuth, requirePermission, requireRole, type AuthContext } from "../middleware/auth";
import { activityService } from "../services/reports/activity.service";
import { inventoryReportService } from "../services/reports/inventory-report.service";
import { profitReportService } from "../services/reports/profit-report.service";
import { salesReportService } from "../services/reports/sales-report.service";
import type { ApiSuccess, PaginationMeta } from "../types";
import {
  activityQuerySchema,
  customerReportQuerySchema,
  productReportQuerySchema,
  profitProductsQuerySchema,
  reportRangeQuerySchema,
} from "./admin.schema";

export const adminReportsRoute = new Hono<AuthContext>();

/** 200 with pagination meta plus extra meta keys (e.g. `totals`, `totalAmount`). */
export function paginatedWithMeta<T, Extra extends Record<string, unknown>>(
  c: Context,
  items: T[],
  pagination: { page: number; limit: number; total: number },
  extra: Extra,
): Response {
  const body: ApiSuccess<T[], PaginationMeta & Extra> = {
    success: true,
    data: items,
    meta: { ...buildPaginationMeta(pagination.page, pagination.limit, pagination.total), ...extra },
  };
  return c.json(body, 200);
}

/** 200 with a non-list `data` object whose nested list is paginated by `meta`. */
function okWithPagination<T>(c: Context, data: T, pagination: { page: number; limit: number; total: number }): Response {
  const body: ApiSuccess<T> = {
    success: true,
    data,
    meta: buildPaginationMeta(pagination.page, pagination.limit, pagination.total),
  };
  return c.json(body, 200);
}

adminReportsRoute.get(
  "/analytics/activity",
  requireAuth,
  requirePermission(Permissions.ANALYTICS_READ),
  validate("query", activityQuerySchema),
  async (c) => {
    const { limit } = c.req.valid("query");
    return ok(c, await activityService.recentActivity(limit));
  },
);

adminReportsRoute.get(
  "/reports/products",
  requireAuth,
  requirePermission(Permissions.ANALYTICS_READ),
  validate("query", productReportQuerySchema),
  async (c) => {
    const query = c.req.valid("query");
    const { items, total, totals } = await salesReportService.productReport(query);
    return paginatedWithMeta(c, items, { page: query.page, limit: query.limit, total }, { totals });
  },
);

adminReportsRoute.get(
  "/reports/customers",
  requireAuth,
  requirePermission(Permissions.ANALYTICS_READ),
  validate("query", customerReportQuerySchema),
  async (c) => {
    const query = c.req.valid("query");
    const { report, total } = await salesReportService.customerReport(query);
    return okWithPagination(c, report, { page: query.page, limit: query.limit, total });
  },
);

adminReportsRoute.get(
  "/reports/inventory",
  requireAuth,
  requirePermission(Permissions.ANALYTICS_READ),
  async (c) => {
    return ok(c, await inventoryReportService.inventoryReport());
  },
);

adminReportsRoute.get(
  "/reports/profit",
  requireAuth,
  requireRole("SUPER_ADMIN"),
  validate("query", reportRangeQuerySchema),
  async (c) => {
    return ok(c, await profitReportService.profitSummary(c.req.valid("query")));
  },
);

adminReportsRoute.get(
  "/reports/profit/products",
  requireAuth,
  requireRole("SUPER_ADMIN"),
  validate("query", profitProductsQuerySchema),
  async (c) => {
    const query = c.req.valid("query");
    const { items, total } = await profitReportService.profitProducts(query);
    return paginated(c, items, { page: query.page, limit: query.limit, total });
  },
);

adminReportsRoute.get(
  "/reports/profit/products/:id",
  requireAuth,
  requireRole("SUPER_ADMIN"),
  validate("param", uuidParam),
  validate("query", reportRangeQuerySchema),
  async (c) => {
    const { id } = c.req.valid("param");
    return ok(c, await profitReportService.profitProductDetail(id, c.req.valid("query")));
  },
);
