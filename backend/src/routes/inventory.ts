/**
 * Inventory administration — mounted at /admin/inventory (see src/index.ts).
 *
 *   POST /admin/inventory/batches        import a batch (THE batch import endpoint)
 *   POST /admin/inventory/adjust         manual stock correction on one batch
 *   GET  /admin/inventory/ledger         stock audit ledger (THE ledger endpoint)
 *   GET  /admin/inventory/low-stock      products at/below their low-stock threshold
 *   GET  /admin/inventory/expiring-soon  sellable batches expiring within N days
 *
 * The batch list lives at GET /admin/batches (admin.batches.ts).
 */
import { Hono } from "hono";
import { created, ok, paginated } from "../lib/http";
import { Permissions } from "../lib/rbac";
import { validate } from "../lib/validation";
import { requireAuth, requirePermission, type AuthContext } from "../middleware/auth";
import { auditService } from "../services/audit.service";
import { batchInspectorService } from "../services/batch-inspector.service";
import { inventoryService } from "../services/inventory.service";
import {
  expiringSoonQuerySchema,
  importBatchSchema,
  lowStockQuerySchema,
  stockAdjustmentSchema,
  stockLedgerQuerySchema,
} from "./inventory.schema";

export const inventoryRoutes = new Hono<AuthContext>();

inventoryRoutes.use("*", requireAuth);

inventoryRoutes.post(
  "/batches",
  requirePermission(Permissions.BATCHES_MANAGE),
  validate("json", importBatchSchema),
  async (c) => {
    const body = c.req.valid("json");
    const result = await inventoryService.importBatch(
      {
        productId: body.productId,
        batchNumber: body.batchNumber,
        manufactureDate: body.manufactureDate ?? null,
        expiryDate: body.expiryDate,
        initialQuantity: body.initialQuantity,
        note: body.note,
      },
      c.get("user").sub,
    );
    return created(c, result);
  },
);

inventoryRoutes.post(
  "/adjust",
  requirePermission(Permissions.STOCK_ADJUST),
  validate("json", stockAdjustmentSchema),
  async (c) => {
    const body = c.req.valid("json");
    const result = await inventoryService.adjustStock(body, c.get("user").sub);
    return ok(c, result);
  },
);

inventoryRoutes.get(
  "/ledger",
  requirePermission(Permissions.STOCK_ADJUST),
  validate("query", stockLedgerQuerySchema),
  async (c) => {
    const query = c.req.valid("query");
    const { items, total } = await auditService.getStockLedger(query);
    return paginated(c, items, { page: query.page, limit: query.limit, total });
  },
);

inventoryRoutes.get(
  "/low-stock",
  requirePermission(Permissions.PRODUCTS_READ),
  validate("query", lowStockQuerySchema),
  async (c) => {
    const query = c.req.valid("query");
    const { items, total } = await inventoryService.listLowStock(query);
    return paginated(c, items, { page: query.page, limit: query.limit, total });
  },
);

inventoryRoutes.get(
  "/expiring-soon",
  requirePermission(Permissions.BATCHES_MANAGE),
  validate("query", expiringSoonQuerySchema),
  async (c) => {
    const query = c.req.valid("query");
    const { items, total } = await batchInspectorService.listBatches({
      page: query.page,
      limit: query.limit,
      expiringWithinDays: query.days,
      inStockOnly: true,
    });
    return paginated(c, items, { page: query.page, limit: query.limit, total });
  },
);
