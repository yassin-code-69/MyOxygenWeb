import { db } from "../db";
import { discounts } from "../db/schema/tables";
import { and, eq, lte, gte, or } from "drizzle-orm";

export interface Discount {
  id: string;
  code?: string | null;
  type: "PERCENTAGE" | "FIXED_AMOUNT" | string;
  value: string;
  productId?: string | null;
  categoryId?: string | null;
  startsAt?: Date | string;
  endsAt?: Date | string;
  isFlashSale?: boolean;
  isActive?: boolean;
}

export interface EffectivePricing {
  effectivePrice: number;
  discountAmount: number;
  discountPercent: number;
}

export class FlashSaleService {
  /**
   * Calculates the effective price for a product based on active discounts.
   * Priority resolution:
   * 1. Product-specific discount wins over Category-level discount.
   * 2. If multiple discounts exist at the winning priority level, the one
   *    offering the best saving (lowest price) is selected.
   * 3. Calculates percentage or fixed discount, rounded to 2 decimal places.
   * 4. Never reduces price below 0.
   */
  calculateEffectivePrice(
    product: { id: string; categoryId: string; basePrice: string },
    activeDiscounts: Discount[],
  ): { effectivePrice: string; discount: Discount | null } {
    const basePriceNum = Math.max(0, parseFloat(product.basePrice) || 0);

    if (!activeDiscounts || activeDiscounts.length === 0) {
      return {
        effectivePrice: basePriceNum.toFixed(2),
        discount: null,
      };
    }

    // Filter discounts that are active
    const candidates = activeDiscounts.filter((d) => d.isActive !== false);

    const productSpecific = candidates.filter(
      (d) => d.productId === product.id,
    );
    const categorySpecific = candidates.filter(
      (d) =>
        (!d.productId || d.productId === null) &&
        d.categoryId === product.categoryId,
    );

    // Product-specific discount wins over Category-level discount
    const pool =
      productSpecific.length > 0 ? productSpecific : categorySpecific;

    if (pool.length === 0) {
      return {
        effectivePrice: basePriceNum.toFixed(2),
        discount: null,
      };
    }

    // When multiple discounts exist at the same level, pick the one offering the best savings
    let winningDiscount: Discount = pool[0];
    let bestEffectivePrice = this._calculatePriceForDiscount(
      basePriceNum,
      winningDiscount,
    );

    for (let i = 1; i < pool.length; i++) {
      const candidatePrice = this._calculatePriceForDiscount(
        basePriceNum,
        pool[i],
      );
      if (candidatePrice < bestEffectivePrice) {
        bestEffectivePrice = candidatePrice;
        winningDiscount = pool[i];
      }
    }

    return {
      effectivePrice: bestEffectivePrice.toFixed(2),
      discount: winningDiscount,
    };
  }

  private _calculatePriceForDiscount(
    basePrice: number,
    discount: Discount,
  ): number {
    const val = parseFloat(discount.value) || 0;
    const typeUpper = (discount.type || "").toUpperCase();

    let discountAmount: number;
    if (typeUpper === "PERCENTAGE") {
      const pct = Math.max(0, Math.min(val, 100));
      discountAmount = (basePrice * pct) / 100;
    } else {
      discountAmount = Math.max(0, val);
    }

    return Math.max(0, basePrice - discountAmount);
  }

  /**
   * Fetches all currently active discounts from database.
   */
  async getActiveDiscounts(
    productId?: string,
    categoryId?: string,
  ): Promise<Discount[]> {
    const now = new Date();
    const conditions = [
      eq(discounts.isActive, true),
      lte(discounts.startsAt, now),
      gte(discounts.endsAt, now),
    ];

    if (productId && categoryId) {
      conditions.push(
        or(
          eq(discounts.productId, productId),
          eq(discounts.categoryId, categoryId),
        )!,
      );
    } else if (productId) {
      conditions.push(eq(discounts.productId, productId));
    } else if (categoryId) {
      conditions.push(eq(discounts.categoryId, categoryId));
    }

    const rows = await db
      .select()
      .from(discounts)
      .where(and(...conditions));

    return rows as Discount[];
  }

  /**
   * Resolves the single best active discount for a product from the database.
   */
  async getActiveDiscount(
    productId: string,
    categoryId: string,
    basePrice: string = "1000.00",
  ): Promise<Discount | null> {
    const activeDiscounts = await this.getActiveDiscounts(
      productId,
      categoryId,
    );
    const result = this.calculateEffectivePrice(
      { id: productId, categoryId, basePrice },
      activeDiscounts,
    );
    return result.discount;
  }

  /**
   * Computes detailed effective price breakdown (numbers).
   */
  computeEffectivePrice(
    basePrice: number,
    discount: Discount,
  ): EffectivePricing {
    const val = parseFloat(discount.value) || 0;
    const typeUpper = (discount.type || "").toUpperCase();

    let discountAmount: number;
    if (typeUpper === "PERCENTAGE") {
      const pct = Math.max(0, Math.min(val, 100));
      discountAmount = (basePrice * pct) / 100;
    } else {
      discountAmount = Math.min(val, basePrice);
    }

    const effectivePrice = Math.max(0, basePrice - discountAmount);
    const discountPercent =
      basePrice > 0
        ? parseFloat(((discountAmount / basePrice) * 100).toFixed(2))
        : 0;

    return {
      effectivePrice: parseFloat(effectivePrice.toFixed(2)),
      discountAmount: parseFloat(discountAmount.toFixed(2)),
      discountPercent,
    };
  }

  /**
   * Returns remaining milliseconds for flash sale countdown.
   */
  getFlashSaleCountdown(discount: {
    endsAt?: Date | string | null;
  }): number {
    if (!discount.endsAt) return 0;
    const remaining = new Date(discount.endsAt).getTime() - Date.now();
    return Math.max(0, remaining);
  }
}
