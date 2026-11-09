/**
 * Coupon engine.
 *
 * Coupons are `discounts` rows WITH a code (automatic sale prices have
 * `code IS NULL` and are already baked into unit prices by order-pricing.ts).
 *
 * Rules, evaluated against server-side effective prices:
 *  - lookup is case-insensitive and only considers rows with a code;
 *  - the coupon must be active and inside [startsAt, endsAt];
 *  - scope: product coupon → only lines of that product; category coupon →
 *    only lines whose product is directly in that category; otherwise the
 *    whole merchandise subtotal ("ORDER" scope);
 *  - min_order_amount is compared with the full merchandise subtotal;
 *  - PERCENTAGE / FIXED_AMOUNT, capped by max_discount_amount and by the
 *    eligible subtotal;
 *  - usage_limit is enforced atomically at checkout with a conditional
 *    `UPDATE ... SET usage_count = usage_count + 1 ... RETURNING`;
 *  - per_customer_limit counts the customer's non-cancelled orders that used
 *    the coupon. The usage-counter UPDATE row-locks the coupon until commit, so
 *    concurrent checkouts with the same coupon are serialised and the count
 *    that follows sees every committed redemption.
 */
import { and, count, eq, isNull, lt, ne, or, sql } from "drizzle-orm";
import { db as defaultDb } from "../db/client";
import { discounts, orders } from "../db/schema/tables";
import { AppError } from "../lib/errors";
import type { DbExecutor } from "./db-executor";
import {
  deliveryFeeFor,
  moneyToNumberOrNull,
  paisaToAmount,
  toPaisa,
  type PricedCart,
} from "./order-pricing";

export const COUPON_REJECTION_CODES = [
  "NOT_FOUND",
  "INACTIVE",
  "NOT_STARTED",
  "EXPIRED",
  "NOT_APPLICABLE",
  "MIN_ORDER_NOT_MET",
  "USAGE_LIMIT_REACHED",
  "PER_CUSTOMER_LIMIT_REACHED",
] as const;
export type CouponRejectionCode = (typeof COUPON_REJECTION_CODES)[number];

export type CouponScope = "ORDER" | "PRODUCT" | "CATEGORY";
export type CouponRecord = typeof discounts.$inferSelect;

export interface CouponCartLine {
  productId: string;
  categoryId: string;
  lineTotalPaisa: number;
}

export type CouponEvaluation =
  | {
      valid: true;
      coupon: CouponRecord;
      scope: CouponScope;
      eligibleSubtotalPaisa: number;
      discountPaisa: number;
    }
  | {
      valid: false;
      coupon: CouponRecord | null;
      scope: CouponScope | null;
      eligibleSubtotalPaisa: number;
      reasonCode: CouponRejectionCode;
      reason: string;
    };

/** A coupon accepted for a checkout (before the usage counter is consumed). */
export interface AppliedCoupon {
  coupon: CouponRecord;
  scope: CouponScope;
  eligibleSubtotalPaisa: number;
  discountPaisa: number;
}

/** Response body of POST /orders/validate-coupon. */
export interface CouponPreviewDTO {
  valid: boolean;
  code: string;
  reasonCode: CouponRejectionCode | null;
  reason: string | null;
  couponType: "PERCENTAGE" | "FIXED_AMOUNT" | null;
  couponValue: number | null;
  scope: CouponScope | null;
  minOrderAmount: number | null;
  maxDiscountAmount: number | null;
  subtotal: number;
  eligibleSubtotal: number;
  discountAmount: number;
  deliveryFee: number;
  total: number;
}

