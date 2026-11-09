/**
 * Batch inspector — mounted at /admin (see src/index.ts).
 *
 *   GET /admin/batches   every batch with shelf-life health (business time zone)
 *
 * Batch import is POST /admin/inventory/batches and the stock ledger is
 * GET /admin/inventory/ledger (routes/inventory.ts). Auth is applied per route
 * so this router does not leak middleware onto other /admin/* paths.
 */
import { Hono } from "hono";
import { buildPaginationMeta } from "../lib/http";
import { Permissions } from "../lib/rbac";
import { validate } from "../lib/validation";
import { requireAuth, requirePermission, type AuthContext } from "../middleware/auth";
import { batchInspectorService, type BatchDTO, type BatchHealthSummary } from "../services/batch-inspector.service";
import type { ApiSuccess, PaginationMeta } from "../types";
import { batchInspectorQuerySchema } from "./inventory.schema";

export const adminBatchesRoute = new Hono<AuthContext>();

/** Pagination meta plus per-status counts (for the inspector's summary tiles). */
export type BatchInspectorMeta = PaginationMeta & { summary: BatchHealthSummary };

adminBatchesRoute.get(
  "/batches",
  requireAuth,
  requirePermission(Permissions.BATCHES_MANAGE),
  validate("query", batchInspectorQuerySchema),
  async (c) => {
    const query = c.req.valid("query");
    const { items, total, summary } = await batchInspectorService.listBatches(query);
    const body: ApiSuccess<BatchDTO[], BatchInspectorMeta> = {
      success: true,
      data: items,
      meta: { ...buildPaginationMeta(query.page, query.limit, total), summary },
    };
    return c.json(body, 200);
  },
);
