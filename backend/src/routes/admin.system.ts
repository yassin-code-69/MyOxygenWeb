/**
 * Mounted at /admin in src/index.ts. GET /admin/system/status (STAFF_MANAGE).
 * See docs/API_CONTRACT.md ("Admin v2" → "Management"). Never returns secrets.
 *
 * Authentication is applied per route (never `use("*")`), so these
 * middlewares do not run for the other /admin sub-apps.
 */
import { Hono } from "hono";
import { ok } from "../lib/http";
import { Permissions } from "../lib/rbac";
import { requireAuth, requirePermission, type AuthContext } from "../middleware/auth";
import { systemService } from "../services/system.service";

export const adminSystemRoute = new Hono<AuthContext>();

// GET /admin/system/status — API, database, jobs, integrations and cache status
adminSystemRoute.get("/system/status", requireAuth, requirePermission(Permissions.STAFF_MANAGE), async (c) => {
  const status = await systemService.getStatus();
  c.header("Cache-Control", "no-store");
  return ok(c, status);
});
