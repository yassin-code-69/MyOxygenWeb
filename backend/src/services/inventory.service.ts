/**
 * Inventory engine: FEFO allocation, reservations, releases, batch imports,
 * manual adjustments and zero-stock auto-(de)activation.
 *
 * Invariants (RULES §5.1):
 * - Sellable stock of a product = SUM(available_quantity) of its batches with
 *   expiry_date > today in the business time zone (env.APP_TIMEZONE).
 * - Allocation is FEFO: expiry_date ASC, then id, inside row locks.
 * - Quantities change only through relative, guarded updates
 *   (`available_quantity = available_quantity - n WHERE available_quantity >= n`)
 *   and every change appends a `stock_history_logs` row in the same transaction.
 * - When sellable stock reaches 0 the product is hidden (`is_active = false`,
 *   `auto_deactivated_at = now()`); when stock returns, ONLY auto-hidden
 *   products are re-activated. Manual deactivation clears the marker.
 *
 * Lock order (deadlock avoidance) used by every mutation in this codebase:
 *   1. products rows, ascending id, FOR NO KEY UPDATE
 *   2. product_batches rows, ordered by (product_id, expiry_date, id), FOR UPDATE
 * Callers touching several products (checkout) must process them in ascending
 * productId order, or use `allocateAndReserve`, which does.
 *
 * Every method accepting `db` runs inside the caller's transaction when given
 * one (as a SAVEPOINT, see db-executor.ts). Methods that open their own
 * transaction also invalidate the public catalog cache after COMMIT; when the
 * caller owns the transaction it must call `invalidateCatalogCache()` itself
 * after committing.
 */
import { and, asc, count, eq, gt, gte, inArray, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db as defaultDb, type DatabaseTransaction } from "../db/client";
import { productBatches, products, stockHistoryLogs } from "../db/schema/tables";
import { isIsoCalendarDate, todayInBusinessTz } from "../lib/dates";
import { isUniqueViolation } from "../lib/db-errors";
import { AppError } from "../lib/errors";
import { pageOffset } from "../lib/http";
import { invalidateCatalogCache } from "../middleware/cache";
import { batchRowSelection, toBatchDto, type BatchDTO } from "./batch-inspector.service";
import { type DbExecutor, isTransaction, queryAll, runInTransaction } from "./db-executor";
import { fieldValidationError, toNullableIso } from "./service-utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Storefront visibility of a product:
 * - ACTIVE          is_active = true
 * - AWAITING_STOCK  hidden automatically because sellable stock is 0; goes live on restock
 * - INACTIVE        deactivated by an admin; never re-activated automatically
 */
export type ListingStatus = "ACTIVE" | "AWAITING_STOCK" | "INACTIVE";

export function listingStatusOf(product: {
  isActive: boolean;
  autoDeactivatedAt: Date | string | null;
}): ListingStatus {
  if (product.isActive) return "ACTIVE";
  return product.autoDeactivatedAt === null ? "INACTIVE" : "AWAITING_STOCK";
}

export interface BatchAllocation {
  batchId: string;
  productId: string;
  batchNumber: string;
  expiryDate: string;
  quantity: number;
}

/** What `reserveStock` needs from an allocation (older callers pass only these). */
export type AllocationInput = Pick<BatchAllocation, "batchId" | "quantity">;

export interface StockMovement {
  ledgerEntryId: string;
  productId: string;
  batchId: string;
  quantity: number;
  /** Batch balance after the movement. */
  balanceAfter: number;
}

export interface AvailabilityChange {
  productId: string;
  isActive: boolean;
  change: "AUTO_DEACTIVATED" | "AUTO_REACTIVATED";
}

export interface ReservationResult {
  orderId: string;
  reservedUnits: number;
  movements: StockMovement[];
  availabilityChanges: AvailabilityChange[];
}

export interface ReleaseResult {
  orderId: string;
  restoredUnits: number;
  /** true when RETURN rows already existed for the order (nothing was restocked again). */
  alreadyReleased: boolean;
  /** Units whose batch no longer exists (cannot be restocked). */
  skippedUnits: number;
  movements: StockMovement[];
  availabilityChanges: AvailabilityChange[];
}

export interface CheckoutLine {
  productId: string;
  quantity: number;
}

export interface AllocatedLine {
  productId: string;
  quantity: number;
  allocations: BatchAllocation[];
}

export interface AllocateAndReserveResult {
  lines: AllocatedLine[];
  reservation: ReservationResult;
}

