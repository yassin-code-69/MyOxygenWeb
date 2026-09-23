import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export interface CartItem {
  id: string; // product id (UUID)
  title: string;
  slug: string;
  image: string;
  unitPrice: number;
  originalPrice?: number;
  quantity: number;
  requiresBatchTracking?: boolean;
  earliestExpiry?: string | null;
  maxStock?: number;
}

export interface AppliedCoupon {
  code: string;
  discountAmount: number;
  type?: "PERCENTAGE" | "FIXED_AMOUNT";
  value?: number;
}

interface CartState {
  items: CartItem[];
  isDrawerOpen: boolean;
  appliedCoupon: AppliedCoupon | null;

  // Actions
  addItem: (product: Omit<CartItem, "quantity"> & { quantity?: number }) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  setAppliedCoupon: (coupon: AppliedCoupon | null) => void;
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;

  // Computed helper methods
  totalCount: () => number;
  subtotal: () => number;
  shippingFee: () => number;
  amountNeededForFreeDelivery: () => number;
  finalTotal: () => number;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      isDrawerOpen: false,
      appliedCoupon: null,

      addItem: (product) => {
        const qtyToAdd = product.quantity && product.quantity > 0 ? product.quantity : 1;
        set((state) => {
          const existingIndex = state.items.findIndex((i) => i.id === product.id);
          if (existingIndex > -1) {
            const updated = [...state.items];
            const current = updated[existingIndex];
            const max = current.maxStock ?? 99;
            const newQty = Math.min(current.quantity + qtyToAdd, max);
            updated[existingIndex] = { ...current, quantity: newQty };
            return { items: updated, isDrawerOpen: true };
          }
          return {
            items: [
              ...state.items,
              {
                ...product,
                quantity: qtyToAdd,
              },
            ],
            isDrawerOpen: true,
          };
        });
      },

      removeItem: (productId) => {
        set((state) => ({
          items: state.items.filter((i) => i.id !== productId),
        }));
      },

      updateQuantity: (productId, quantity) => {
        if (quantity <= 0) {
          get().removeItem(productId);
          return;
        }
        set((state) => ({
          items: state.items.map((item) => {
            if (item.id === productId) {
              const max = item.maxStock ?? 99;
              return { ...item, quantity: Math.min(quantity, max) };
            }
            return item;
          }),
        }));
      },

      clearCart: () => {
        set({ items: [], appliedCoupon: null });
      },

      setAppliedCoupon: (appliedCoupon) => {
        set({ appliedCoupon });
      },

      openDrawer: () => set({ isDrawerOpen: true }),
      closeDrawer: () => set({ isDrawerOpen: false }),
      toggleDrawer: () => set((state) => ({ isDrawerOpen: !state.isDrawerOpen })),

      totalCount: () => {
        return get().items.reduce((sum, item) => sum + item.quantity, 0);
      },

      subtotal: () => {
        return get().items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
      },

      shippingFee: () => {
        const currentSubtotal = get().subtotal();
        if (get().items.length === 0) return 0;
        return currentSubtotal >= 1500 ? 0 : 60;
      },

      amountNeededForFreeDelivery: () => {
        const currentSubtotal = get().subtotal();
        return Math.max(0, 1500 - currentSubtotal);
      },

      finalTotal: () => {
        const sub = get().subtotal();
        const ship = get().shippingFee();
        const discount = get().appliedCoupon?.discountAmount ?? 0;
        return Math.max(0, sub + ship - discount);
      },
    }),
    {
      name: "my_oxygen_cart",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        items: state.items,
        appliedCoupon: state.appliedCoupon,
      }),
    }
  )
);
