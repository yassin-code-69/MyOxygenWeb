import { sql, inArray } from "drizzle-orm";
import { db as defaultDb } from "../db";
import { discounts, products } from "../db/schema/tables";
import type { DatabaseClient } from "../db/client";

export interface CouponItemInput {
  productId: string;
  quantity: number;
  unitPrice: number;
}

export interface CouponValidationResult {
  isValid: boolean;
  discountAmount: number;
  code: string;
  type?: "PERCENTAGE" | "FIXED_AMOUNT";
  value?: number;
  subtotal?: number;
  finalTotal?: number;
}

export class CouponService {
  /**
   * Validates a coupon code against subtotal and cart items.
   * Checks existence, active flag, start/end date constraints.
   * Computes percentage or fixed amount discounts.
   * Throws if coupon not found, inactive, or expired.
   */
  async validateCoupon(
    code: string,
    subtotal: number,
    items: CouponItemInput[] = [],
    db: DatabaseClient = defaultDb,
  ): Promise<CouponValidationResult> {
    if (!code || !code.trim()) {
      throw new Error("Coupon code is required");
    }

    const cleanCode = code.trim();
    const now = new Date();

    const [coupon] = await db
      .select()
      .from(discounts)
      .where(sql`lower(${discounts.code}) = lower(${cleanCode})`);

    if (!coupon) {
      throw new Error("Coupon not found");
    }

    if (!coupon.isActive) {
      throw new Error("Coupon is inactive");
    }

    if (new Date(coupon.startsAt) > now) {
      throw new Error("Coupon has not started yet");
    }

    if (new Date(coupon.endsAt) < now) {
      throw new Error("Coupon has expired");
    }

    let eligibleAmount = subtotal;

    // Check if coupon is tied to a specific product
    if (coupon.productId) {
      const matchingItems = items.filter(
        (item) => item.productId === coupon.productId,
      );

      if (matchingItems.length === 0) {
        throw new Error("Coupon is not applicable to any item in your cart");
      }

      eligibleAmount = matchingItems.reduce(
        (sum, item) => sum + item.unitPrice * item.quantity,
        0,
      );
    }

    let discountAmount = 0;
    const couponVal = Math.max(0, parseFloat(coupon.value) || 0);

    if (coupon.type === "PERCENTAGE") {
      const percentage = Math.min(100, couponVal);
      discountAmount = (eligibleAmount * percentage) / 100;
    } else {
      discountAmount = Math.min(couponVal, eligibleAmount);
    }

    discountAmount = Math.round(discountAmount * 100) / 100;
    discountAmount = Math.max(0, Math.min(discountAmount, subtotal));

    return {
      isValid: true,
      discountAmount,
      code: coupon.code || cleanCode,
      type: coupon.type,
      value: couponVal,
      subtotal,
      finalTotal: Math.round((subtotal - discountAmount) * 100) / 100,
    };
  }

  /**
   * Helper that resolves product prices from DB and runs validateCoupon.
   */
  async validateCouponForCart(
    code: string,
    items: { productId: string; quantity: number }[],
    db: DatabaseClient = defaultDb,
  ): Promise<CouponValidationResult> {
    if (!items || items.length === 0) {
      return this.validateCoupon(code, 0, [], db);
    }

    const productIds = items.map((i) => i.productId);
    const dbProducts = await db
      .select({
        id: products.id,
        basePrice: products.basePrice,
        isActive: products.isActive,
      })
      .from(products)
      .where(inArray(products.id, productIds));

    const productMap = new Map(dbProducts.map((p) => [p.id, p]));

    const itemsWithPrice: CouponItemInput[] = [];
    let subtotal = 0;

    for (const item of items) {
      const prod = productMap.get(item.productId);
      if (!prod) {
        throw new Error(`Product ${item.productId} not found`);
      }
      const unitPrice = parseFloat(prod.basePrice);
      itemsWithPrice.push({
        productId: item.productId,
        quantity: item.quantity,
        unitPrice,
      });
      subtotal += unitPrice * item.quantity;
    }

    return this.validateCoupon(code, subtotal, itemsWithPrice, db);
  }
}

export const couponService = new CouponService();
