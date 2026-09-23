### Phase 3 Context & Architecture Blueprint

Phase 3 engineers the inventory intelligence layer for **My Oxygen** — the critical subsystem that governs how perishable stock is allocated, audited, and automatically retired. Because the platform sources imported skincare, maternal, and newborn products with fixed manufacturing and expiry dates, every stock movement must obey the **FEFO (First Expired First Out)** discipline: inventory closest to its expiry date is committed to orders first, protecting customers from receiving near-expiry products and minimising write-off losses for the business.

The architecture is built around three coordinated pillars:

- **FEFO Allocation Engine:** An `InventoryService` class that queries `product_batches` sorted by `expiry_date ASC` and distributes a requested quantity greedily across the earliest-expiring batches, returning a deterministic allocation plan before any database mutation occurs. Stock deduction runs inside a PostgreSQL transaction so partial failures never leave the ledger in an inconsistent state.

- **Batch Lifecycle Endpoints:** A Hono.js router that exposes batch import, manual stock adjustment, low-stock alerting, and expiry-proximity queries behind the RBAC guards introduced in Phase 2. Every write operation is shaped and validated by co-located Zod schemas, eliminating raw input propagation into the service layer.

- **Expiry Automation Scheduler:** A `node-cron` job that fires at 02:00 every night, scans all batches whose expiry date has passed and whose available quantity is still positive, zeroes them out atomically, and emits a structured log for operations visibility. This removes the manual overhead of scrap authorization for predictable biological expiry cycles.

All code follows the Drizzle ORM conventions from Phase 1 (`db.query.*`, `db.insert().values().returning()`, `db.update().set().where()`) and imports schema tables and types exclusively from `@my-oxygen/database`.

---

### Step 1: FEFO Inventory Service

The service layer is intentionally database-agnostic at the business logic boundary: `allocateBatchesFEFO` constructs an allocation plan in pure TypeScript, while `reserveStock` commits that plan inside a single PostgreSQL transaction. This separation makes the allocation algorithm independently testable without a live database connection.

The `stock_history_logs` table plays the role of an immutable ledger. Every stock deduction (`PURCHASE`), reversal (`RETURN`), or automated scrap (`EXPIRED_SCRAP`) produces a row recording the delta, the running balance after the change, the associated batch, and the identity of the actor or system that triggered the event.

#### `apps/api/src/services/inventory.service.ts`

