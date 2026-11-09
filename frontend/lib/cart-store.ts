"use client";

/**
 * Persisted shopping cart (localStorage key `my_oxygen_cart`).
 *
 * Public contract used across the storefront:
 *   items, addItem(draft), removeItem(id), updateQuantity(id, qty), clearCart(),
 *   isDrawerOpen, openDrawer/closeDrawer/toggleDrawer, totalCount()
 *
 * Money rules mirror the backend (docs/API_CONTRACT.md):
 * - subtotal = Σ effective unit price × quantity (before any coupon)
 * - delivery fee = ৳60 below a ৳1,500 subtotal, free at or above
 * The coupon is stored as a *code only*. Its discount always comes from a fresh
 * `POST /orders/validate-coupon` preview (see `hooks/checkout/use-coupon-preview.ts`),
 * never from a cached amount.
 */
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { CartItem, CartItemDraft, CartTotals } from "../types/cart";
import type { CartItemInput, CouponPreviewDTO } from "../types/order";

export type { CartItem, CartItemDraft, CartTotals };

/** Subtotal (effective prices, before coupon) at which delivery becomes free. */
export const FREE_DELIVERY_THRESHOLD = 1500;
/** Flat delivery fee below the threshold. */
export const DELIVERY_FEE = 60;
/** Per-line cap — the API's `MAX_LINE_QUANTITY` (stock limits apply on top when known). */
export const MAX_QUANTITY_PER_LINE = 1000;

export const CART_STORAGE_KEY = "my_oxygen_cart";
const CART_STORAGE_VERSION = 2;

// ---------------------------------------------------------------------------
// Pure helpers (exported for the drawer, checkout and tests)
// ---------------------------------------------------------------------------

/** Works in paisa so sums of decimal prices never drift (0.1 + 0.2 problems). */
function toPaisa(amount: number): number {
  return Math.round(amount * 100);
}

function fromPaisa(paisa: number): number {
  return paisa / 100;
}

/** Highest quantity allowed for a line. */
export function maxQuantityFor(item: Pick<CartItem, "maxStock">): number {
  if (typeof item.maxStock === "number" && Number.isFinite(item.maxStock)) {
    return Math.max(0, Math.min(Math.floor(item.maxStock), MAX_QUANTITY_PER_LINE));
  }
  return MAX_QUANTITY_PER_LINE;
}

function clampQuantity(quantity: number, item: Pick<CartItem, "maxStock">): number {
  const whole = Number.isFinite(quantity) ? Math.floor(quantity) : 0;
  return Math.max(0, Math.min(whole, maxQuantityFor(item)));
}

export function cartSubtotal(items: readonly CartItem[]): number {
  return fromPaisa(items.reduce((sum, item) => sum + toPaisa(item.unitPrice) * item.quantity, 0));
}

export function cartItemCount(items: readonly CartItem[]): number {
  return items.reduce((sum, item) => sum + item.quantity, 0);
}

/** Backend rule: ৳60 below ৳1,500, free at or above (no fee for an empty cart). */
export function deliveryFeeFor(subtotal: number, itemCount: number): number {
  if (itemCount <= 0) {
    return 0;
  }
  return subtotal >= FREE_DELIVERY_THRESHOLD ? 0 : DELIVERY_FEE;
}

/** How much more (effective prices) unlocks free delivery. */
export function amountToFreeDelivery(subtotal: number): number {
  return fromPaisa(Math.max(0, toPaisa(FREE_DELIVERY_THRESHOLD) - toPaisa(subtotal)));
}

/**
 * Totals for display. With a fresh, valid coupon preview the server's numbers
 * are used verbatim; otherwise the cart is priced locally without a discount.
 */
export function computeCartTotals(items: readonly CartItem[], preview?: CouponPreviewDTO | null): CartTotals {
  const itemCount = cartItemCount(items);
  if (preview && preview.valid) {
    return {
      itemCount,
      subtotal: preview.subtotal,
      discountAmount: preview.discountAmount,
      deliveryFee: preview.deliveryFee,
      total: preview.total,
    };
  }
  const subtotal = cartSubtotal(items);
  const deliveryFee = deliveryFeeFor(subtotal, itemCount);
  return {
    itemCount,
    subtotal,
    discountAmount: 0,
    deliveryFee,
    total: fromPaisa(toPaisa(subtotal) + toPaisa(deliveryFee)),
  };
}

