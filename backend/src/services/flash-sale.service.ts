/**
 * Automatic-discount pricing engine (flash sales and sale prices).
 *
 * Only AUTOMATIC discounts (`discounts.code IS NULL`) ever change a catalog
 * price; coupons (rows with a code) are applied at checkout by the coupon
 * service and are ignored here.
 *
 * Winner selection for a product (the SQL twin lives in catalog.service.ts
 * and must stay identical):
 *   1. scope priority: product-specific > category > store-wide
 *      (store-wide = no product and no category);
 *   2. within the best scope: largest discount amount;
 *   3. tie: the discount ending first, then the lowest id.
 * Amounts are computed in integer cents:
 *   PERCENTAGE   round_half_up(base * value / 100) (value <= 100)
 *   FIXED_AMOUNT value
 *   then capped by max_discount_amount (when set) and by the base price.
 */
import { and, eq, gt, isNull, lte, or, type SQL } from "drizzle-orm";
import { db as defaultDb } from "../db/client";
import { discounts } from "../db/schema/tables";
import type { DiscountType } from "../types";
import type { DbExecutor } from "./db-executor";

export type { DiscountType };

/** A discount as stored in the database (a `discounts` row satisfies this). */
export interface Discount {
  id: string;
  code?: string | null;
  name?: string | null;
  type: DiscountType;
  value: string | number;
  productId?: string | null;
  categoryId?: string | null;
  maxDiscountAmount?: string | number | null;
  startsAt?: Date | string;
  endsAt?: Date | string;
  isFlashSale?: boolean;
  isActive?: boolean;
}

export interface PricedProductInput {
  id: string;
  categoryId: string;
  basePrice: string | number;
}

export interface EffectivePriceResult {
  /** Effective unit price as a 2-decimal string (e.g. "800.00"); kept for existing callers. */
  effectivePrice: string;
  /** Winning automatic discount, or null. */
  discount: Discount | null;
  basePriceValue: number;
  effectivePriceValue: number;
  discountAmount: number;
  /** Discount as a percentage of the base price, 2 decimals. */
  discountPercent: number;
}

export interface EffectivePricing {
  effectivePrice: number;
  discountAmount: number;
  discountPercent: number;
}

// ---------------------------------------------------------------------------
// Integer-cent arithmetic (mirrors Postgres numeric rounding: half away from zero)
// ---------------------------------------------------------------------------

/** Money value → integer cents. Throws on non-finite input instead of silently using 0. */
export function toCents(value: string | number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw new RangeError(`Invalid money value "${String(value)}"`);
  }
  return Math.round(parsed * 100);
}

export function fromCents(cents: number): number {
  return cents / 100;
}

function roundHalfUpDiv(numerator: number, divisor: number): number {
  return Math.floor((numerator + divisor / 2) / divisor);
}

/** Discount amount (cents) of `discount` applied to a base price (cents). */
export function discountAmountCents(baseCents: number, discount: Discount): number {
  if (baseCents <= 0) return 0;
  const valueCents = toCents(discount.value);
  if (valueCents <= 0) return 0;
  let amount =
    discount.type === "PERCENTAGE"
      ? roundHalfUpDiv(baseCents * Math.min(valueCents, 10_000), 10_000)
      : valueCents;
  if (discount.maxDiscountAmount !== null && discount.maxDiscountAmount !== undefined) {
    amount = Math.min(amount, toCents(discount.maxDiscountAmount));
  }
  return Math.max(0, Math.min(amount, baseCents));
}

export function discountPercentOf(baseCents: number, discountCents: number): number {
  if (baseCents <= 0 || discountCents <= 0) return 0;
  return roundHalfUpDiv(discountCents * 10_000, baseCents) / 100;
}

/** 3 = product, 2 = category, 1 = store-wide, 0 = does not apply. */
export function discountScopePriority(discount: Discount, product: PricedProductInput): number {
  const productId = discount.productId ?? null;
  const categoryId = discount.categoryId ?? null;
  if (productId !== null) return productId === product.id ? 3 : 0;
  if (categoryId !== null) return categoryId === product.categoryId ? 2 : 0;
  return 1;
}

function endsAtMs(discount: Discount): number {
  if (discount.endsAt === undefined) return Number.POSITIVE_INFINITY;
  const ms = new Date(discount.endsAt).getTime();
  return Number.isNaN(ms) ? Number.POSITIVE_INFINITY : ms;
}