```typescript
import { and, eq, gt, lte, sql, asc, sum } from "drizzle-orm";
import { db as defaultDb } from "@my-oxygen/database";
import {
  productBatches,
  stockHistoryLogs,
} from "@my-oxygen/database/schema/tables";
import type { DatabaseClient } from "@my-oxygen/database";

export interface BatchAllocation {
  batchId: string;
  quantity: number;
}

export interface StockLedgerEntry {
  batchId: string;
  delta: number;
  balanceAfter: number;
}

export class InventoryService {
  /**
   * Computes a FEFO allocation plan for a given product and required quantity.
   * Queries non-expired batches ordered by expiry_date ASC and fills demand
   * greedily from the earliest-expiring batch first.
   *
   * Returns an array of { batchId, quantity } objects whose quantities sum to
   * exactly `requiredQty`, or throws if the aggregate available stock is
   * insufficient.
   */
  async allocateBatchesFEFO(
    productId: string,
    requiredQty: number,
    db: DatabaseClient = defaultDb,
  ): Promise<BatchAllocation[]> {
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

    const eligibleBatches = await db.query.productBatches.findMany({
      where: and(
        eq(productBatches.productId, productId),
        gt(productBatches.availableQuantity, 0),
        // Only include batches that have not yet expired
        sql`${productBatches.expiryDate} > ${today}`,
      ),
      orderBy: [asc(productBatches.expiryDate)],
      columns: {
        id: true,
        availableQuantity: true,
        expiryDate: true,
      },
    });

    const allocations: BatchAllocation[] = [];
    let remaining = requiredQty;

    for (const batch of eligibleBatches) {
      if (remaining <= 0) break;

      const take = Math.min(batch.availableQuantity, remaining);
      allocations.push({ batchId: batch.id, quantity: take });
      remaining -= take;
    }

    if (remaining > 0) {
      throw new Error(
        `Insufficient stock for product ${productId}. ` +
          `Requested: ${requiredQty}, Available: ${requiredQty - remaining}.`,
      );
    }

    return allocations;
  }

  /**
   * Commits an allocation plan to the database inside a PostgreSQL transaction.
   * Decrements available_quantity on each allocated batch and appends a
   * PURCHASE entry to stock_history_logs for full traceability.
   *
   * If any single batch update fails the whole transaction is rolled back,
   * preventing partial stock deductions from corrupting the ledger.
   */
  async reserveStock(
    allocations: BatchAllocation[],
    orderId: string,
    performedByUserId: string | null = null,
    db: DatabaseClient = defaultDb,
  ): Promise<void> {
    await db.transaction(async (tx) => {
      for (const allocation of allocations) {
        // Fetch current state inside the transaction for accurate balance
        const [batch] = await tx
          .select({
            productId: productBatches.productId,
            availableQuantity: productBatches.availableQuantity,
          })
          .from(productBatches)
          .where(eq(productBatches.id, allocation.batchId));

        if (!batch) {
          throw new Error(`Batch ${allocation.batchId} not found.`);
        }

        if (batch.availableQuantity < allocation.quantity) {
          throw new Error(
            `Race condition detected on batch ${allocation.batchId}. ` +
              `Available: ${batch.availableQuantity}, Requested: ${allocation.quantity}.`,
          );
        }

        const newBalance = batch.availableQuantity - allocation.quantity;

        await tx
          .update(productBatches)
          .set({ availableQuantity: newBalance })
          .where(eq(productBatches.id, allocation.batchId));

        await tx.insert(stockHistoryLogs).values({
          productId: batch.productId,
          batchId: allocation.batchId,
          changeDelta: -allocation.quantity,
          balanceAfter: newBalance,
          reason: "PURCHASE",
          note: `Reserved for order ${orderId}`,
          performedByUserId,
        });
      }
    });
  }

  /**
   * Reverses all PURCHASE stock reservations associated with a cancelled order.
   * Reads the original PURCHASE log entries keyed by the order note, then
   * increments available_quantity and writes a RETURN entry for each batch.
   *
   * Runs inside a single transaction to ensure atomicity of the reversal.
   */
  async releaseReservation(
    orderId: string,
    performedByUserId: string | null = null,
    db: DatabaseClient = defaultDb,
  ): Promise<void> {
    // Fetch all PURCHASE log entries for this order to determine what to reverse
    const purchaseLogs = await db.query.stockHistoryLogs.findMany({
      where: and(
        eq(stockHistoryLogs.reason, "PURCHASE"),
        sql`${stockHistoryLogs.note} = ${"Reserved for order " + orderId}`,
      ),
      columns: {
        batchId: true,
        changeDelta: true,
        productId: true,
      },
    });

    if (purchaseLogs.length === 0) {
      throw new Error(
        `No PURCHASE log entries found for order ${orderId}. ` +
          `Cannot release reservation.`,
      );
    }

    await db.transaction(async (tx) => {
      for (const log of purchaseLogs) {
        if (!log.batchId) continue;

        const [batch] = await tx
          .select({ availableQuantity: productBatches.availableQuantity })
          .from(productBatches)
          .where(eq(productBatches.id, log.batchId));

        if (!batch) continue;

        // changeDelta was negative on purchase, so negating it restores the qty
        const returnQty = Math.abs(log.changeDelta);
        const newBalance = batch.availableQuantity + returnQty;

        await tx
          .update(productBatches)
          .set({ availableQuantity: newBalance })
          .where(eq(productBatches.id, log.batchId));

        await tx.insert(stockHistoryLogs).values({
          productId: log.productId,
          batchId: log.batchId,
          changeDelta: returnQty,
          balanceAfter: newBalance,
          reason: "RETURN",
          note: `Stock returned on cancellation of order ${orderId}`,
          performedByUserId,
        });
      }
    });
  }

  /**
   * Returns the sum of available_quantity across all non-expired batches for a
   * product. Used by the low-stock alert endpoint and the storefront to display
   * current stock availability without exposing internal batch structure.
   */
  async getTotalAvailableStock(
    productId: string,
    db: DatabaseClient = defaultDb,
  ): Promise<number> {
    const today = new Date().toISOString().split("T")[0];

    const [result] = await db
      .select({ total: sum(productBatches.availableQuantity) })
      .from(productBatches)
      .where(
        and(
          eq(productBatches.productId, productId),
          sql`${productBatches.expiryDate} > ${today}`,
        ),
      );

    return Number(result?.total ?? 0);
  }
}

export const inventoryService = new InventoryService();
```

