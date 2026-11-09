/**
 * Cart types — the shared contract of the persisted Zustand store in
 * `lib/cart-store.ts` (which re-exports them). Product cards build a
 * `CartItemDraft` and call `useCartStore().addItem(draft)`.
 */
import type { DiscountType } from "./catalog";

export interface CartItem {
  /** Product id (UUID). */
  id: string;
  title: string;
  slug: string;
  image: string;
  unitPrice: number;
  originalPrice?: number;
  quantity: number;
  requiresBatchTracking?: boolean;
  earliestExpiry?: string | null;
  /** Upper bound for the quantity stepper (available stock). */
  maxStock?: number;
}

/** Input for `addItem` — quantity defaults to 1. */
export type CartItemDraft = Omit<CartItem, "quantity"> & { quantity?: number };

export interface AppliedCoupon {
  code: string;
  discountAmount: number;
  type?: DiscountType;
  value?: number;
}

export interface CartTotals {
  itemCount: number;
  subtotal: number;
  discountAmount: number;
  deliveryFee: number;
  total: number;
}
