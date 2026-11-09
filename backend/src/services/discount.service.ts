/**
 * Discount administration (automatic discounts / flash sales and coupons).
 *
 * - AUTOMATIC (code IS NULL): applied to catalog prices by the pricing engine.
 *   Coupon-only fields (minOrderAmount, usageLimit, perCustomerLimit) are
 *   rejected; maxDiscountAmount caps the per-unit discount.
 * - COUPON (code set, unique case-insensitively, stored upper-case): applied at
 *   checkout by the coupon service; never affects catalog prices.
 * - Scope: productId XOR categoryId, or neither (store-wide).
 * - The kind is fixed at creation: `code` cannot be changed afterwards.
 * - usage_count is read-only here (maintained by checkout).
 * - DELETE deactivates (is_active = false); rows are kept for order history.
 */
import { and, count, desc, eq, ilike, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import { db as defaultDb, type DatabaseTransaction } from "../db/client";
import { categories, discounts, products } from "../db/schema/tables";
import { isUniqueViolation } from "../lib/db-errors";
import { AppError } from "../lib/errors";
import { pageOffset } from "../lib/http";
import { invalidateCatalogCache } from "../middleware/cache";
import type { DiscountType } from "../types";
import { type DbExecutor, isTransaction, queryAll, runInTransaction } from "./db-executor";
import { containsPattern, fieldValidationError, toIso, toNullableNumber, toNumber } from "./service-utils";

export type DiscountKind = "AUTOMATIC" | "COUPON";
export const DISCOUNT_STATUSES = ["SCHEDULED", "ACTIVE", "EXPIRED", "DISABLED"] as const;
export type DiscountStatus = (typeof DISCOUNT_STATUSES)[number];

export interface DiscountDTO {
  id: string;
  kind: DiscountKind;
  code: string | null;
  name: string | null;
  type: DiscountType;
  value: number;
  scope: "PRODUCT" | "CATEGORY" | "STORE";
  productId: string | null;
  categoryId: string | null;
  product: { id: string; title: string; slug: string } | null;
  category: { id: string; name: string; slug: string } | null;
  minOrderAmount: number | null;
  maxDiscountAmount: number | null;
  usageLimit: number | null;
  usageCount: number;
  perCustomerLimit: number | null;
  startsAt: string;
  endsAt: string;
  isFlashSale: boolean;
  isActive: boolean;
  status: DiscountStatus;
  /** Milliseconds until endsAt while ACTIVE, else 0. */
  countdownMs: number;
  createdAt: string;
  updatedAt: string;
}

export interface DiscountListFilters {
  page: number;
  limit: number;
  /** automatic = code IS NULL, coupon = code IS NOT NULL. */
  type?: "automatic" | "coupon";
  /** true = currently running (enabled and inside its window); false = everything else. */
  active?: boolean;
  status?: DiscountStatus;
  discountType?: DiscountType;
  /** Matches name or code (case-insensitive). */
  q?: string;
  productId?: string;
  categoryId?: string;
}

/** Complete discount state (create input, or existing row merged with a patch). */
export interface DiscountState {
  code: string | null;
  name: string | null;
  type: DiscountType;
  value: number;
  productId: string | null;
  categoryId: string | null;
  minOrderAmount: number | null;
  maxDiscountAmount: number | null;
  usageLimit: number | null;
  perCustomerLimit: number | null;
  startsAt: Date;
  endsAt: Date;
  isFlashSale: boolean;
  isActive: boolean;
}

export type DiscountPatch = Partial<DiscountState>;

/**
 * Cross-field rules shared by the request schemas and the PATCH merge.
 * Returns field errors (empty object when valid).
 */
export function validateDiscountState(
  state: DiscountState,
  options: { now?: Date; requireFutureEnd?: boolean; usageCount?: number } = {},
): Record<string, string[]> {
  const errors: Record<string, string[]> = {};
  const add = (field: string, message: string): void => {
    (errors[field] ??= []).push(message);
  };

  if (!(state.value > 0)) add("value", "value must be greater than 0");
  if (state.type === "PERCENTAGE" && state.value > 100) add("value", "a percentage discount cannot exceed 100");
  if (state.productId !== null && state.categoryId !== null) {
    add("productId", "a discount targets a product or a category, not both");
    add("categoryId", "a discount targets a product or a category, not both");
  }
  if (state.endsAt.getTime() <= state.startsAt.getTime()) add("endsAt", "endsAt must be after startsAt");
  if (options.requireFutureEnd && state.endsAt.getTime() <= (options.now ?? new Date()).getTime()) {
    add("endsAt", "endsAt must be in the future");
  }

  if (state.code === null) {
    if (state.minOrderAmount !== null) add("minOrderAmount", "minOrderAmount only applies to coupons");
    if (state.usageLimit !== null) add("usageLimit", "usageLimit only applies to coupons");
    if (state.perCustomerLimit !== null) add("perCustomerLimit", "perCustomerLimit only applies to coupons");
  } else if (state.isFlashSale) {
    add("isFlashSale", "coupons cannot be flash sales");
  }

  if (
    options.usageCount !== undefined &&
    state.usageLimit !== null &&
    state.usageLimit < options.usageCount
  ) {
    add("usageLimit", `usageLimit cannot be lower than the current usage count (${options.usageCount})`);
  }
  return errors;
}

const statusSql = sql<DiscountStatus>`(CASE
  WHEN NOT ${discounts.isActive} THEN 'DISABLED'
  WHEN ${discounts.startsAt} > now() THEN 'SCHEDULED'
  WHEN ${discounts.endsAt} <= now() THEN 'EXPIRED'
  ELSE 'ACTIVE' END)`;

const discountSelection = {
  id: discounts.id,
  code: discounts.code,
  name: discounts.name,
  type: discounts.type,
  value: discounts.value,
  productId: discounts.productId,
  categoryId: discounts.categoryId,
  productTitle: products.title,
  productSlug: products.slug,
  categoryName: categories.name,
  categorySlug: categories.slug,
  minOrderAmount: discounts.minOrderAmount,
  maxDiscountAmount: discounts.maxDiscountAmount,
  usageLimit: discounts.usageLimit,
  usageCount: discounts.usageCount,
  perCustomerLimit: discounts.perCustomerLimit,
  startsAt: discounts.startsAt,
  endsAt: discounts.endsAt,
  isFlashSale: discounts.isFlashSale,
  isActive: discounts.isActive,
  createdAt: discounts.createdAt,
  updatedAt: discounts.updatedAt,
};

function selectDiscounts(db: DbExecutor) {
  return db
    .select(discountSelection)
    .from(discounts)
    .leftJoin(products, eq(products.id, discounts.productId))
    .leftJoin(categories, eq(categories.id, discounts.categoryId));
}

type DiscountRow = Awaited<ReturnType<typeof selectDiscounts>>[number];

function statusOf(row: { isActive: boolean; startsAt: Date; endsAt: Date }, now: Date): DiscountStatus {
  if (!row.isActive) return "DISABLED";
  if (row.startsAt.getTime() > now.getTime()) return "SCHEDULED";
  if (row.endsAt.getTime() <= now.getTime()) return "EXPIRED";
  return "ACTIVE";
}

function toDiscountDto(row: DiscountRow, now: Date = new Date()): DiscountDTO {
  const status = statusOf(row, now);
  return {
    id: row.id,
    kind: row.code === null ? "AUTOMATIC" : "COUPON",
    code: row.code,
    name: row.name,
    type: row.type,
    value: toNumber(row.value),
    scope: row.productId ? "PRODUCT" : row.categoryId ? "CATEGORY" : "STORE",
    productId: row.productId,
    categoryId: row.categoryId,
    product:
      row.productId && row.productTitle !== null && row.productSlug !== null
        ? { id: row.productId, title: row.productTitle, slug: row.productSlug }
        : null,
    category:
      row.categoryId && row.categoryName !== null && row.categorySlug !== null
        ? { id: row.categoryId, name: row.categoryName, slug: row.categorySlug }
        : null,
    minOrderAmount: toNullableNumber(row.minOrderAmount),
    maxDiscountAmount: toNullableNumber(row.maxDiscountAmount),
    usageLimit: row.usageLimit,
    usageCount: row.usageCount,
    perCustomerLimit: row.perCustomerLimit,
    startsAt: toIso(row.startsAt),
    endsAt: toIso(row.endsAt),
    isFlashSale: row.isFlashSale,
    isActive: row.isActive,
    status,
    countdownMs: status === "ACTIVE" ? Math.max(0, row.endsAt.getTime() - now.getTime()) : 0,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

const money = (value: number | null): string | null => (value === null ? null : value.toFixed(2));

function toColumns(state: DiscountState) {
  return {
    code: state.code,
    name: state.name,
    type: state.type,
    value: state.value.toFixed(2),
    productId: state.productId,
    categoryId: state.categoryId,
    minOrderAmount: money(state.minOrderAmount),
    maxDiscountAmount: money(state.maxDiscountAmount),
    usageLimit: state.usageLimit,
    perCustomerLimit: state.perCustomerLimit,
    startsAt: state.startsAt,
    endsAt: state.endsAt,
    isFlashSale: state.isFlashSale,
    isActive: state.isActive,
  };
}

async function assertReferencesExist(tx: DatabaseTransaction, state: DiscountState): Promise<void> {
  const errors: Record<string, string[]> = {};
  if (state.productId !== null) {
    const [product] = await tx.select({ id: products.id }).from(products).where(eq(products.id, state.productId));
    if (!product) errors.productId = ["Product does not exist"];
  }
  if (state.categoryId !== null) {
    const [category] = await tx
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.id, state.categoryId));
    if (!category) errors.categoryId = ["Category does not exist"];
  }
  if (Object.keys(errors).length > 0) throw fieldValidationError(errors);
}

function duplicateCode(code: string): AppError {
  return AppError.conflict(`A coupon with code "${code}" already exists`, { field: "code" });
}

export class DiscountService {
  async listDiscounts(
    filters: DiscountListFilters,
    db: DbExecutor = defaultDb,
  ): Promise<{ items: DiscountDTO[]; total: number }> {
    const conditions: SQL[] = [];
    if (filters.type === "automatic") conditions.push(isNull(discounts.code));
    if (filters.type === "coupon") conditions.push(isNotNull(discounts.code));
    if (filters.active === true) conditions.push(sql`${statusSql} = 'ACTIVE'`);
    if (filters.active === false) conditions.push(sql`${statusSql} <> 'ACTIVE'`);
    if (filters.status) conditions.push(sql`${statusSql} = ${filters.status}`);
    if (filters.discountType) conditions.push(eq(discounts.type, filters.discountType));
    if (filters.productId) conditions.push(eq(discounts.productId, filters.productId));
    if (filters.categoryId) conditions.push(eq(discounts.categoryId, filters.categoryId));
    if (filters.q) {
      const pattern = containsPattern(filters.q);
      const match = or(ilike(discounts.name, pattern), ilike(discounts.code, pattern));
      if (match) conditions.push(match);
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, totals] = await queryAll(
      db,
      () =>
        selectDiscounts(db)
          .where(where)
          .orderBy(desc(discounts.createdAt), desc(discounts.id))
          .limit(filters.limit)
          .offset(pageOffset(filters.page, filters.limit)),
      () => db.select({ total: count() }).from(discounts).where(where),
    );
    const now = new Date();
    return { items: rows.map((row) => toDiscountDto(row, now)), total: Number(totals[0]?.total ?? 0) };
  }

  async getDiscount(id: string, db: DbExecutor = defaultDb): Promise<DiscountDTO> {
    const [row] = await selectDiscounts(db).where(eq(discounts.id, id)).limit(1);
    if (!row) throw AppError.notFound("Discount", { id });
    return toDiscountDto(row);
  }

  async createDiscount(state: DiscountState, db: DbExecutor = defaultDb): Promise<DiscountDTO> {
    const errors = validateDiscountState(state, { requireFutureEnd: true });
    if (Object.keys(errors).length > 0) throw fieldValidationError(errors);
    const ownsTransaction = !isTransaction(db);

    let id: string;
    try {
      id = await runInTransaction(db, async (tx) => {
        await assertReferencesExist(tx, state);
        if (state.code !== null) {
          const [existing] = await tx
            .select({ id: discounts.id })
            .from(discounts)
            .where(sql`lower(${discounts.code}) = lower(${state.code})`)
            .limit(1);
          if (existing) throw duplicateCode(state.code);
        }
        const [inserted] = await tx.insert(discounts).values(toColumns(state)).returning({ id: discounts.id });
        if (!inserted) throw AppError.internal("Discount insert returned no row");
        return inserted.id;
      });
    } catch (error) {
      if (state.code !== null && isUniqueViolation(error, "discounts_code_lower_unique")) {
        throw duplicateCode(state.code);
      }
      throw error;
    }

    if (ownsTransaction) invalidateCatalogCache();
    return this.getDiscount(id, db);
  }

  async updateDiscount(id: string, patch: DiscountPatch, db: DbExecutor = defaultDb): Promise<DiscountDTO> {
    const ownsTransaction = !isTransaction(db);

    await runInTransaction(db, async (tx) => {
      const [current] = await tx.select().from(discounts).where(eq(discounts.id, id)).for("update");
      if (!current) throw AppError.notFound("Discount", { id });

      if (patch.code !== undefined && (patch.code ?? null) !== current.code) {
        throw fieldValidationError({
          code: ["code cannot be changed after creation (create a new discount instead)"],
        });
      }

      const merged: DiscountState = {
        code: current.code,
        name: patch.name !== undefined ? patch.name : current.name,
        type: patch.type ?? current.type,
        value: patch.value ?? toNumber(current.value),
        productId: patch.productId !== undefined ? patch.productId : current.productId,
        categoryId: patch.categoryId !== undefined ? patch.categoryId : current.categoryId,
        minOrderAmount:
          patch.minOrderAmount !== undefined ? patch.minOrderAmount : toNullableNumber(current.minOrderAmount),
        maxDiscountAmount:
          patch.maxDiscountAmount !== undefined
            ? patch.maxDiscountAmount
            : toNullableNumber(current.maxDiscountAmount),
        usageLimit: patch.usageLimit !== undefined ? patch.usageLimit : current.usageLimit,
        perCustomerLimit: patch.perCustomerLimit !== undefined ? patch.perCustomerLimit : current.perCustomerLimit,
        startsAt: patch.startsAt ?? current.startsAt,
        endsAt: patch.endsAt ?? current.endsAt,
        isFlashSale: patch.isFlashSale ?? current.isFlashSale,
        isActive: patch.isActive ?? current.isActive,
      };

      const errors = validateDiscountState(merged, {
        requireFutureEnd: patch.endsAt !== undefined,
        usageCount: current.usageCount,
      });
      if (Object.keys(errors).length > 0) throw fieldValidationError(errors);
      if (patch.productId !== undefined || patch.categoryId !== undefined) {
        await assertReferencesExist(tx, merged);
      }

      await tx.update(discounts).set(toColumns(merged)).where(eq(discounts.id, id));
    });

    if (ownsTransaction) invalidateCatalogCache();
    return this.getDiscount(id, db);
  }

  /** Soft delete: is_active = false. 409 when already inactive. */
  async deactivateDiscount(id: string, db: DbExecutor = defaultDb): Promise<DiscountDTO> {
    const ownsTransaction = !isTransaction(db);
    await runInTransaction(db, async (tx) => {
      const [current] = await tx
        .select({ id: discounts.id, isActive: discounts.isActive })
        .from(discounts)
        .where(eq(discounts.id, id))
        .for("update");
      if (!current) throw AppError.notFound("Discount", { id });
      if (!current.isActive) throw AppError.conflict("Discount is already inactive", { id });
      await tx.update(discounts).set({ isActive: false }).where(eq(discounts.id, id));
    });
    if (ownsTransaction) invalidateCatalogCache();
    return this.getDiscount(id, db);
  }
}

export const discountService = new DiscountService();