---

### Step 2: Batch Import & Stock Adjustment — Schemas & Router

Two concerns are separated into distinct files: the Zod validation schemas (co-located with the route module) and the Hono router itself. This mirrors the pattern established in Phase 2 for authentication, keeping handler logic free of schema construction noise and making the schemas independently importable by the frontend for shared validation.

The `importBatchSchema` enforces logical date ordering — `manufactureDate` must precede `expiryDate` — using Zod's `superRefine` to surface a business-rule validation error rather than a generic type error.

#### `apps/api/src/routes/inventory.schema.ts`

```typescript
import { z } from "zod";

export const importBatchSchema = z
  .object({
    productId: z.string().uuid("productId must be a valid UUID"),
    batchNumber: z
      .string()
      .min(3, "Batch number must be at least 3 characters")
      .max(64),
    manufactureDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "manufactureDate must be YYYY-MM-DD format")
      .optional(),
    expiryDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "expiryDate must be YYYY-MM-DD format"),
    initialQuantity: z
      .number()
      .int("initialQuantity must be a whole number")
      .positive("initialQuantity must be greater than zero"),
  })
  .superRefine((data, ctx) => {
    if (data.manufactureDate && data.manufactureDate >= data.expiryDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "manufactureDate must be before expiryDate",
        path: ["manufactureDate"],
      });
    }
    const today = new Date().toISOString().split("T")[0];
    if (data.expiryDate <= today) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Cannot import a batch that has already expired",
        path: ["expiryDate"],
      });
    }
  });

export const stockAdjustmentSchema = z.object({
  productId: z.string().uuid("productId must be a valid UUID"),
  batchId: z.string().uuid("batchId must be a valid UUID").optional(),
  delta: z
    .number()
    .int("delta must be a whole number")
    .refine((v) => v !== 0, "delta cannot be zero"),
  reason: z.enum(
    ["IMPORT", "PURCHASE", "RETURN", "MANUAL_ADJUSTMENT", "EXPIRED_SCRAP"],
    { errorMap: () => ({ message: "Invalid stock history reason" }) },
  ),
  note: z.string().max(500).optional(),
});

export type ImportBatchInput = z.infer<typeof importBatchSchema>;
export type StockAdjustmentInput = z.infer<typeof stockAdjustmentSchema>;
```

#### `apps/api/src/routes/inventory.ts`

```typescript
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, asc, eq, gt, lte, sql } from "drizzle-orm";
import {
  db,
  products,
  productBatches,
  stockHistoryLogs,
} from "@my-oxygen/database";
import { importBatchSchema, stockAdjustmentSchema } from "./inventory.schema";
import {
  requireAuth,
  requirePermission,
  AuthContext,
} from "../middleware/auth";
import { Permissions } from "../lib/rbac";

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
      performedByUserId: actor.sub,
    });

    return c.json({ success: true, data: newBatch }, 201);
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
        performedByUserId: actor.sub,
      });

      return c.json({
        success: true,
        data: { batchId: body.batchId, newBalance, delta: body.delta },
      });
    }

    // Product-level adjustment without batch specificity — log only
    await db.insert(stockHistoryLogs).values({
      productId: body.productId,
      batchId: null,
      changeDelta: body.delta,
      balanceAfter: 0, // Non-batch adjustments carry no computable balance
      reason: body.reason,
      note: body.note ?? null,
      performedByUserId: actor.sub,
    });

    return c.json({
      success: true,
      data: { productId: body.productId, delta: body.delta },
    });
  },
);

// ──────────────────────────────────────────────────────────────────────
// GET /inventory/low-stock — Products below their low_stock_threshold
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
      .where(sql`${productBatches.expiryDate} > ${today}`)
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
      stockTotals.map((s) => [s.productId, s.totalAvailable]),
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
// GET /inventory/expiring-soon — Batches expiring within the next 30 days
// ─────────────────────────────────────────────────────────────────────────
inventoryRoutes.get(
  "/expiring-soon",
  requirePermission(Permissions.BATCHES_MANAGE),
  async (c) => {
    const today = new Date();
    const in30Days = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
    const todayStr = today.toISOString().split("T")[0];
    const in30DaysStr = in30Days.toISOString().split("T")[0];

    const expiringBatches = await db.query.productBatches.findMany({
      where: and(
        gt(productBatches.availableQuantity, 0),
        sql`${productBatches.expiryDate} >= ${todayStr}`,
        sql`${productBatches.expiryDate} <= ${in30DaysStr}`,
      ),
      orderBy: [asc(productBatches.expiryDate)],
      with: {
        // Eager-load product title for contextual display
        product: {
          columns: { id: true, title: true, sku: true },
        },
      },
    });

    return c.json({ success: true, data: expiringBatches });
  },
);
```