function formatTaka(paisa: number): string {
  return `৳${paisaToAmount(paisa).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

export function couponScopeOf(coupon: Pick<CouponRecord, "productId" | "categoryId">): CouponScope {
  if (coupon.productId) return "PRODUCT";
  if (coupon.categoryId) return "CATEGORY";
  return "ORDER";
}

function reject(
  reasonCode: CouponRejectionCode,
  reason: string,
  coupon: CouponRecord | null,
  scope: CouponScope | null,
  eligibleSubtotalPaisa = 0,
): CouponEvaluation {
  return { valid: false, coupon, scope, eligibleSubtotalPaisa, reasonCode, reason };
}

function couponError(reasonCode: CouponRejectionCode, reason: string, code: string): AppError {
  return AppError.invalidCoupon(reason, { reasonCode, code });
}

export class CouponService {
  /** Case-insensitive lookup among discounts that HAVE a code. */
  async findByCode(code: string, db: DbExecutor = defaultDb): Promise<CouponRecord | null> {
    const normalized = code.trim();
    if (normalized.length === 0) return null;
    const [row] = await db
      .select()
      .from(discounts)
      .where(and(sql`${discounts.code} IS NOT NULL`, sql`lower(${discounts.code}) = lower(${normalized})`))
      .limit(1);
    return row ?? null;
  }

  /**
   * Applies every rule that does not depend on the customer (pure). The usage
   * limit check here is advisory; checkout re-checks it atomically.
   */
  evaluate(
    coupon: CouponRecord | null,
    lines: readonly CouponCartLine[],
    subtotalPaisa: number,
    now: Date = new Date(),
  ): CouponEvaluation {
    if (coupon === null) {
      return reject("NOT_FOUND", "This coupon code is not valid.", null, null);
    }

    const scope = couponScopeOf(coupon);
    if (!coupon.isActive) {
      return reject("INACTIVE", "This coupon is no longer active.", coupon, scope);
    }
    if (now.getTime() < coupon.startsAt.getTime()) {
      return reject("NOT_STARTED", "This coupon is not active yet.", coupon, scope);
    }
    if (now.getTime() > coupon.endsAt.getTime()) {
      return reject("EXPIRED", "This coupon has expired.", coupon, scope);
    }

    const eligibleLines = lines.filter((line) => {
      if (coupon.productId) return line.productId === coupon.productId;
      if (coupon.categoryId) return line.categoryId === coupon.categoryId;
      return true;
    });
    const eligibleSubtotalPaisa = eligibleLines.reduce((sum, line) => sum + line.lineTotalPaisa, 0);
    if (eligibleSubtotalPaisa <= 0) {
      return reject(
        "NOT_APPLICABLE",
        scope === "PRODUCT"
          ? "This coupon applies to a product that is not in your cart."
          : scope === "CATEGORY"
            ? "This coupon applies to a product category that is not in your cart."
            : "This coupon does not apply to your cart.",
        coupon,
        scope,
      );
    }

    if (coupon.minOrderAmount !== null) {
      const minimumPaisa = toPaisa(coupon.minOrderAmount);
      if (subtotalPaisa < minimumPaisa) {
        return reject(
          "MIN_ORDER_NOT_MET",
          `Add ${formatTaka(minimumPaisa - subtotalPaisa)} more to use this coupon (minimum order ${formatTaka(minimumPaisa)}).`,
          coupon,
          scope,
          eligibleSubtotalPaisa,
        );
      }
    }

    if (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit) {
      return reject(
        "USAGE_LIMIT_REACHED",
        "This coupon has reached its usage limit.",
        coupon,
        scope,
        eligibleSubtotalPaisa,
      );
    }

    const valuePaisa = toPaisa(coupon.value);
    let discountPaisa =
      coupon.type === "PERCENTAGE" ? Math.round((eligibleSubtotalPaisa * valuePaisa) / 10_000) : valuePaisa;
    if (coupon.maxDiscountAmount !== null) {
      discountPaisa = Math.min(discountPaisa, toPaisa(coupon.maxDiscountAmount));
    }
    discountPaisa = Math.max(0, Math.min(discountPaisa, eligibleSubtotalPaisa));

    return { valid: true, coupon, scope, eligibleSubtotalPaisa, discountPaisa };
  }

  /** Number of the customer's non-cancelled orders that used the coupon. */
  async countCustomerRedemptions(discountId: string, userId: string, db: DbExecutor = defaultDb): Promise<number> {
    const [row] = await db
      .select({ value: count() })
      .from(orders)
      .where(and(eq(orders.discountId, discountId), eq(orders.userId, userId), ne(orders.status, "CANCELLED")));
    return Number(row?.value ?? 0);
  }

  /**
   * Read-only preview for POST /orders/validate-coupon. Never consumes the
   * coupon. Per-customer limits are only checked when the caller is known.
   */
  async preview(
    code: string,
    cart: PricedCart,
    userId: string | null,
    db: DbExecutor = defaultDb,
  ): Promise<CouponPreviewDTO> {
    const coupon = await this.findByCode(code, db);
    let evaluation = this.evaluate(coupon, cart.lines, cart.subtotalPaisa);

    if (evaluation.valid && userId !== null && evaluation.coupon.perCustomerLimit !== null) {
      const used = await this.countCustomerRedemptions(evaluation.coupon.id, userId, db);
      if (used >= evaluation.coupon.perCustomerLimit) {
        evaluation = reject(
          "PER_CUSTOMER_LIMIT_REACHED",
          "You have already used this coupon the maximum number of times.",
          evaluation.coupon,
          evaluation.scope,
          evaluation.eligibleSubtotalPaisa,
        );
      }
    }

    const discountPaisa = evaluation.valid ? evaluation.discountPaisa : 0;
    const deliveryFeePaisa = deliveryFeeFor(cart.subtotalPaisa);
    const found = evaluation.coupon;

    return {
      valid: evaluation.valid,
      code: found?.code ?? code.trim(),
      reasonCode: evaluation.valid ? null : evaluation.reasonCode,
      reason: evaluation.valid ? null : evaluation.reason,
      couponType: found?.type ?? null,
      couponValue: found ? moneyToNumberOrNull(found.value) : null,
      scope: evaluation.scope,
      minOrderAmount: moneyToNumberOrNull(found?.minOrderAmount),
      maxDiscountAmount: moneyToNumberOrNull(found?.maxDiscountAmount),
      subtotal: paisaToAmount(cart.subtotalPaisa),
      eligibleSubtotal: paisaToAmount(evaluation.eligibleSubtotalPaisa),
      discountAmount: paisaToAmount(discountPaisa),
      deliveryFee: paisaToAmount(deliveryFeePaisa),
      total: paisaToAmount(cart.subtotalPaisa - discountPaisa + deliveryFeePaisa),
    };
  }

  /**
   * Resolves a coupon for checkout inside the checkout transaction.
   * Throws 422 INVALID_COUPON (with `details.reasonCode`) when it cannot be used.
   */
  async resolveForCheckout(
    code: string,
    cart: PricedCart,
    userId: string,
    tx: DbExecutor,
  ): Promise<AppliedCoupon> {
    const coupon = await this.findByCode(code, tx);
    const evaluation = this.evaluate(coupon, cart.lines, cart.subtotalPaisa);
    if (!evaluation.valid) {
      throw couponError(evaluation.reasonCode, evaluation.reason, code.trim());
    }
    if (evaluation.coupon.perCustomerLimit !== null) {
      const used = await this.countCustomerRedemptions(evaluation.coupon.id, userId, tx);
      if (used >= evaluation.coupon.perCustomerLimit) {
        throw couponError(
          "PER_CUSTOMER_LIMIT_REACHED",
          "You have already used this coupon the maximum number of times.",
          code.trim(),
        );
      }
    }
    return {
      coupon: evaluation.coupon,
      scope: evaluation.scope,
      eligibleSubtotalPaisa: evaluation.eligibleSubtotalPaisa,
      discountPaisa: evaluation.discountPaisa,
    };
  }

  /**
   * Consumes one use of the coupon for an order that has ALREADY been inserted
   * in `tx` with `discount_id` set. Throws INVALID_COUPON (the caller's
   * transaction then rolls back) when the global or per-customer limit is hit.
   */
  async redeem(applied: AppliedCoupon, userId: string, tx: DbExecutor): Promise<void> {
    const code = applied.coupon.code ?? "";
    const updated = await tx
      .update(discounts)
      .set({ usageCount: sql`${discounts.usageCount} + 1` })
      .where(
        and(
          eq(discounts.id, applied.coupon.id),
          or(isNull(discounts.usageLimit), lt(discounts.usageCount, discounts.usageLimit)),
        ),
      )
      .returning({ id: discounts.id });
    if (updated.length === 0) {
      throw couponError("USAGE_LIMIT_REACHED", "This coupon has reached its usage limit.", code);
    }

    const perCustomerLimit = applied.coupon.perCustomerLimit;
    if (perCustomerLimit !== null) {
      // Includes the order inserted by this transaction.
      const used = await this.countCustomerRedemptions(applied.coupon.id, userId, tx);
      if (used > perCustomerLimit) {
        throw couponError(
          "PER_CUSTOMER_LIMIT_REACHED",
          "You have already used this coupon the maximum number of times.",
          code,
        );
      }
    }
  }

  /** Gives back one use of the coupon (order cancelled). Never goes below 0. */
  async releaseRedemption(discountId: string, tx: DbExecutor): Promise<void> {
    await tx
      .update(discounts)
      .set({ usageCount: sql`GREATEST(${discounts.usageCount} - 1, 0)` })
      .where(eq(discounts.id, discountId));
  }
}

export const couponService = new CouponService();