export interface ProductStockStatus {
  id: string;
  title: string;
  sku: string;
  isActive: boolean;
  autoDeactivatedAt: string | null;
  listingStatus: ListingStatus;
  totalStock: number;
}

export interface ImportBatchInput {
  productId: string;
  batchNumber: string;
  manufactureDate?: string | null;
  expiryDate: string;
  initialQuantity: number;
  note?: string | null;
}

export interface ImportBatchResult {
  batch: BatchDTO;
  product: ProductStockStatus;
  ledgerEntryId: string;
  availabilityChanges: AvailabilityChange[];
}

export const ADJUSTMENT_REASONS = ["MANUAL_ADJUSTMENT", "EXPIRED_SCRAP"] as const;
export type AdjustmentReason = (typeof ADJUSTMENT_REASONS)[number];

export interface StockAdjustmentInput {
  productId: string;
  batchId: string;
  delta: number;
  reason: AdjustmentReason;
  note?: string | null;
}

export interface StockAdjustmentResult {
  batch: BatchDTO;
  product: ProductStockStatus;
  ledgerEntryId: string;
  reason: AdjustmentReason;
  delta: number;
  previousQuantity: number;
  newQuantity: number;
  availabilityChanges: AvailabilityChange[];
}

export interface LowStockItem {
  productId: string;
  title: string;
  slug: string;
  sku: string;
  totalStock: number;
  lowStockThreshold: number;
  isOutOfStock: boolean;
  isActive: boolean;
  autoDeactivatedAt: string | null;
  listingStatus: ListingStatus;
  earliestExpiry: string | null;
}

// ---------------------------------------------------------------------------
// Shared SQL fragments
// ---------------------------------------------------------------------------

/**
 * Table-qualified column reference for correlated subqueries. Drizzle drops
 * table qualifiers from column objects inside `sql` fragments of single-table
 * selections, which would silently bind them to the subquery's own table.
 */
export function outerProductColumn(column: "id" | "category_id" | "base_price"): SQL {
  return sql.raw(`"products"."${column}"`);
}

/** Sellable stock of the `products` row in scope (correlated subquery). */
export function sellableStockSql(today: string): SQL<number> {
  return sql<number>`coalesce((
    SELECT sum(b.available_quantity) FROM product_batches b
    WHERE b.product_id = ${outerProductColumn("id")} AND b.available_quantity > 0 AND b.expiry_date > ${today}::date
  ), 0)::int`;
}

/** Earliest expiry (YYYY-MM-DD) among the sellable batches of the `products` row in scope. */
export function earliestExpirySql(today: string): SQL<string | null> {
  return sql<string | null>`(
    SELECT min(b.expiry_date)::text FROM product_batches b
    WHERE b.product_id = ${outerProductColumn("id")} AND b.available_quantity > 0 AND b.expiry_date > ${today}::date
  )`;
}

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

const uuidSchema = z.string().uuid();

function assertUuid(value: string, field: string): void {
  if (!uuidSchema.safeParse(value).success) {
    throw fieldValidationError({ [field]: [`${field} must be a valid UUID`] });
  }
}

function assertPositiveInteger(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw fieldValidationError({ [field]: [`${field} must be a positive integer`] });
  }
}

interface LockedProduct {
  id: string;
  title: string;
  sku: string;
  isActive: boolean;
  autoDeactivatedAt: Date | null;
}

/** Locks product rows in ascending id order (step 1 of the global lock order). */
async function lockProducts(tx: DatabaseTransaction, productIds: readonly string[]): Promise<LockedProduct[]> {
  const ids = [...new Set(productIds)];
  if (ids.length === 0) return [];
  return tx
    .select({
      id: products.id,
      title: products.title,
      sku: products.sku,
      isActive: products.isActive,
      autoDeactivatedAt: products.autoDeactivatedAt,
    })
    .from(products)
    .where(inArray(products.id, ids))
    .orderBy(asc(products.id))
    .for("no key update");
}

function outOfStockError(product: { id: string; title: string }, requested: number, available: number): AppError {
  const message =
    available === 0
      ? `"${product.title}" is out of stock`
      : `Only ${available} unit(s) of "${product.title}" are in stock`;
  return AppError.insufficientStock(message, { productId: product.id, requested, available });
}

// ---------------------------------------------------------------------------
// Availability (zero-stock auto-deactivation / re-activation)
// ---------------------------------------------------------------------------

/**
 * Re-evaluates `is_active` for the given products from their sellable stock:
 * - stock = 0 and active                       → is_active=false, auto_deactivated_at=now()
 * - stock > 0, inactive and auto-deactivated   → is_active=true,  auto_deactivated_at=NULL
 * Manually deactivated products (auto_deactivated_at IS NULL) are never touched.
 * Must run inside the transaction that changed the stock (after the product
 * rows were locked).
 */