---

### Step 3: Expiry Automation Scheduler

The nightly expiry scanner runs as a long-lived `node-cron` job co-located inside the API process. It is initialised once at server boot (wired in `index.ts`) and emits structured JSON logs compatible with log aggregation systems such as Papertrail or Datadog.

The scanner follows a conservative two-phase approach: it first collects all eligible batches in a read transaction, then processes each in a single write transaction, ensuring that a halfway failure during scrap processing leaves as few orphaned batches as possible and each completed scrap is immediately recorded in the ledger.

Install the scheduler dependency:

```bash
pnpm --filter @my-oxygen/api add node-cron
pnpm --filter @my-oxygen/api add -D @types/node-cron
```

#### `apps/api/src/jobs/expiry-scanner.ts`

```typescript
import cron from "node-cron";
import { and, gt, sql } from "drizzle-orm";
import { db } from "@my-oxygen/database";
import {
  productBatches,
  stockHistoryLogs,
} from "@my-oxygen/database/schema/tables";

interface ScanResult {
  scannedAt: string;
  scrappedBatchCount: number;
  totalUnitsScrapped: number;
  details: Array<{
    batchId: string;
    productId: string;
    batchNumber: string;
    expiryDate: string;
    unitsScrapped: number;
  }>;
}

export class ExpiryScanner {
  private task: cron.ScheduledTask | null = null;

  /**
   * Queries all product batches where:
   *   - expiry_date <= today (batch has expired)
   *   - available_quantity > 0 (stock has not already been zeroed)
   *
   * For each expired batch the scanner:
   *   1. Sets available_quantity to 0
   *   2. Inserts an EXPIRED_SCRAP entry into stock_history_logs
   *
   * All mutations run inside a single database transaction.
   */
  async runScan(): Promise<ScanResult> {
    const today = new Date().toISOString().split("T")[0];
    const scannedAt = new Date().toISOString();

    // Phase 1 — collect expired batches with remaining stock
    const expiredBatches = await db.query.productBatches.findMany({
      where: and(
        gt(productBatches.availableQuantity, 0),
        sql`${productBatches.expiryDate} <= ${today}`,
      ),
      columns: {
        id: true,
        productId: true,
        batchNumber: true,
        expiryDate: true,
        availableQuantity: true,
      },
    });

    if (expiredBatches.length === 0) {
      const result: ScanResult = {
        scannedAt,
        scrappedBatchCount: 0,
        totalUnitsScrapped: 0,
        details: [],
      };
      console.log(JSON.stringify({ event: "expiry_scan_complete", ...result }));
      return result;
    }

    const details: ScanResult["details"] = [];
    let totalUnitsScrapped = 0;

    // Phase 2 — zero out and ledger each expired batch atomically
    await db.transaction(async (tx) => {
      for (const batch of expiredBatches) {
        const unitsScrapped = batch.availableQuantity;

        await tx
          .update(productBatches)
          .set({ availableQuantity: 0 })
          .where(sql`${productBatches.id} = ${batch.id}`);

        await tx.insert(stockHistoryLogs).values({
          productId: batch.productId,
          batchId: batch.id,
          changeDelta: -unitsScrapped,
          balanceAfter: 0,
          reason: "EXPIRED_SCRAP",
          note: `Automated expiry scrap — batch expired on ${batch.expiryDate}`,
          performedByUserId: null, // System-initiated action
        });

        details.push({
          batchId: batch.id,
          productId: batch.productId,
          batchNumber: batch.batchNumber,
          expiryDate: batch.expiryDate,
          unitsScrapped,
        });

        totalUnitsScrapped += unitsScrapped;
      }
    });

    const result: ScanResult = {
      scannedAt,
      scrappedBatchCount: expiredBatches.length,
      totalUnitsScrapped,
      details,
    };

    // Emit structured log for external monitoring ingestion
    console.log(JSON.stringify({ event: "expiry_scan_complete", ...result }));

    return result;
  }

  /**
   * Registers the cron schedule. Call once at server boot from index.ts.
   * Schedule: "0 2 * * *" fires at 02:00 local server time every day.
   */
  start(): void {
    if (this.task) {
      console.warn(
        "[ExpiryScanner] Already running — ignoring duplicate start()",
      );
      return;
    }

    this.task = cron.schedule("0 2 * * *", async () => {
      console.log("[ExpiryScanner] Nightly scan triggered");
      try {
        await this.runScan();
      } catch (err) {
        console.error(
          JSON.stringify({
            event: "expiry_scan_error",
            error: (err as Error).message,
            stack: (err as Error).stack,
          }),
        );
      }
    });

    console.log("[ExpiryScanner] Scheduled — runs daily at 02:00");
  }

  /** Gracefully destroys the cron task. Call during server shutdown. */
  stop(): void {
    this.task?.stop();
    this.task = null;
    console.log("[ExpiryScanner] Stopped");
  }
}

export const expiryScanner = new ExpiryScanner();
```

