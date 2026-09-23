import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  requireAuth,
  requirePermission,
  type AuthContext,
} from "../middleware/auth";
import { Permissions } from "../lib/rbac";
import { batchInspectorService } from "../services/batch-inspector.service";
import { importBatchSchema } from "./inventory.schema";

export const adminBatchesRoute = new Hono<AuthContext>();

// Protected by requireAuth
adminBatchesRoute.use("*", requireAuth);

const ledgerQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  reason: z.string().optional(),
  productId: z.string().uuid().optional(),
  batchId: z.string().uuid().optional(),
});

/**
 * GET /admin/batches
 * Returns batch inspection list with FEFO healthStatus:
 * EXPIRED, EXPIRING_SOON, HEALTHY
 * Protected: BATCHES_MANAGE or SUPER_ADMIN
 */
adminBatchesRoute.get(
  "/batches",
  requirePermission(Permissions.BATCHES_MANAGE),
  async (c) => {
    const batches = await batchInspectorService.getAllBatchesWithStatus();
    return c.json({
      success: true,
      data: batches,
      batches,
      total: batches.length,
    });
  },
);

/**
 * POST /admin/batches
 * Admin perishable batch import with audit ledger creation
 * Protected: BATCHES_MANAGE or SUPER_ADMIN
 */
adminBatchesRoute.post(
  "/batches",
  requirePermission(Permissions.BATCHES_MANAGE),
  zValidator("json", importBatchSchema),
  async (c) => {
    const body = c.req.valid("json");
    const user = c.get("user");

    try {
      const batch = await batchInspectorService.importBatch({
        productId: body.productId,
        batchNumber: body.batchNumber,
        manufactureDate: body.manufactureDate,
        expiryDate: body.expiryDate,
        initialQuantity: body.initialQuantity,
        performedByUserId: user?.sub ?? null,
      });

      return c.json({ success: true, data: batch }, 201);
    } catch (err: any) {
      const message = err.message || "Failed to import batch";
      const status = message.includes("not found")
        ? 404
        : message.includes("already exists")
          ? 409
          : 400;
      return c.json({ success: false, error: message }, status);
    }
  },
);

/**
 * GET /admin/inventory/ledger
 * Returns paginated stock audit log with batch and product metadata
 * Supports filtering by reason and productId
 * Protected: STOCK_ADJUST or SUPER_ADMIN
 */
adminBatchesRoute.get(
  "/inventory/ledger",
  requirePermission(Permissions.STOCK_ADJUST),
  zValidator("query", ledgerQuerySchema),
  async (c) => {
    const query = c.req.valid("query");
    const result = await batchInspectorService.getAuditLedger(query);
    return c.json({
      success: true,
      data: result.entries,
      entries: result.entries,
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
    });
  },
);