export async function syncProductAvailability(
  tx: DatabaseTransaction,
  productIds: readonly string[],
  today: string = todayInBusinessTz(),
): Promise<AvailabilityChange[]> {
  const ids = [...new Set(productIds)];
  if (ids.length === 0) return [];
  const idList = sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `,
  );
  const result = await tx.execute<{ id: string; is_active: boolean }>(sql`
    UPDATE products AS p SET
      is_active = s.stock > 0,
      auto_deactivated_at = CASE WHEN s.stock > 0 THEN NULL ELSE now() END,
      updated_at = now()
    FROM (
      SELECT p2.id, coalesce(sum(b.available_quantity) FILTER (
        WHERE b.available_quantity > 0 AND b.expiry_date > ${today}::date
      ), 0) AS stock
      FROM products p2
      LEFT JOIN product_batches b ON b.product_id = p2.id
      WHERE p2.id IN (${idList})
      GROUP BY p2.id
    ) AS s
    WHERE p.id = s.id
      AND (
        (s.stock = 0 AND p.is_active)
        OR (s.stock > 0 AND NOT p.is_active AND p.auto_deactivated_at IS NOT NULL)
      )
    RETURNING p.id, p.is_active
  `);
  return result.rows.map((row) => ({
    productId: row.id,
    isActive: row.is_active,
    change: row.is_active ? "AUTO_REACTIVATED" : "AUTO_DEACTIVATED",
  }));
}

function logAvailabilityChanges(source: string, changes: readonly AvailabilityChange[]): void {
  for (const change of changes) {
    console.log(
      JSON.stringify({
        level: "info",
        event: change.isActive ? "product_auto_reactivated" : "product_auto_deactivated",
        source,
        productId: change.productId,
      }),
    );
  }
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class InventoryService {
  /**
   * FEFO allocation plan for `requiredQty` units of a product.
   *
   * Locks the product row and every eligible batch (unexpired in the business
   * time zone, available > 0) FOR UPDATE, so concurrent checkouts inside
   * transactions serialize and each sees the stock left by the previous one
   * (spilling into the next batch instead of failing). Call it with the
   * checkout transaction and pass the plan to `reserveStock` with the same
   * transaction. Called with the root client the locks end when it returns
   * and `reserveStock` re-validates.
   *
   * @throws AppError NOT_FOUND (product), INSUFFICIENT_STOCK
   *         `details: { productId, requested, available }`.
   */
  async allocateBatchesFEFO(
    productId: string,
    requiredQty: number,
    db: DbExecutor = defaultDb,
  ): Promise<BatchAllocation[]> {
    assertUuid(productId, "productId");
    assertPositiveInteger(requiredQty, "quantity");
    const today = todayInBusinessTz();

    return runInTransaction(db, async (tx) => {
      const [product] = await lockProducts(tx, [productId]);
      if (!product) {
        throw AppError.notFound("Product", { productId });
      }

      const batches = await tx
        .select({
          id: productBatches.id,
          batchNumber: productBatches.batchNumber,
          expiryDate: productBatches.expiryDate,
          availableQuantity: productBatches.availableQuantity,
        })
        .from(productBatches)
        .where(
          and(
            eq(productBatches.productId, productId),
            gt(productBatches.availableQuantity, 0),
            gt(productBatches.expiryDate, today),
          ),
        )
        .orderBy(asc(productBatches.expiryDate), asc(productBatches.id))
        .for("update");

      const allocations: BatchAllocation[] = [];
      let remaining = requiredQty;
      for (const batch of batches) {
        if (remaining === 0) break;
        const take = Math.min(batch.availableQuantity, remaining);
        allocations.push({
          batchId: batch.id,
          productId,
          batchNumber: batch.batchNumber,
          expiryDate: batch.expiryDate,
          quantity: take,
        });
        remaining -= take;
      }

      if (remaining > 0) {
        throw outOfStockError(product, requiredQty, requiredQty - remaining);
      }
      return allocations;
    });
  }

  /**
   * Commits an allocation plan: relative, guarded decrements on each batch,
   * one PURCHASE ledger row per batch (linked to `orderId`), then zero-stock
   * auto-deactivation. Runs inside `db` when it is a transaction.
   *
   * `orderId` must be the id of the order row; it may be inserted later in the
   * same transaction (the ledger FK is checked at COMMIT).
   *
   * @throws AppError INSUFFICIENT_STOCK `details: { productId, batchId, requested, available }`,
   *         NOT_FOUND (batch), VALIDATION_ERROR (bad input).
   */
  async reserveStock(
    allocations: readonly AllocationInput[],
    orderId: string,
    performedByUserId: string | null = null,
    db: DbExecutor = defaultDb,
  ): Promise<ReservationResult> {
    assertUuid(orderId, "orderId");
    if (allocations.length === 0) {
      throw fieldValidationError({ allocations: ["At least one allocation is required"] });
    }
    const requested = new Map<string, number>();
    for (const allocation of allocations) {
      assertUuid(allocation.batchId, "batchId");
      assertPositiveInteger(allocation.quantity, "quantity");
      requested.set(allocation.batchId, (requested.get(allocation.batchId) ?? 0) + allocation.quantity);
    }

    const today = todayInBusinessTz();
    const ownsTransaction = !isTransaction(db);

    const result = await runInTransaction(db, async (tx) => {
      const batchIds = [...requested.keys()];
      const owners = await tx
        .select({ id: productBatches.id, productId: productBatches.productId })
        .from(productBatches)
        .where(inArray(productBatches.id, batchIds));
      if (owners.length !== batchIds.length) {
        const known = new Set(owners.map((o) => o.id));
        throw AppError.notFound("Batch", { batchIds: batchIds.filter((id) => !known.has(id)) });
      }

      const lockedProducts = await lockProducts(
        tx,
        owners.map((o) => o.productId),
      );
      const productById = new Map(lockedProducts.map((p) => [p.id, p]));

      const lockedBatches = await tx
        .select({
          id: productBatches.id,
          productId: productBatches.productId,
          expiryDate: productBatches.expiryDate,
          availableQuantity: productBatches.availableQuantity,
        })
        .from(productBatches)
        .where(inArray(productBatches.id, batchIds))
        .orderBy(asc(productBatches.productId), asc(productBatches.expiryDate), asc(productBatches.id))
        .for("update");

      const pending: Array<Omit<StockMovement, "ledgerEntryId">> = [];
      for (const batch of lockedBatches) {
        const quantity = requested.get(batch.id) ?? 0;
        const product = productById.get(batch.productId);
        if (!product) {
          throw AppError.notFound("Product", { productId: batch.productId });
        }
        const sellable = batch.expiryDate > today ? batch.availableQuantity : 0;
        if (sellable < quantity) {
          throw AppError.insufficientStock(
            sellable === 0
              ? `"${product.title}" is out of stock`
              : `Only ${sellable} unit(s) of "${product.title}" are in stock`,
            { productId: batch.productId, batchId: batch.id, requested: quantity, available: sellable },
          );
        }

        const [updated] = await tx
          .update(productBatches)
          .set({ availableQuantity: sql`${productBatches.availableQuantity} - ${quantity}` })
          .where(and(eq(productBatches.id, batch.id), gte(productBatches.availableQuantity, quantity)))
          .returning({ availableQuantity: productBatches.availableQuantity });
        if (!updated) {
          throw AppError.insufficientStock(`Only ${batch.availableQuantity} unit(s) of "${product.title}" are in stock`, {
            productId: batch.productId,
            batchId: batch.id,
            requested: quantity,
            available: batch.availableQuantity,
          });
        }
        pending.push({
          productId: batch.productId,
          batchId: batch.id,
          quantity,
          balanceAfter: updated.availableQuantity,
        });
      }

      const entries = await tx
        .insert(stockHistoryLogs)
        .values(
          pending.map((movement) => ({
            productId: movement.productId,
            batchId: movement.batchId,
            orderId,
            changeDelta: -movement.quantity,
            balanceAfter: movement.balanceAfter,
            reason: "PURCHASE" as const,
            note: `Reserved for order ${orderId}`,
            performedByUserId,
          })),
        )
        .returning({ id: stockHistoryLogs.id });

      const availabilityChanges = await syncProductAvailability(
        tx,
        pending.map((m) => m.productId),
        today,
      );

      const movements: StockMovement[] = pending.map((movement, index) => ({
        ...movement,
        ledgerEntryId: entries[index]?.id ?? "",
      }));
      return {
        orderId,
        reservedUnits: movements.reduce((sum, m) => sum + m.quantity, 0),
        movements,
        availabilityChanges,
      };
    });

    if (ownsTransaction) {
      logAvailabilityChanges("reserve_stock", result.availabilityChanges);
      invalidateCatalogCache();
    }
    return result;
  }

  /**
   * Allocates (FEFO) and reserves several checkout lines atomically, locking
   * products in ascending id order. Duplicate product lines are merged.
   */
  async allocateAndReserve(
    lines: readonly CheckoutLine[],
    orderId: string,
    performedByUserId: string | null = null,
    db: DbExecutor = defaultDb,
  ): Promise<AllocateAndReserveResult> {
    if (lines.length === 0) {
      throw fieldValidationError({ items: ["At least one item is required"] });
    }
    const merged = new Map<string, number>();
    for (const line of lines) {
      assertUuid(line.productId, "productId");
      assertPositiveInteger(line.quantity, "quantity");
      merged.set(line.productId, (merged.get(line.productId) ?? 0) + line.quantity);
    }
    const ordered = [...merged.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const ownsTransaction = !isTransaction(db);

    const result = await runInTransaction(db, async (tx) => {
      const allocatedLines: AllocatedLine[] = [];
      for (const [productId, quantity] of ordered) {
        const allocations = await this.allocateBatchesFEFO(productId, quantity, tx);
        allocatedLines.push({ productId, quantity, allocations });
      }
      const reservation = await this.reserveStock(
        allocatedLines.flatMap((line) => line.allocations),
        orderId,
        performedByUserId,
        tx,
      );
      return { lines: allocatedLines, reservation };
    });

    if (ownsTransaction) invalidateCatalogCache();
    return result;
  }

  /**
   * Returns every unit reserved by `orderId` to the batch it came from (RETURN
   * ledger rows linked to the order) and re-activates auto-hidden products.
   * Idempotent: a second call for the same order restocks nothing and returns
   * `alreadyReleased: true`. Concurrent calls for one order are serialized by
   * a transaction-scoped advisory lock. Runs inside `db` when it is a
   * transaction.
   */
  async releaseReservation(
    orderId: string,
    performedByUserId: string | null = null,
    db: DbExecutor = defaultDb,
  ): Promise<ReleaseResult> {
    assertUuid(orderId, "orderId");
    const today = todayInBusinessTz();
    const ownsTransaction = !isTransaction(db);
    // Ledger rows written before order_id existed only carried the order in the note.
    const legacyPurchaseNote = `Reserved for order ${orderId}`;
    const legacyReturnNote = `Stock returned on cancellation of order ${orderId}`;

    const result = await runInTransaction(db, async (tx): Promise<ReleaseResult> => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`stock-release:${orderId}`}, 0))`);

      const [previousReturn] = await tx
        .select({ id: stockHistoryLogs.id })
        .from(stockHistoryLogs)
        .where(
          and(
            eq(stockHistoryLogs.reason, "RETURN"),
            or(
              eq(stockHistoryLogs.orderId, orderId),
              and(isNull(stockHistoryLogs.orderId), eq(stockHistoryLogs.note, legacyReturnNote)),
            ),
          ),
        )
        .limit(1);
      if (previousReturn) {
        return {
          orderId,
          restoredUnits: 0,
          alreadyReleased: true,
          skippedUnits: 0,
          movements: [],
          availabilityChanges: [],
        };
      }

      const purchases = await tx
        .select({
          batchId: stockHistoryLogs.batchId,
          productId: stockHistoryLogs.productId,
          quantity: sql<number>`(-sum(${stockHistoryLogs.changeDelta}))::int`,
        })
        .from(stockHistoryLogs)
        .where(
          and(
            eq(stockHistoryLogs.reason, "PURCHASE"),
            or(
              eq(stockHistoryLogs.orderId, orderId),
              and(isNull(stockHistoryLogs.orderId), eq(stockHistoryLogs.note, legacyPurchaseNote)),
            ),
          ),
        )
        .groupBy(stockHistoryLogs.batchId, stockHistoryLogs.productId);

      const restorable = new Map<string, number>();
      let skippedUnits = 0;
      for (const row of purchases) {
        const quantity = Number(row.quantity);
        if (quantity <= 0) continue;
        if (row.batchId === null) {
          skippedUnits += quantity;
        } else {
          restorable.set(row.batchId, (restorable.get(row.batchId) ?? 0) + quantity);
        }
      }

      if (restorable.size === 0) {
        return {
          orderId,
          restoredUnits: 0,
          alreadyReleased: false,
          skippedUnits,
          movements: [],
          availabilityChanges: [],
        };
      }

      const batchIds = [...restorable.keys()];
      await lockProducts(
        tx,
        purchases.map((p) => p.productId),
      );
      const lockedBatches = await tx
        .select({ id: productBatches.id, productId: productBatches.productId })
        .from(productBatches)
        .where(inArray(productBatches.id, batchIds))
        .orderBy(asc(productBatches.productId), asc(productBatches.expiryDate), asc(productBatches.id))
        .for("update");

      const pending: Array<Omit<StockMovement, "ledgerEntryId">> = [];
      for (const batch of lockedBatches) {
        const quantity = restorable.get(batch.id) ?? 0;
        const [updated] = await tx
          .update(productBatches)
          .set({ availableQuantity: sql`${productBatches.availableQuantity} + ${quantity}` })
          .where(eq(productBatches.id, batch.id))
          .returning({ availableQuantity: productBatches.availableQuantity });
        if (updated) {
          pending.push({ productId: batch.productId, batchId: batch.id, quantity, balanceAfter: updated.availableQuantity });
        }
      }

      const entries =
        pending.length === 0
          ? []
          : await tx
              .insert(stockHistoryLogs)
              .values(
                pending.map((movement) => ({
                  productId: movement.productId,
                  batchId: movement.batchId,
                  orderId,
                  changeDelta: movement.quantity,
                  balanceAfter: movement.balanceAfter,
                  reason: "RETURN" as const,
                  note: `Stock returned for order ${orderId}`,
                  performedByUserId,
                })),
              )
              .returning({ id: stockHistoryLogs.id });

      const availabilityChanges = await syncProductAvailability(
        tx,
        pending.map((m) => m.productId),
        today,
      );

      const movements: StockMovement[] = pending.map((movement, index) => ({
        ...movement,
        ledgerEntryId: entries[index]?.id ?? "",
      }));
      const restoredBatchIds = new Set(pending.map((m) => m.batchId));
      for (const [batchId, quantity] of restorable) {
        if (!restoredBatchIds.has(batchId)) skippedUnits += quantity;
      }
      return {
        orderId,
        restoredUnits: movements.reduce((sum, m) => sum + m.quantity, 0),
        alreadyReleased: false,
        skippedUnits,
        movements,
        availabilityChanges,
      };
    });

    if (ownsTransaction) {
      logAvailabilityChanges("release_reservation", result.availabilityChanges);
      if (result.restoredUnits > 0) invalidateCatalogCache();
    }
    return result;
  }

  /**
   * THE batch import (POST /admin/inventory/batches): inserts the batch, writes
   * the IMPORT ledger row and re-activates the product if it was auto-hidden,
   * all in one transaction.
   */
  async importBatch(
    input: ImportBatchInput,
    performedByUserId: string | null,
    db: DbExecutor = defaultDb,
  ): Promise<ImportBatchResult> {
    const today = todayInBusinessTz();
    assertUuid(input.productId, "productId");
    assertPositiveInteger(input.initialQuantity, "initialQuantity");
    const dateErrors = validateBatchDates(input.manufactureDate ?? null, input.expiryDate, today);
    if (dateErrors) throw fieldValidationError(dateErrors);
    const ownsTransaction = !isTransaction(db);

    let result: ImportBatchResult;
    try {
      result = await runInTransaction(db, async (tx) => {
        const [product] = await lockProducts(tx, [input.productId]);
        if (!product) {
          throw AppError.notFound("Product", { productId: input.productId });
        }

        const [duplicate] = await tx
          .select({ id: productBatches.id })
          .from(productBatches)
          .where(
            and(
              eq(productBatches.productId, input.productId),
              eq(productBatches.batchNumber, input.batchNumber),
            ),
          )
          .limit(1);
        if (duplicate) {
          throw AppError.conflict(`Batch number "${input.batchNumber}" already exists for this product`, {
            productId: input.productId,
            batchNumber: input.batchNumber,
          });
        }

        const [batch] = await tx
          .insert(productBatches)
          .values({
            productId: input.productId,
            batchNumber: input.batchNumber,
            manufactureDate: input.manufactureDate ?? null,
            expiryDate: input.expiryDate,
            initialQuantity: input.initialQuantity,
            availableQuantity: input.initialQuantity,
          })
          .returning({ id: productBatches.id });
        if (!batch) {
          throw AppError.internal("Batch insert returned no row");
        }

        const [entry] = await tx
          .insert(stockHistoryLogs)
          .values({
            productId: input.productId,
            batchId: batch.id,
            changeDelta: input.initialQuantity,
            balanceAfter: input.initialQuantity,
            reason: "IMPORT",
            note: input.note?.trim() || `Batch ${input.batchNumber} imported`,
            performedByUserId,
          })
          .returning({ id: stockHistoryLogs.id });

        const changes = await syncProductAvailability(tx, [input.productId], today);

        return {
          batch: await loadBatchDto(tx, batch.id, today),
          product: await loadProductStockStatus(tx, input.productId, today),
          ledgerEntryId: entry?.id ?? "",
          availabilityChanges: changes,
        };
      });
    } catch (error) {
      if (isUniqueViolation(error, "product_batch_unique")) {
        throw AppError.conflict(`Batch number "${input.batchNumber}" already exists for this product`, {
          productId: input.productId,
          batchNumber: input.batchNumber,
        });
      }
      throw error;
    }

    if (ownsTransaction) {
      logAvailabilityChanges("batch_import", result.availabilityChanges);
      invalidateCatalogCache();
    }
    return result;
  }

  /**
   * Manual stock correction on one batch (POST /admin/inventory/adjust).
   * Rejects results below zero (409 INSUFFICIENT_STOCK) and additions to an
   * expired batch (422). Applies auto-(de)activation.
   */
  async adjustStock(
    input: StockAdjustmentInput,
    performedByUserId: string | null,
    db: DbExecutor = defaultDb,
  ): Promise<StockAdjustmentResult> {
    assertUuid(input.productId, "productId");
    assertUuid(input.batchId, "batchId");
    if (!Number.isSafeInteger(input.delta) || input.delta === 0) {
      throw fieldValidationError({ delta: ["delta must be a non-zero integer"] });
    }
    if (input.reason === "EXPIRED_SCRAP" && input.delta > 0) {
      throw fieldValidationError({ delta: ["EXPIRED_SCRAP adjustments must remove stock (negative delta)"] });
    }
    const today = todayInBusinessTz();
    const ownsTransaction = !isTransaction(db);

    const result = await runInTransaction(db, async (tx) => {
      const [product] = await lockProducts(tx, [input.productId]);
      if (!product) {
        throw AppError.notFound("Product", { productId: input.productId });
      }
      const [batch] = await tx
        .select({
          id: productBatches.id,
          batchNumber: productBatches.batchNumber,
          expiryDate: productBatches.expiryDate,
          availableQuantity: productBatches.availableQuantity,
        })
        .from(productBatches)
        .where(and(eq(productBatches.id, input.batchId), eq(productBatches.productId, input.productId)))
        .for("update");
      if (!batch) {
        throw AppError.notFound("Batch", { batchId: input.batchId, productId: input.productId });
      }
      if (input.delta > 0 && batch.expiryDate <= today) {
        throw fieldValidationError({ batchId: ["Cannot add stock to an expired batch"] });
      }
      if (batch.availableQuantity + input.delta < 0) {
        throw AppError.insufficientStock(
          `Adjustment would make stock negative: batch ${batch.batchNumber} holds ${batch.availableQuantity} unit(s)`,
          {
            productId: input.productId,
            batchId: input.batchId,
            available: batch.availableQuantity,
            delta: input.delta,
          },
        );
      }

      const [updated] = await tx
        .update(productBatches)
        .set({ availableQuantity: sql`${productBatches.availableQuantity} + ${input.delta}` })
        .where(
          and(
            eq(productBatches.id, input.batchId),
            sql`${productBatches.availableQuantity} + ${input.delta} >= 0`,
          ),
        )
        .returning({ availableQuantity: productBatches.availableQuantity });
      if (!updated) {
        throw AppError.insufficientStock("Adjustment would make stock negative", {
          productId: input.productId,
          batchId: input.batchId,
          available: batch.availableQuantity,
          delta: input.delta,
        });
      }

      const [entry] = await tx
        .insert(stockHistoryLogs)
        .values({
          productId: input.productId,
          batchId: input.batchId,
          changeDelta: input.delta,
          balanceAfter: updated.availableQuantity,
          reason: input.reason,
          note: input.note?.trim() || null,
          performedByUserId,
        })
        .returning({ id: stockHistoryLogs.id });

      const changes = await syncProductAvailability(tx, [input.productId], today);

      return {
        batch: await loadBatchDto(tx, input.batchId, today),
        product: await loadProductStockStatus(tx, input.productId, today),
        ledgerEntryId: entry?.id ?? "",
        reason: input.reason,
        delta: input.delta,
        previousQuantity: batch.availableQuantity,
        newQuantity: updated.availableQuantity,
        availabilityChanges: changes,
      };
    });

    if (ownsTransaction) {
      logAvailabilityChanges("stock_adjustment", result.availabilityChanges);
      invalidateCatalogCache();
    }
    return result;
  }

  /** Sellable stock (unexpired, business time zone) of one product. */
  async getTotalAvailableStock(productId: string, db: DbExecutor = defaultDb): Promise<number> {
    const today = todayInBusinessTz();
    const [row] = await db
      .select({ total: sellableStockSql(today) })
      .from(products)
      .where(eq(products.id, productId));
    return Number(row?.total ?? 0);
  }

  /**
   * Products whose sellable stock is at or below their low-stock threshold,
   * including auto-hidden (out of stock) ones; manually deactivated products
   * are excluded. Most critical first.
   */
  async listLowStock(
    pagination: { page: number; limit: number },
    db: DbExecutor = defaultDb,
  ): Promise<{ items: LowStockItem[]; total: number }> {
    const today = todayInBusinessTz();
    const stock = sellableStockSql(today);
    const where = and(
      or(eq(products.isActive, true), isNotNull(products.autoDeactivatedAt)),
      sql`${stock} <= ${products.lowStockThreshold}`,
    );

    const [rows, totals] = await queryAll(
      db,
      () =>
        db
          .select({
            id: products.id,
            title: products.title,
            slug: products.slug,
            sku: products.sku,
            lowStockThreshold: products.lowStockThreshold,
            isActive: products.isActive,
            autoDeactivatedAt: products.autoDeactivatedAt,
            totalStock: stock,
            earliestExpiry: earliestExpirySql(today),
          })
          .from(products)
          .where(where)
          .orderBy(asc(stock), asc(products.title), asc(products.id))
          .limit(pagination.limit)
          .offset(pageOffset(pagination.page, pagination.limit)),
      () => db.select({ total: count() }).from(products).where(where),
    );

    return {
      items: rows.map((row) => {
        const totalStock = Number(row.totalStock);
        return {
          productId: row.id,
          title: row.title,
          slug: row.slug,
          sku: row.sku,
          totalStock,
          lowStockThreshold: row.lowStockThreshold,
          isOutOfStock: totalStock === 0,
          isActive: row.isActive,
          autoDeactivatedAt: toNullableIso(row.autoDeactivatedAt),
          listingStatus: listingStatusOf(row),
          earliestExpiry: row.earliestExpiry,
        };
      }),
      total: Number(totals[0]?.total ?? 0),
    };
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Field errors for batch dates, or null when valid. */
export function validateBatchDates(
  manufactureDate: string | null,
  expiryDate: string,
  today: string,
): Record<string, string[]> | null {
  const errors: Record<string, string[]> = {};
  if (!isIsoCalendarDate(expiryDate)) {
    errors.expiryDate = ["expiryDate must be a valid YYYY-MM-DD date"];
  } else if (expiryDate <= today) {
    errors.expiryDate = ["Cannot import a batch that has already expired"];
  }
  if (manufactureDate !== null) {
    if (!isIsoCalendarDate(manufactureDate)) {
      errors.manufactureDate = ["manufactureDate must be a valid YYYY-MM-DD date"];
    } else if (manufactureDate > today) {
      errors.manufactureDate = ["manufactureDate cannot be in the future"];
    } else if (manufactureDate >= expiryDate) {
      errors.manufactureDate = ["manufactureDate must be before expiryDate"];
    }
  }
  return Object.keys(errors).length > 0 ? errors : null;
}

async function loadBatchDto(tx: DatabaseTransaction, batchId: string, today: string): Promise<BatchDTO> {
  const [row] = await tx
    .select(batchRowSelection)
    .from(productBatches)
    .innerJoin(products, eq(productBatches.productId, products.id))
    .where(eq(productBatches.id, batchId));
  if (!row) throw AppError.notFound("Batch", { batchId });
  return toBatchDto(row, today);
}

export async function loadProductStockStatus(
  db: DbExecutor,
  productId: string,
  today: string = todayInBusinessTz(),
): Promise<ProductStockStatus> {
  const [row] = await db
    .select({
      id: products.id,
      title: products.title,
      sku: products.sku,
      isActive: products.isActive,
      autoDeactivatedAt: products.autoDeactivatedAt,
      totalStock: sellableStockSql(today),
    })
    .from(products)
    .where(eq(products.id, productId));
  if (!row) throw AppError.notFound("Product", { productId });
  return {
    id: row.id,
    title: row.title,
    sku: row.sku,
    isActive: row.isActive,
    autoDeactivatedAt: toNullableIso(row.autoDeactivatedAt),
    listingStatus: listingStatusOf(row),
    totalStock: Number(row.totalStock),
  };
}

export const inventoryService = new InventoryService();