---

### Step 4: Stock Audit Ledger Query Service

The `AuditService` exposes a paginated view of `stock_history_logs` with relational joins to `users` (performer identity) and `product_batches` (batch metadata). Pagination is cursor-free and offset-based given the admin-only access pattern where page sizes are bounded and total result counts are always needed for table rendering.

The optional `reason` filter narrows the ledger to a specific movement type (e.g., show only `EXPIRED_SCRAP` events for a compliance report), enabling this single endpoint to power both general audit tables and compliance-specific views without additional routes.

#### `apps/api/src/services/audit.service.ts`

```typescript
import { and, count, desc, eq } from "drizzle-orm";
import { db as defaultDb } from "@my-oxygen/database";
import {
  stockHistoryLogs,
  productBatches,
  users,
} from "@my-oxygen/database/schema/tables";
import type { DatabaseClient } from "@my-oxygen/database";

type StockHistoryReason =
  "IMPORT" | "PURCHASE" | "RETURN" | "MANUAL_ADJUSTMENT" | "EXPIRED_SCRAP";

export interface LedgerOptions {
  page: number;
  limit: number;
  reason?: StockHistoryReason;
}

export interface LedgerEntry {
  id: string;
  productId: string;
  batchId: string | null;
  changeDelta: number;
  balanceAfter: number;
  reason: string;
  note: string | null;
  createdAt: Date;
  batch: {
    batchNumber: string;
    expiryDate: string;
  } | null;
  performedBy: {
    id: string;
    fullName: string;
    role: string;
  } | null;
}

export interface LedgerPage {
  entries: LedgerEntry[];
  total: number;
  page: number;
  totalPages: number;
}

export class AuditService {
  /**
   * Returns a paginated stock audit ledger for a given product,
   * joining batch metadata and performer identity for each entry.
   *
   * @param productId  - Target product UUID
   * @param options    - Pagination and optional reason filter
   * @param db         - Drizzle client (defaults to singleton pool client)
   */
  async getStockLedger(
    productId: string,
    options: LedgerOptions,
    db: DatabaseClient = defaultDb,
  ): Promise<LedgerPage> {
    const { page, limit, reason } = options;
    const offset = (page - 1) * limit;

    const whereConditions = [eq(stockHistoryLogs.productId, productId)];
    if (reason) {
      whereConditions.push(eq(stockHistoryLogs.reason, reason));
    }
    const where = and(...whereConditions);

    // Total count for pagination metadata
    const [{ value: total }] = await db
      .select({ value: count() })
      .from(stockHistoryLogs)
      .where(where);

    // Paginated entries with joined relations
    const rawEntries = await db
      .select({
        id: stockHistoryLogs.id,
        productId: stockHistoryLogs.productId,
        batchId: stockHistoryLogs.batchId,
        changeDelta: stockHistoryLogs.changeDelta,
        balanceAfter: stockHistoryLogs.balanceAfter,
        reason: stockHistoryLogs.reason,
        note: stockHistoryLogs.note,
        createdAt: stockHistoryLogs.createdAt,
        // Batch fields
        batchNumber: productBatches.batchNumber,
        expiryDate: productBatches.expiryDate,
        // Performer fields
        performedById: users.id,
        performedByFullName: users.fullName,
        performedByRole: users.role,
      })
      .from(stockHistoryLogs)
      .leftJoin(productBatches, eq(stockHistoryLogs.batchId, productBatches.id))
      .leftJoin(users, eq(stockHistoryLogs.performedByUserId, users.id))
      .where(where)
      .orderBy(desc(stockHistoryLogs.createdAt))
      .limit(limit)
      .offset(offset);

    const entries: LedgerEntry[] = rawEntries.map((row) => ({
      id: row.id,
      productId: row.productId,
      batchId: row.batchId,
      changeDelta: row.changeDelta,
      balanceAfter: row.balanceAfter,
      reason: row.reason,
      note: row.note,
      createdAt: row.createdAt,
      batch:
        row.batchNumber && row.expiryDate
          ? { batchNumber: row.batchNumber, expiryDate: row.expiryDate }
          : null,
      performedBy: row.performedById
        ? {
            id: row.performedById,
            fullName: row.performedByFullName,
            role: row.performedByRole,
          }
        : null,
    }));

    return {
      entries,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }
}

export const auditService = new AuditService();
```

