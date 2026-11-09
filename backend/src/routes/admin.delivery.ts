/**
 * Mounted at /admin in src/index.ts. GET /admin/delivery/summary (ORDERS_READ).
 * See docs/API_CONTRACT.md ("Admin v2" → "Management").
 *
 * Authentication is applied per route (never `use("*")`), so these
 * middlewares do not run for the other /admin sub-apps.
 */
import { Hono } from "hono";
import { z } from "zod";
import { ok } from "../lib/http";
import { Permissions } from "../lib/rbac";
import { validate } from "../lib/validation";
import { requireAuth, requirePermission, type AuthContext } from "../middleware/auth";
import { deliveryService } from "../services/delivery.service";
import { businessDateSchema } from "./admin.schema";

export const adminDeliveryRoute = new Hono<AuthContext>();

const emptyToUndefined = (value: unknown): unknown =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

/** Inclusive business dates; default = the 30 days ending today (span ≤ 366 days, checked by the service). */
export const deliverySummaryQuerySchema = z
  .object({
    from: z.preprocess(emptyToUndefined, businessDateSchema.optional()),
    to: z.preprocess(emptyToUndefined, businessDateSchema.optional()),
  })
  .superRefine((value, ctx) => {
    if (value.from && value.to && value.from > value.to) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["from"], message: "from must be on or before to" });
    }
  });

// GET /admin/delivery/summary — fulfilment counters and per-courier breakdown
adminDeliveryRoute.get(
  "/delivery/summary",
  requireAuth,
  requirePermission(Permissions.ORDERS_READ),
  validate("query", deliverySummaryQuerySchema),
  async (c) => {
    return ok(c, await deliveryService.getSummary(c.req.valid("query")));
  },
);