/** Automatic, enabled and (when the window is known) running at `now`. */
function isApplicableAutomatic(discount: Discount, now: number): boolean {
  if (discount.code !== null && discount.code !== undefined) return false;
  if (discount.isActive === false) return false;
  if (discount.startsAt !== undefined && new Date(discount.startsAt).getTime() > now) return false;
  if (discount.endsAt !== undefined && endsAtMs(discount) <= now) return false;
  return true;
}

export class FlashSaleService {
  /**
   * Effective price of a product given candidate discounts (usually the
   * result of `getActiveDiscounts`). Coupons, disabled and out-of-window
   * discounts are ignored defensively.
   */
  calculateEffectivePrice(
    product: PricedProductInput,
    activeDiscounts: readonly Discount[],
    now: Date = new Date(),
  ): EffectivePriceResult {
    const baseCents = Math.max(0, toCents(product.basePrice));
    const nowMs = now.getTime();

    let best: { discount: Discount; priority: number; amount: number; endsAt: number } | null = null;
    for (const discount of activeDiscounts) {
      if (!isApplicableAutomatic(discount, nowMs)) continue;
      const priority = discountScopePriority(discount, product);
      if (priority === 0) continue;
      const amount = discountAmountCents(baseCents, discount);
      const endsAt = endsAtMs(discount);
      const better =
        best === null ||
        priority > best.priority ||
        (priority === best.priority &&
          (amount > best.amount ||
            (amount === best.amount &&
              (endsAt < best.endsAt || (endsAt === best.endsAt && discount.id < best.discount.id)))));
      if (better) {
        best = { discount, priority, amount, endsAt };
      }
    }

    const discountCents = best?.amount ?? 0;
    const effectiveCents = baseCents - discountCents;
    return {
      effectivePrice: (effectiveCents / 100).toFixed(2),
      discount: best?.discount ?? null,
      basePriceValue: fromCents(baseCents),
      effectivePriceValue: fromCents(effectiveCents),
      discountAmount: fromCents(discountCents),
      discountPercent: discountPercentOf(baseCents, discountCents),
    };
  }

  /** Price breakdown for a single known discount (numbers). */
  computeEffectivePrice(basePrice: number, discount: Discount): EffectivePricing {
    const baseCents = Math.max(0, toCents(basePrice));
    const discountCents = discountAmountCents(baseCents, discount);
    return {
      effectivePrice: fromCents(baseCents - discountCents),
      discountAmount: fromCents(discountCents),
      discountPercent: discountPercentOf(baseCents, discountCents),
    };
  }

  /**
   * Automatic discounts (code IS NULL) that are enabled and running now.
   * With `productId` and/or `categoryId` only the discounts that can apply to
   * that product are returned (product-, category- and store-wide ones).
   */
  async getActiveDiscounts(
    productId?: string,
    categoryId?: string,
    db: DbExecutor = defaultDb,
  ): Promise<Discount[]> {
    const now = new Date();
    const conditions: SQL[] = [
      isNull(discounts.code),
      eq(discounts.isActive, true),
      lte(discounts.startsAt, now),
      gt(discounts.endsAt, now),
    ];

    if (productId !== undefined || categoryId !== undefined) {
      const scopes: SQL[] = [];
      if (productId !== undefined) scopes.push(eq(discounts.productId, productId));
      if (categoryId !== undefined) {
        const categoryScope = and(isNull(discounts.productId), eq(discounts.categoryId, categoryId));
        if (categoryScope) scopes.push(categoryScope);
      }
      const storeWide = and(isNull(discounts.productId), isNull(discounts.categoryId));
      if (storeWide) scopes.push(storeWide);
      const scope = or(...scopes);
      if (scope) conditions.push(scope);
    }

    return db
      .select()
      .from(discounts)
      .where(and(...conditions));
  }

  /** Milliseconds until the discount ends (0 when ended or unknown). */
  getFlashSaleCountdown(discount: { endsAt?: Date | string | null }, now: Date = new Date()): number {
    if (!discount.endsAt) return 0;
    const remaining = new Date(discount.endsAt).getTime() - now.getTime();
    return Number.isFinite(remaining) ? Math.max(0, remaining) : 0;
  }
}

export const flashSaleService = new FlashSaleService();
