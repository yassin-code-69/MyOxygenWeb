/**
 * Server-side cart pricing shared by checkout and coupon previews.
 *
 * - All arithmetic is done in integer paisa (1/100 BDT) so totals never drift.
 * - Unit prices are the EFFECTIVE storefront prices: base price minus the best
 *   automatic (flash-sale / catalog) discount, exactly what the storefront shows.
 *   Coupons are applied on top of these prices by coupon.service.ts.
 * - Delivery fee (plan 007): ৳60 when the merchandise subtotal is below ৳1,500,
 *   free at or above ৳1,500. The subtotal is measured at effective prices,
 *   before any coupon discount.
 * - Pricing runs BEFORE the checkout transaction opens, so a checkout never
 *   holds a pooled connection while borrowing a second one for price reads.
 */
import { inArray } from "drizzle-orm";
import { db as defaultDb, type DatabaseClient } from "../db/client";
import { products } from "../db/schema/tables";
import { AppError } from "../lib/errors";
import { flashSaleService, type FlashSaleService } from "./flash-sale.service";
import { fieldValidationError } from "./service-utils";

// ---------------------------------------------------------------------------
// Money helpers
// ---------------------------------------------------------------------------

/** Converts a numeric(10,2) string or number to integer paisa. */
export function toPaisa(value: string | number): number {
  const amount = typeof value === "number" ? value : Number.parseFloat(value);
  if (!Number.isFinite(amount)) {
    throw new RangeError(`Invalid money amount: ${String(value)}`);
  }
  return Math.round(amount * 100);
}

/** Integer paisa → taka as a JSON number with at most two decimals. */
export function paisaToAmount(paisa: number): number {
  return Math.round(paisa) / 100;
}

/** Integer paisa → "1234.50" for numeric(10,2) columns. */
export function paisaToDecimal(paisa: number): string {
  const rounded = Math.round(paisa);
  const sign = rounded < 0 ? "-" : "";
  const abs = Math.abs(rounded);
  return `${sign}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** numeric column value (string) → JSON number. `null`/`undefined` → 0. */
export function moneyToNumber(value: string | number | null | undefined): number {
  return value === null || value === undefined ? 0 : paisaToAmount(toPaisa(value));
}

export function moneyToNumberOrNull(value: string | number | null | undefined): number | null {
  return value === null || value === undefined ? null : paisaToAmount(toPaisa(value));
}

// ---------------------------------------------------------------------------
// Delivery fee
// ---------------------------------------------------------------------------

export const FREE_DELIVERY_THRESHOLD_PAISA = 150_000; // ৳1,500
export const STANDARD_DELIVERY_FEE_PAISA = 6_000; // ৳60

export function deliveryFeeFor(subtotalPaisa: number): number {
  return subtotalPaisa >= FREE_DELIVERY_THRESHOLD_PAISA ? 0 : STANDARD_DELIVERY_FEE_PAISA;
}

// ---------------------------------------------------------------------------
// Cart lines
// ---------------------------------------------------------------------------

export const MAX_LINE_QUANTITY = 1000;

export interface CartLineInput {
  productId: string;
  quantity: number;
}

/**
 * Merges duplicate product lines and sorts them by productId. Processing lines
 * in a stable order gives every checkout the same lock order (no deadlocks).
 */
export function mergeCartLines(items: readonly CartLineInput[]): CartLineInput[] {
  const totals = new Map<string, number>();
  for (const item of items) {
    const productId = item.productId.toLowerCase();
    totals.set(productId, (totals.get(productId) ?? 0) + item.quantity);
  }
  return [...totals.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([productId, quantity]) => ({ productId, quantity }));
}

export interface PricedCartLine {
  productId: string;
  categoryId: string;
  title: string;
  slug: string;
  sku: string;
  image: string | null;
  quantity: number;
  basePricePaisa: number;
  unitPricePaisa: number;
  lineTotalPaisa: number;
  /** Automatic discount that produced the unit price, if any. */
  automaticDiscountId: string | null;
}

export interface PricedCart {
  lines: PricedCartLine[];
  subtotalPaisa: number;
}

/** True for automatic (code-less) discounts; coupons must never change list prices. */
function isAutomaticDiscount<T extends object>(discount: T): boolean {
  if (!("code" in discount)) return true;
  return discount.code === null || discount.code === undefined;
}

export class OrderPricingService {
  constructor(
    private readonly flashSales: FlashSaleService = flashSaleService,
    private readonly db: DatabaseClient = defaultDb,
  ) {}

  /**
   * Prices a cart from server data only. Throws 409 CONFLICT when a product
   * does not exist or is inactive, 422 when a merged line is too large.
   */
  async priceCart(items: readonly CartLineInput[]): Promise<PricedCart> {
    const merged = mergeCartLines(items);
    if (merged.length === 0) {
      throw fieldValidationError({ items: ["Cart must contain at least one item"] });
    }

    if (merged.some((line) => line.quantity > MAX_LINE_QUANTITY)) {
      throw fieldValidationError({
        items: [`A single product cannot exceed ${MAX_LINE_QUANTITY} units per order`],
      });
    }

    const rows = await this.db
      .select({
        id: products.id,
        categoryId: products.categoryId,
        title: products.title,
        slug: products.slug,
        sku: products.sku,
        images: products.images,
        basePrice: products.basePrice,
        isActive: products.isActive,
      })
      .from(products)
      .where(
        inArray(
          products.id,
          merged.map((line) => line.productId),
        ),
      );
    const byId = new Map(rows.map((row) => [row.id, row]));

    const unavailableProductIds = merged
      .filter((line) => {
        const product = byId.get(line.productId);
        return product === undefined || !product.isActive;
      })
      .map((line) => line.productId);
    if (unavailableProductIds.length > 0) {
      throw AppError.conflict("Some items in your cart are no longer available", {
        unavailableProductIds,
      });
    }

    const lines: PricedCartLine[] = [];
    let subtotalPaisa = 0;
    for (const line of merged) {
      const product = byId.get(line.productId);
      if (product === undefined) continue; // unreachable: filtered above

      const discounts = (await this.flashSales.getActiveDiscounts(product.id, product.categoryId)).filter(
        (discount) => isAutomaticDiscount(discount),
      );
      const pricing = this.flashSales.calculateEffectivePrice(
        { id: product.id, categoryId: product.categoryId, basePrice: product.basePrice },
        discounts,
      );

      const basePricePaisa = toPaisa(product.basePrice);
      // An automatic discount can only lower the price, never raise it or go negative.
      const unitPricePaisa = Math.min(basePricePaisa, Math.max(0, toPaisa(pricing.effectivePrice)));
      const lineTotalPaisa = unitPricePaisa * line.quantity;
      subtotalPaisa += lineTotalPaisa;

      lines.push({
        productId: product.id,
        categoryId: product.categoryId,
        title: product.title,
        slug: product.slug,
        sku: product.sku,
        image: product.images[0] ?? null,
        quantity: line.quantity,
        basePricePaisa,
        unitPricePaisa,
        lineTotalPaisa,
        automaticDiscountId: unitPricePaisa < basePricePaisa ? (pricing.discount?.id ?? null) : null,
      });
    }

    return { lines, subtotalPaisa };
  }
}

export const orderPricingService = new OrderPricingService();
