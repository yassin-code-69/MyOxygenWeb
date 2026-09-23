import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, asc, eq, gt, sql } from "drizzle-orm";
import {
  db,
  products,
  productBatches,
  stockHistoryLogs,
} from "../db";
import {
  importBatchSchema,
  stockAdjustmentSchema,
  stockLedgerQuerySchema,
  expiringSoonQuerySchema,
} from "./inventory.schema";
import {
  requireAuth,
  requirePermission,
  type AuthContext,
} from "../middleware/auth";
import { Permissions } from "../lib/rbac";
import { auditService, type StockHistoryReason } from "../services/audit.service";

export const inventoryRoutes = new Hono<AuthContext>();

// Apply auth guard to the entire inventory router
inventoryRoutes.use("*", requireAuth);

// ──────────────────────────────────────────────
// POST /inventory/batches — Import a new batch
// ──────────────────────────────────────────────
inventoryRoutes.post(
  "/batches",
  requirePermission(Permissions.BATCHES_MANAGE),
  zValidator("json", importBatchSchema),
  async (c) => {
    const body = c.req.valid("json");

    // Verify product exists
    const product = await db.query.products.findFirst({
      where: eq(products.id, body.productId),
      columns: { id: true, title: true, requiresBatchTracking: true },
    });

    if (!product) {
      return c.json(
        { success: false, error: `Product ${body.productId} not found` },
        404,
      );
    }

    // Prevent duplicate batch numbers for the same product
    const existingBatch = await db.query.productBatches.findFirst({
      where: and(
        eq(productBatches.productId, body.productId),
        eq(productBatches.batchNumber, body.batchNumber),
      ),
    });

    if (existingBatch) {
      return c.json(
        {
          success: false,
          error: `Batch number "${body.batchNumber}" already exists for this product`,
        },
        409,
      );
    }

    const [newBatch] = await db
      .insert(productBatches)
      .values({
        productId: body.productId,
        batchNumber: body.batchNumber,
        manufactureDate: body.manufactureDate ?? null,
        expiryDate: body.expiryDate,
        initialQuantity: body.initialQuantity,
        availableQuantity: body.initialQuantity,
      })
      .returning();

    // Write IMPORT entry to the stock ledger
    const actor = c.get("user");
    await db.insert(stockHistoryLogs).values({
      productId: body.productId,
      batchId: newBatch.id,
      changeDelta: body.initialQuantity,
      balanceAfter: body.initialQuantity,
      reason: "IMPORT",
      note: `Batch ${body.batchNumber} imported`,
      performedByUserId: actor?.sub ?? null,
    });

    return c.json({ success: true, data: newBatch }, 201);
  },
);