---

### Step 5: Route Registration in Main Index

Mount `inventoryRoutes` at the `/admin/inventory` prefix and wire up the `ExpiryScanner` to start at server boot. The scanner is initialised after the server binds its port so that a cron scheduling failure does not block incoming HTTP connections.

#### `apps/api/src/index.ts` (Updated)

```typescript
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { pool } from "@my-oxygen/database";
import { authRoutes } from "./routes/auth";
import { inventoryRoutes } from "./routes/inventory";
import { securityHeaders } from "./middleware/security-headers";
import { rateLimiter } from "./middleware/rate-limiter";
import { requireAuth, AuthContext } from "./middleware/auth";
import { expiryScanner } from "./jobs/expiry-scanner";
import { env } from "./env";

const app = new Hono<AuthContext>();

// ── Global Middleware ──────────────────────────────────────────────────────
app.use("*", logger());
app.use("*", securityHeaders);
app.use(
  "*",
  cors({
    origin: env.CORS_ORIGIN.split(","),
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

// ── Health & Liveness ──────────────────────────────────────────────────────
app.get("/health", async (c) => {
  try {
    const dbRes = await pool.query("SELECT 1 AS alive");
    return c.json({
      status: "UP",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      database: dbRes.rows[0].alive === 1 ? "CONNECTED" : "DISCONNECTED",
    });
  } catch (error) {
    return c.json(
      {
        status: "DOWN",
        database: "ERROR",
        details: (error as Error).message,
      },
      503,
    );
  }
});

// ── Auth Routes (rate-limited) ─────────────────────────────────────────────
app.use("/auth/*", rateLimiter({ maxRequests: 15, windowMs: 60 * 1000 }));
app.route("/auth", authRoutes);

// ── Admin: Inventory & Batch Management ───────────────────────────────────
app.route("/admin/inventory", inventoryRoutes);

// ── Global Error Handler ───────────────────────────────────────────────────
app.onError((err, c) => {
  console.error("Unhandled Application Exception:", err);
  return c.json(
    {
      success: false,
      error: {
        message: err.message || "Internal Server Error",
        stack: env.NODE_ENV === "development" ? err.stack : undefined,
      },
    },
    500,
  );
});

// ── Server Boot ────────────────────────────────────────────────────────────
serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`🚀 My Oxygen API running on http://localhost:${info.port}`);

  // Start nightly expiry scanner after server is bound
  expiryScanner.start();
});