/** `[{ productId, quantity }]` for checkout / coupon requests. */
export function toCartItemInputs(items: readonly CartItem[]): CartItemInput[] {
  return items.map((item) => ({ productId: item.id, quantity: item.quantity }));
}

// ---------------------------------------------------------------------------
// Persistence: validation + migration of older stored shapes
// ---------------------------------------------------------------------------

interface PersistedCart {
  items: CartItem[];
  couponCode: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Rebuilds a cart line from untrusted storage, or `null` when it is unusable. */
function sanitizeItem(value: unknown): CartItem | null {
  if (!isRecord(value)) {
    return null;
  }
  const { id, title, slug, image, unitPrice, quantity } = value;
  if (typeof id !== "string" || id === "" || typeof title !== "string") {
    return null;
  }
  if (typeof unitPrice !== "number" || !Number.isFinite(unitPrice) || unitPrice < 0) {
    return null;
  }
  const maxStock = optionalNumber(value.maxStock);
  const item: CartItem = {
    id,
    title,
    slug: typeof slug === "string" ? slug : "",
    image: typeof image === "string" ? image : "",
    unitPrice,
    quantity: 1,
    originalPrice: optionalNumber(value.originalPrice),
    requiresBatchTracking: typeof value.requiresBatchTracking === "boolean" ? value.requiresBatchTracking : undefined,
    earliestExpiry: typeof value.earliestExpiry === "string" ? value.earliestExpiry : null,
    maxStock,
  };
  const clamped = clampQuantity(typeof quantity === "number" ? quantity : 1, item);
  return clamped > 0 ? { ...item, quantity: clamped } : null;
}

function sanitizeItems(value: unknown): CartItem[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  const items: CartItem[] = [];
  for (const raw of value) {
    const item = sanitizeItem(raw);
    if (item && !seen.has(item.id)) {
      seen.add(item.id);
      items.push(item);
    }
  }
  return items;
}

function sanitizeCouponCode(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const code = value.trim().toUpperCase();
  return code.length > 0 && code.length <= 64 ? code : null;
}

/**
 * v0 (pre-remediation): `{ items, appliedCoupon: { code, discountAmount, … } | null }`
 * v2: `{ items, couponCode }` — the cached discount amount is intentionally dropped.
 */
function migrateCart(persisted: unknown): PersistedCart {
  if (!isRecord(persisted)) {
    return { items: [], couponCode: null };
  }
  const legacyCoupon = isRecord(persisted.appliedCoupon) ? persisted.appliedCoupon.code : undefined;
  return {
    items: sanitizeItems(persisted.items),
    couponCode: sanitizeCouponCode(persisted.couponCode ?? legacyCoupon),
  };
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export interface CartState {
  items: CartItem[];
  /** Coupon the customer applied (validated again whenever the cart changes). */
  couponCode: string | null;
  isDrawerOpen: boolean;
  /** True once the persisted cart has been read on the client. */
  hasHydrated: boolean;

  /** Adds a product (quantity defaults to 1, clamped to `maxStock`) and opens the drawer. */
  addItem: (draft: CartItemDraft) => void;
  removeItem: (productId: string) => void;
  /** Removes several products at once (e.g. ones the API reports as unavailable). */
  removeItems: (productIds: readonly string[]) => void;
  /** Sets a line's quantity (clamped to its stock); 0 or less removes the line. */
  updateQuantity: (productId: string, quantity: number) => void;
  /** Records the stock the API reported for a line and clamps its quantity to it. */
  setAvailableStock: (productId: string, available: number) => void;
  /**
   * Refreshes a line with live catalog data (price, stock, expiry…) and clamps
   * its quantity to the new stock; a line with no stock left is removed.
   */
  syncItem: (productId: string, patch: Partial<Omit<CartItem, "id" | "quantity">>) => void;
  clearCart: () => void;
  setCouponCode: (code: string | null) => void;

  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
  /** Internal: flips `hasHydrated` once storage has been read. */
  markHydrated: () => void;

  /** Number of units in the cart. */
  totalCount: () => number;
  /** Σ effective price × quantity (before coupon). */
  subtotal: () => number;
  /** Delivery fee for the current subtotal (backend rule). */
  deliveryFee: () => number;
  amountNeededForFreeDelivery: () => number;
  /** Locally priced totals (no coupon). Use the coupon preview hook for discounted totals. */
  totals: () => CartTotals;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      couponCode: null,
      isDrawerOpen: false,
      hasHydrated: false,

      addItem: (draft) => {
        const requested = typeof draft.quantity === "number" && draft.quantity > 0 ? Math.floor(draft.quantity) : 1;
        set((state) => {
          const existing = state.items.find((item) => item.id === draft.id);
          if (existing) {
            const merged: CartItem = {
              ...existing,
              ...draft,
              // Keep stock information if the caller did not send any.
              maxStock: draft.maxStock ?? existing.maxStock,
              quantity: existing.quantity,
            };
            const quantity = clampQuantity(existing.quantity + requested, merged);
            return {
              items: state.items.map((item) => (item.id === draft.id ? { ...merged, quantity: Math.max(quantity, 1) } : item)),
              isDrawerOpen: true,
            };
          }
          const { quantity: _ignored, ...rest } = draft;
          const item: CartItem = { ...rest, quantity: 1 };
          const quantity = clampQuantity(requested, item);
          if (quantity <= 0) {
            // Out of stock: nothing to add.
            return state;
          }
          return { items: [...state.items, { ...item, quantity }], isDrawerOpen: true };
        });
      },

      removeItem: (productId) => {
        set((state) => ({ items: state.items.filter((item) => item.id !== productId) }));
      },

      removeItems: (productIds) => {
        const ids = new Set(productIds);
        set((state) => ({ items: state.items.filter((item) => !ids.has(item.id)) }));
      },

      updateQuantity: (productId, quantity) => {
        set((state) => ({
          items: state.items.flatMap((item) => {
            if (item.id !== productId) {
              return [item];
            }
            const next = clampQuantity(quantity, item);
            return next > 0 ? [{ ...item, quantity: next }] : [];
          }),
        }));
      },

      setAvailableStock: (productId, available) => {
        set((state) => ({
          items: state.items.map((item) => {
            if (item.id !== productId) {
              return item;
            }
            const maxStock = Math.max(0, Math.floor(available));
            return { ...item, maxStock, quantity: Math.max(1, Math.min(item.quantity, maxStock)) };
          }),
        }));
      },

      syncItem: (productId, patch) => {
        set((state) => ({
          items: state.items.flatMap((item) => {
            if (item.id !== productId) {
              return [item];
            }
            const merged: CartItem = { ...item, ...patch, id: item.id, quantity: item.quantity };
            const quantity = clampQuantity(item.quantity, merged);
            return quantity > 0 ? [{ ...merged, quantity }] : [];
          }),
        }));
      },

      clearCart: () => {
        set({ items: [], couponCode: null });
      },

      setCouponCode: (code) => {
        set({ couponCode: sanitizeCouponCode(code) });
      },

      openDrawer: () => set({ isDrawerOpen: true }),
      closeDrawer: () => set({ isDrawerOpen: false }),
      toggleDrawer: () => set((state) => ({ isDrawerOpen: !state.isDrawerOpen })),
      markHydrated: () => set({ hasHydrated: true }),

      totalCount: () => cartItemCount(get().items),
      subtotal: () => cartSubtotal(get().items),
      deliveryFee: () => {
        const { items } = get();
        return deliveryFeeFor(cartSubtotal(items), cartItemCount(items));
      },
      amountNeededForFreeDelivery: () => amountToFreeDelivery(cartSubtotal(get().items)),
      totals: () => computeCartTotals(get().items),
    }),
    {
      name: CART_STORAGE_KEY,
      version: CART_STORAGE_VERSION,
      storage: createJSONStorage(() => localStorage),
      partialize: (state): PersistedCart => ({ items: state.items, couponCode: state.couponCode }),
      migrate: (persisted) => migrateCart(persisted),
      // Re-validate the current version too: storage is user-editable.
      merge: (persisted, current) => ({ ...current, ...migrateCart(persisted) }),
      // localStorage is read synchronously *inside* create(), before `useCartStore` is
      // assigned, so the flag is set through the initial state's own action (calling
      // `useCartStore.setState` here would hit the temporal dead zone and be swallowed).
      // Runs on success and on a storage error alike.
      onRehydrateStorage: (initialState) => () => {
        initialState.markHydrated();
      },
    }
  )
);