// ──────────────────────────────────────────────────────────
// GET /inventory/batches — List all batches across products
// ──────────────────────────────────────────────────────────
inventoryRoutes.get(
  "/batches",
  requirePermission(Permissions.BATCHES_MANAGE),
  async (c) => {
    const batches = await db.query.productBatches.findMany({
      orderBy: [asc(productBatches.expiryDate)],
      with: {
        product: {
          columns: { id: true, title: true, sku: true },
        },
      },
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const enriched = batches.map((b) => {
      const expiry = new Date(b.expiryDate);
      expiry.setHours(0, 0, 0, 0);
      const diffTime = expiry.getTime() - today.getTime();
      const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      let healthStatus: "EXPIRED" | "EXPIRING_SOON" | "HEALTHY" = "HEALTHY";
      if (daysRemaining <= 0) {
        healthStatus = "EXPIRED";
      } else if (daysRemaining <= 30) {
        healthStatus = "EXPIRING_SOON";
      }

      return {
        ...b,
        shelfLifeDays: daysRemaining,
        healthStatus,
      };
    });

    return c.json({ success: true, data: enriched });
  },
);

// ──────────────────────────────────────────────────────────
// GET /inventory/batches/:productId — List batches by expiry
// ──────────────────────────────────────────────────────────
inventoryRoutes.get(
  "/batches/:productId",
  requirePermission(Permissions.BATCHES_MANAGE),
  async (c) => {
    const { productId } = c.req.param();

    const product = await db.query.products.findFirst({
      where: eq(products.id, productId),
      columns: { id: true, title: true },
    });

    if (!product) {
      return c.json({ success: false, error: "Product not found" }, 404);
    }

    const batches = await db.query.productBatches.findMany({
      where: eq(productBatches.productId, productId),
      orderBy: [asc(productBatches.expiryDate)],
    });

    return c.json({ success: true, data: batches });
  },
);

// ─────────────────────────────────────────────────────────
// POST /inventory/adjust — Manual stock adjustment
// ─────────────────────────────────────────────────────────
inventoryRoutes.post(
  "/adjust",
  requirePermission(Permissions.STOCK_ADJUST),
  zValidator("json", stockAdjustmentSchema),
  async (c) => {
    const body = c.req.valid("json");
    const actor = c.get("user");

    // If a specific batch is targeted, verify it belongs to the product
    if (body.batchId) {
      const batch = await db.query.productBatches.findFirst({
        where: and(
          eq(productBatches.id, body.batchId),
          eq(productBatches.productId, body.productId),
        ),
        columns: { id: true, availableQuantity: true },
      });

      if (!batch) {
        return c.json(
          {
            success: false,
            error: "Batch not found or does not belong to this product",
          },
          404,
        );
      }

      const newBalance = batch.availableQuantity + body.delta;
      if (newBalance < 0) {
        return c.json(
          {
            success: false,
            error: `Adjustment would result in negative stock. Current: ${batch.availableQuantity}, Delta: ${body.delta}`,
          },
          422,
        );
      }

      await db
        .update(productBatches)
        .set({ availableQuantity: newBalance })
        .where(eq(productBatches.id, body.batchId));

      await db.insert(stockHistoryLogs).values({
        productId: body.productId,
        batchId: body.batchId,
        changeDelta: body.delta,
        balanceAfter: newBalance,
        reason: body.reason,
        note: body.note ?? null,
        performedByUserId: actor?.sub ?? null,
      });

      return c.json({
        success: true,
        data: { batchId: body.batchId, newBalance, delta: body.delta },
      });
    }

    // Verify product exists for non-batch adjustment
    const product = await db.query.products.findFirst({
      where: eq(products.id, body.productId),
      columns: { id: true },
    });

    if (!product) {
      return c.json(
        { success: false, error: `Product ${body.productId} not found` },
        404,
      );
    }

    // Product-level adjustment without batch specificity — log only
    await db.insert(stockHistoryLogs).values({
      productId: body.productId,
      batchId: null,
      changeDelta: body.delta,
      balanceAfter: 0,
      reason: body.reason,
      note: body.note ?? null,
      performedByUserId: actor?.sub ?? null,
    });

    return c.json({
      success: true,
      data: { productId: body.productId, delta: body.delta },
    });
  },
);

// ──────────────────────────────────────────────────────────────────────
// GET /inventory/low-stock — Products below their lowStockThreshold
// ──────────────────────────────────────────────────────────────────────
inventoryRoutes.get(
  "/low-stock",
  requirePermission(Permissions.PRODUCTS_READ),
  async (c) => {
    const today = new Date().toISOString().split("T")[0];

    // Aggregate available stock per product across non-expired batches
    const stockTotals = await db
      .select({
        productId: productBatches.productId,
        totalAvailable: sql<number>`COALESCE(SUM(${productBatches.availableQuantity}), 0)`,
      })
      .from(productBatches)
      .where(
        and(
          gt(productBatches.availableQuantity, 0),
          sql`${productBatches.expiryDate} > ${today}`,
        ),
      )
      .groupBy(productBatches.productId);

    // Fetch products and cross-reference against their thresholds
    const allProducts = await db.query.products.findMany({
      where: eq(products.isActive, true),
      columns: {
        id: true,
        title: true,
        sku: true,
        lowStockThreshold: true,
      },
    });

    const stockMap = new Map(
      stockTotals.map((s) => [s.productId, Number(s.totalAvailable)]),
    );

    const lowStockProducts = allProducts
      .map((p) => ({
        ...p,
        totalAvailable: stockMap.get(p.id) ?? 0,
      }))
      .filter((p) => p.totalAvailable <= p.lowStockThreshold);

    return c.json({ success: true, data: lowStockProducts });
  },
);

// ─────────────────────────────────────────────────────────────────────────
// GET /inventory/expiring-soon — Batches expiring within the next N days
// ─────────────────────────────────────────────────────────────────────────
inventoryRoutes.get(
  "/expiring-soon",
  requirePermission(Permissions.BATCHES_MANAGE),
  zValidator("query", expiringSoonQuerySchema),
  async (c) => {
    const query = c.req.valid("query");
    const days = query.days ?? 30;

    const today = new Date();
    const futureDate = new Date(today.getTime() + days * 24 * 60 * 60 * 1000);
    const todayStr = today.toISOString().split("T")[0];
    const futureDateStr = futureDate.toISOString().split("T")[0];

    const expiringBatches = await db.query.productBatches.findMany({
      where: and(
        gt(productBatches.availableQuantity, 0),
        sql`${productBatches.expiryDate} >= ${todayStr}`,
        sql`${productBatches.expiryDate} <= ${futureDateStr}`,
      ),
      orderBy: [asc(productBatches.expiryDate)],
      with: {
        product: {
          columns: { id: true, title: true, sku: true },
        },
      },
    });

    return c.json({ success: true, data: expiringBatches });
  },
);

// ─────────────────────────────────────────────────────────────────────────
// GET /inventory/logs — Paginated stock history ledger
// ─────────────────────────────────────────────────────────────────────────
inventoryRoutes.get(
  "/logs",
  requirePermission(Permissions.BATCHES_MANAGE),
  zValidator("query", stockLedgerQuerySchema),
  async (c) => {
    const query = c.req.valid("query");

    const result = await auditService.getStockLedger({
      page: query.page,
      limit: query.limit,
      productId: query.productId,
      batchId: query.batchId,
      reason: query.reason as StockHistoryReason | undefined,
    });

    return c.json({ success: true, data: result });
  },
);

// ─────────────────────────────────────────────────────────────────────────
// GET /inventory/ledger — Paginated stock history ledger (alias for /logs)
// ─────────────────────────────────────────────────────────────────────────
inventoryRoutes.get(
  "/ledger",
  requirePermission(Permissions.BATCHES_MANAGE),
  zValidator("query", stockLedgerQuerySchema),
  async (c) => {
    const query = c.req.valid("query");

    const result = await auditService.getStockLedger({
      page: query.page,
      limit: query.limit,
      productId: query.productId,
      batchId: query.batchId,
      reason: query.reason as StockHistoryReason | undefined,
    });

    return c.json({ success: true, data: result });
  },
);