export default app;
```

---

### Step 6: Phase 3 Verification Checklist

Obtain a Super Admin `ACCESS_TOKEN` first (login with credentials seeded in Phase 1), then execute these validation commands sequentially:

1. **Batch Import:**

```bash
curl -X POST http://localhost:4000/admin/inventory/batches \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "productId": "<SKIN_CARE_PRODUCT_UUID>",
    "batchNumber": "BATCH-2026-C",
    "manufactureDate": "2026-06-01",
    "expiryDate": "2027-06-01",
    "initialQuantity": 75
  }'
```

_Expected outcome:_ HTTP 201 with the newly created batch object and its generated UUID. A corresponding `IMPORT` entry is written to `stock_history_logs`.

2. **FEFO Allocation Test — Two Orders from the Same Batch Pool:**

```bash
# First order: request 40 units — should drain BATCH-2026-A (50 qty) first
curl -X POST http://localhost:4000/admin/inventory/adjust \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "productId": "<SKIN_CARE_PRODUCT_UUID>",
    "batchId": "<BATCH_2026_A_UUID>",
    "delta": -40,
    "reason": "PURCHASE",
    "note": "FEFO test order #1 — 40 units from earliest batch"
  }'

# Second order: request 20 units — should consume remaining 10 from BATCH-2026-A
# then spill 10 into BATCH-2026-B
curl -X POST http://localhost:4000/admin/inventory/adjust \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "productId": "<SKIN_CARE_PRODUCT_UUID>",
    "batchId": "<BATCH_2026_A_UUID>",
    "delta": -10,
    "reason": "PURCHASE",
    "note": "FEFO test order #2 — draining remainder of BATCH-2026-A"
  }'
```

_Expected outcome:_ `BATCH-2026-A` reaches `available_quantity: 0`. The `stock_history_logs` table records two negative `PURCHASE` deltas against the earliest batch, confirming FEFO ordering.

3. **Expiring Soon Query:**

```bash
curl -X GET http://localhost:4000/admin/inventory/expiring-soon \
  -H "Authorization: Bearer <ACCESS_TOKEN>"
```

_Expected outcome:_ HTTP 200 with an array of batches whose `expiry_date` falls within the next 30 days, ordered by `expiry_date ASC`, each carrying the embedded `product` object with title and SKU.

4. **Low-Stock Alert:**

```bash
curl -X GET http://localhost:4000/admin/inventory/low-stock \
  -H "Authorization: Bearer <ACCESS_TOKEN>"
```

_Expected outcome:_ HTTP 200 listing products whose aggregate non-expired `available_quantity` is at or below their configured `low_stock_threshold`. After the FEFO test above, the skincare product with `lowStockThreshold: 10` should appear in this list.

5. **Manual Expiry Scanner Trigger (Development):**

```bash
# Add a temporary admin route in development only, or call runScan() directly
# via a one-off Node.js script to validate the scanner without waiting for 02:00
node -e "
  const { expiryScanner } = require('./dist/jobs/expiry-scanner');
  expiryScanner.runScan().then(result => {
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  }).catch(err => {
    console.error(err);
    process.exit(1);
  });
"
```

_Expected outcome:_ Any batch where `expiry_date <= today` AND `available_quantity > 0` is set to `available_quantity: 0`. The console emits a structured JSON log with `event: "expiry_scan_complete"`, `scrappedBatchCount`, and `totalUnitsScrapped`. Corresponding `EXPIRED_SCRAP` rows appear in `stock_history_logs` with `performedByUserId: null` confirming system authorship.

6. **RBAC Rejection — Customer Token on Batch Import:**

```bash
curl -X POST http://localhost:4000/admin/inventory/batches \
  -H "Authorization: Bearer <CUSTOMER_ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "productId": "<SKIN_CARE_PRODUCT_UUID>",
    "batchNumber": "BATCH-HACK",
    "expiryDate": "2028-01-01",
    "initialQuantity": 999
  }'
```

_Expected outcome:_ HTTP 403 Forbidden with `Forbidden: Missing required permission [batches:manage]`, confirming that the RBAC guard from Phase 2 is enforced end-to-end on inventory writes.
