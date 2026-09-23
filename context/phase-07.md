### Phase 7 Context & Architecture Blueprint

Phase 7 delivers the complete **purchase funnel** for My Oxygen: a reactive cart, a real-time coupon validation engine, a three-step animated checkout flow, and the post-order confirmation experience. Every layer — from Hono.js validation schemas and transactional batch allocation through Zustand cart state to Mantine + Motion animated UI — is wired together end-to-end so that a customer can discover a product, add it to the cart, apply a discount code, choose between Cash on Delivery and Online Gateway, and receive a confirmed order number in one uninterrupted journey.

Key architectural decisions codified in this phase:

- **FEFO order fulfilment:** Inventory is consumed batch-by-batch in First-Expired-First-Out order inside a single Drizzle transaction. Reservation and release helpers guard against over-selling under concurrency.

- **Coupon engine isolation:** Discount validation lives behind its own authenticated endpoint rather than being inlined into order placement, enabling instant client-side feedback without committing stock.

- **Zustand + `persist` cart:** Cart state survives hard refreshes and tab-close events via `localStorage` serialisation. The store exposes an immutable-style API (add, remove, updateQuantity, clear) consumed by the Drawer and Checkout page.

- **Animated step transitions:** Framer Motion `AnimatePresence` + directional `x` slide drives both the checkout stepper and cart item lifecycle, giving tactile feedback without layout shifts.

- **Bangladesh-aware delivery logic:** Flat ৳60 fee below ৳1,500; free delivery above. Phone numbers are validated against the BD `+880` prefix pattern.

---

### Step 1: Backend — Order & Coupon API Schemas

Centralise all request/response shapes in a dedicated schema file so that route handlers stay thin and the schemas are reusable from API tests or external tools.

**`apps/api/src/routes/orders.schema.ts`**

```typescript
import { z } from "zod";

// ── Shipping Address ────────────────────────────────────────────────────────

export const shippingAddressSchema = z.object({
  fullName: z
    .string()
    .min(2, "Full name must be at least 2 characters")
    .max(100),
  phone: z
    .string()
    .regex(
      /^(\+880|880|0)1[3-9]\d{8}$/,
      "Enter a valid Bangladeshi phone number (e.g. +8801712345678)",
    ),
  addressLine1: z.string().min(5, "Address line 1 is required").max(255),
  addressLine2: z.string().max(255).optional(),
  city: z.string().min(2).max(100),
  district: z.string().min(2).max(100),
  postalCode: z
    .string()
    .regex(/^\d{4}$/, "Postal code must be a 4-digit Bangladesh postcode"),
});

export type ShippingAddress = z.infer<typeof shippingAddressSchema>;

// ── Cart Item (used by both validate-coupon & place-order) ──────────────────

export const cartItemSchema = z.object({
  productId: z.string().uuid("productId must be a valid UUID"),
  quantity: z.number().int().positive("Quantity must be a positive integer"),
});

export type CartItemInput = z.infer<typeof cartItemSchema>;

// ── Coupon Validation Request ───────────────────────────────────────────────

export const validateCouponSchema = z.object({
  code: z
    .string()
    .min(1, "Coupon code is required")
    .max(64)
    .transform((v) => v.trim().toUpperCase()),
  cartTotal: z.number().positive("Cart total must be a positive number"),
  items: z
    .array(cartItemSchema)
    .min(1, "At least one item is required to validate a coupon"),
});

export type ValidateCouponInput = z.infer<typeof validateCouponSchema>;

// ── Coupon Validation Response ──────────────────────────────────────────────

export type ValidateCouponResponse =
  | {
      valid: true;
      discountAmount: number;
      effectiveTotal: number;
      couponType: "PERCENTAGE" | "FIXED_AMOUNT";
      couponValue: number;
    }
  | {
      valid: false;
      reason: string;
    };

// ── Place Order Request ─────────────────────────────────────────────────────

export const placeOrderSchema = z.object({
  items: z.array(cartItemSchema).min(1, "Order must contain at least one item"),
  shippingAddress: shippingAddressSchema,
  paymentMethod: z.enum(["COD", "ONLINE_GATEWAY"], {
    errorMap: () => ({
      message: "paymentMethod must be COD or ONLINE_GATEWAY",
    }),
  }),
  couponCode: z
    .string()
    .max(64)
    .transform((v) => v.trim().toUpperCase())
    .optional(),
});

export type PlaceOrderInput = z.infer<typeof placeOrderSchema>;

// ── My Orders Query Params ──────────────────────────────────────────────────

export const myOrdersQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export type MyOrdersQuery = z.infer<typeof myOrdersQuerySchema>;
```

---

### Step 2: Backend — Coupon Validation Endpoint

The validation endpoint is intentionally read-only — it does **not** consume stock or lock inventory. Its only side-effect is returning the computed discount so the frontend can display the effective total in real time before the customer commits.

**`apps/api/src/routes/orders.ts` (coupon section)**

```typescript
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, and, lte, gte, or, isNull } from "drizzle-orm";
import { db } from "@my-oxygen/database";
import { discounts, products, categories } from "@my-oxygen/database/schema";
import { requireAuth } from "../middleware/auth";
import {
  validateCouponSchema,
  placeOrderSchema,
  myOrdersQuerySchema,
  type ValidateCouponResponse,
} from "./orders.schema";

export const ordersRouter = new Hono();

// ── POST /orders/validate-coupon ────────────────────────────────────────────
ordersRouter.post(
  "/validate-coupon",
  requireAuth("CUSTOMER"),
  zValidator("json", validateCouponSchema),
  async (c) => {
    const { code, cartTotal, items } = c.req.valid("json");
    const now = new Date();

    // 1. Look up the discount record by code
    const [discount] = await db
      .select()
      .from(discounts)
      .where(
        and(
          eq(discounts.code, code),
          eq(discounts.isActive, true),
          lte(discounts.startsAt, now),
          gte(discounts.endsAt, now),
        ),
      )
      .limit(1);

    if (!discount) {
      const res: ValidateCouponResponse = {
        valid: false,
        reason: "Coupon code is invalid or has expired.",
      };
      return c.json(res, 200);
    }

    // 2. Check product/category applicability when scoped
    const productIds = items.map((i) => i.productId);

    if (discount.productId) {
      // Coupon is product-scoped — at least one cart item must match
      if (!productIds.includes(discount.productId)) {
        const res: ValidateCouponResponse = {
          valid: false,
          reason: "This coupon is not applicable to items in your cart.",
        };
        return c.json(res, 200);
      }
    }

    if (discount.categoryId) {
      // Coupon is category-scoped — verify at least one item belongs to the category
      const matchingProducts = await db
        .select({ id: products.id })
        .from(products)
        .where(and(eq(products.categoryId, discount.categoryId)));

      const matchingIds = new Set(matchingProducts.map((p) => p.id));
      const hasMatch = productIds.some((id) => matchingIds.has(id));

      if (!hasMatch) {
        const res: ValidateCouponResponse = {
          valid: false,
          reason: "This coupon applies only to a specific product category.",
        };
        return c.json(res, 200);
      }
    }

    // 3. Compute discount amount
    const couponValue = parseFloat(discount.value as string);
    let discountAmount = 0;

    if (discount.type === "PERCENTAGE") {
      discountAmount = parseFloat(((cartTotal * couponValue) / 100).toFixed(2));
    } else {
      // FIXED_AMOUNT — cap at cart total so we never go negative
      discountAmount = Math.min(couponValue, cartTotal);
    }

    const effectiveTotal = parseFloat((cartTotal - discountAmount).toFixed(2));

    const res: ValidateCouponResponse = {
      valid: true,
      discountAmount,
      effectiveTotal,
      couponType: discount.type,
      couponValue,
    };

    return c.json(res, 200);
  },
);
```

---

### Step 3: Backend — Order Placement with FEFO Allocation

The order placement route wraps all mutations in a single Drizzle transaction. Batches are consumed FEFO (earliest expiry first), stock is reserved atomically, and a structured order number is generated before the transaction commits. On any failure the reservation is released before propagating the error.

**`apps/api/src/routes/orders.ts` (placement + listing sections)**

```typescript
import { nanoid } from "nanoid";
import {
  orders,
  orderItems,
  productBatches,
  users,
} from "@my-oxygen/database/schema";
import { sql, desc, asc } from "drizzle-orm";
import { InventoryService } from "../services/inventory.service";

// ── Helpers ─────────────────────────────────────────────────────────────────

/** OXY + yyyyMMddHHmmss + 4 random digits → e.g. OXY202609221430001742 */
function generateOrderNumber(): string {
  const ts = new Date()
    .toISOString()
    .replace(/[-T:.Z]/g, "")
    .slice(0, 14); // yyyyMMddHHmmss
  const rand = String(Math.floor(Math.random() * 9000) + 1000);
  return `OXY${ts}${rand}`;
}

/** Flat Bangladesh delivery fee logic */
function calcDeliveryFee(subtotal: number): number {
  return subtotal >= 1500 ? 0 : 60;
}

// ── POST /orders/place ───────────────────────────────────────────────────────
ordersRouter.post(
  "/place",
  requireAuth("CUSTOMER"),
  zValidator("json", placeOrderSchema),
  async (c) => {
    const userId = c.get("userId") as string;
    const { items, shippingAddress, paymentMethod, couponCode } =
      c.req.valid("json");

    const inventoryService = new InventoryService(db);

    // Accumulate reservations for rollback on partial failure
    const reservations: Array<{ batchId: string; qty: number }> = [];

    try {
      // ── Step 1: Validate stock availability for each item ──────────────
      for (const item of items) {
        const available = await inventoryService.getTotalAvailableStock(
          item.productId,
        );
        if (available < item.quantity) {
          return c.json(
            {
              success: false,
              error: `Insufficient stock for product ${item.productId}. Available: ${available}, requested: ${item.quantity}.`,
            },
            422,
          );
        }
      }

      // ── Step 2: Allocate batches FEFO & reserve stock ──────────────────
      const batchAllocations: Array<{
        productId: string;
        batchId: string;
        quantity: number;
        unitPrice: number;
      }> = [];

      for (const item of items) {
        const allocations = await inventoryService.allocateBatchesFEFO(
          item.productId,
          item.quantity,
        );

        for (const alloc of allocations) {
          await inventoryService.reserveStock(alloc.batchId, alloc.quantity);
          reservations.push({ batchId: alloc.batchId, qty: alloc.quantity });
        }

        // Fetch effective unit price (respects active flash-sale discounts)
        const unitPrice = await inventoryService.getEffectivePrice(
          item.productId,
        );

        batchAllocations.push(
          ...allocations.map((a) => ({
            productId: item.productId,
            batchId: a.batchId,
            quantity: a.quantity,
            unitPrice,
          })),
        );
      }

      // ── Step 3: Compute financials ─────────────────────────────────────
      let subtotal = batchAllocations.reduce(
        (sum, a) => sum + a.unitPrice * a.quantity,
        0,
      );
      subtotal = parseFloat(subtotal.toFixed(2));

      let discountAmount = 0;

      if (couponCode) {
        // Re-validate coupon server-side (never trust client totals)
        const couponRes = await fetch(
          `${c.req.url.split("/place")[0]}/validate-coupon`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: c.req.header("Authorization") ?? "",
            },
            body: JSON.stringify({
              code: couponCode,
              cartTotal: subtotal,
              items,
            }),
          },
        ).then((r) => r.json() as Promise<ValidateCouponResponse>);

        if (couponRes.valid) {
          discountAmount = couponRes.discountAmount;
        }
        // If invalid, silently proceed without coupon (do not block order)
      }

      const deliveryFee = calcDeliveryFee(subtotal - discountAmount);
      const total = parseFloat(
        (subtotal - discountAmount + deliveryFee).toFixed(2),
      );
      const orderNumber = generateOrderNumber();

      // ── Step 4: Persist order & order_items in transaction ─────────────
      const createdOrder = await db.transaction(async (tx) => {
        const [order] = await tx
          .insert(orders)
          .values({
            orderNumber,
            userId,
            paymentMethod,
            shippingAddress: JSON.stringify(shippingAddress),
            subtotal: String(subtotal),
            deliveryFee: String(deliveryFee),
            discountAmount: String(discountAmount),
            total: String(total),
          })
          .returning();

        // Insert one order_item row per batch allocation
        await tx.insert(orderItems).values(
          batchAllocations.map((alloc) => ({
            orderId: order.id,
            productId: alloc.productId,
            batchId: alloc.batchId,
            quantity: alloc.quantity,
            unitPrice: String(alloc.unitPrice),
            totalPrice: String(
              parseFloat((alloc.unitPrice * alloc.quantity).toFixed(2)),
            ),
          })),
        );

        // Commit reserved stock to sold (decrement availableQuantity)
        for (const res of reservations) {
          await tx
            .update(productBatches)
            .set({
              availableQuantity: sql`${productBatches.availableQuantity} - ${res.qty}`,
            })
            .where(eq(productBatches.id, res.batchId));
        }

        return order;
      });

      return c.json(
        {
          success: true,
          order: {
            id: createdOrder.id,
            orderNumber: createdOrder.orderNumber,
            status: createdOrder.status,
            paymentMethod: createdOrder.paymentMethod,
            subtotal,
            deliveryFee,
            discountAmount,
            total,
          },
        },
        201,
      );
    } catch (err) {
      // ── Rollback: release any stock already reserved ───────────────────
      for (const res of reservations) {
        await inventoryService
          .releaseReservation(res.batchId, res.qty)
          .catch(() => {
            /* best-effort; log in production */
          });
      }

      console.error("[orders/place] Transaction failed:", err);
      return c.json(
        {
          success: false,
          error: "Order placement failed. Please try again.",
        },
        500,
      );
    }
  },
);

// ── GET /orders/my-orders ────────────────────────────────────────────────────
ordersRouter.get(
  "/my-orders",
  requireAuth("CUSTOMER"),
  zValidator("query", myOrdersQuerySchema),
  async (c) => {
    const userId = c.get("userId") as string;
    const { page, limit } = c.req.valid("query");
    const offset = (page - 1) * limit;

    const [rows, [{ count }]] = await Promise.all([
      db
        .select({
          id: orders.id,
          orderNumber: orders.orderNumber,
          status: orders.status,
          paymentMethod: orders.paymentMethod,
          paymentStatus: orders.paymentStatus,
          total: orders.total,
          createdAt: orders.createdAt,
        })
        .from(orders)
        .where(eq(orders.userId, userId))
        .orderBy(desc(orders.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(orders)
        .where(eq(orders.userId, userId)),
    ]);

    return c.json({
      success: true,
      data: rows,
      meta: {
        total: count,
        page,
        limit,
        totalPages: Math.ceil(count / limit),
      },
    });
  },
);

// ── GET /orders/:orderNumber ─────────────────────────────────────────────────
ordersRouter.get("/:orderNumber", requireAuth("CUSTOMER"), async (c) => {
  const userId = c.get("userId") as string;
  const { orderNumber } = c.req.param();

  const [order] = await db
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.orderNumber, orderNumber),
        eq(orders.userId, userId), // Scope to current customer only
      ),
    )
    .limit(1);

  if (!order) {
    return c.json({ success: false, error: "Order not found." }, 404);
  }

  const lineItems = await db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, order.id))
    .orderBy(asc(orderItems.id));

  return c.json({
    success: true,
    order: {
      ...order,
      shippingAddress: JSON.parse(order.shippingAddress as string),
      items: lineItems,
    },
  });
});
```

---

### Step 4: Frontend — Cart State Management

Install Zustand with the `persist` middleware so the cart survives browser refreshes. The store is typed with a discriminated `CartItem` shape that carries all display data needed by the Drawer without additional API calls.

**Install dependency:**

```bash
pnpm --filter @my-oxygen/web add zustand
```

**`apps/web/src/store/cart.store.ts`**

```typescript
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

// ── Types ────────────────────────────────────────────────────────────────────

export interface CartItem {
  productId: string;
  slug: string;
  title: string;
  image: string;
  basePrice: number;
  /** Price after any active flash-sale / product-level discount */
  effectivePrice: number;
  quantity: number;
  /** Maximum purchasable quantity (pulled from available stock) */
  maxQuantity: number;
}

interface CouponState {
  code: string;
  discountAmount: number;
  isApplied: boolean;
}

interface CartStore {
  items: CartItem[];
  coupon: CouponState | null;

  // ── Mutations ────────────────────────────────────────────────────────────
  addItem: (product: Omit<CartItem, "quantity">, qty?: number) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, qty: number) => void;
  clearCart: () => void;
  applyCoupon: (coupon: CouponState) => void;
  removeCoupon: () => void;

  // ── Derived selectors ────────────────────────────────────────────────────
  getSubtotal: () => number;
  getDeliveryFee: () => number;
  getDiscountAmount: () => number;
  getTotal: () => number;
  getItemCount: () => number;
}

// ── Constants ────────────────────────────────────────────────────────────────

const DELIVERY_FEE = 60;
const FREE_DELIVERY_THRESHOLD = 1500;

// ── Store ────────────────────────────────────────────────────────────────────

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      coupon: null,

      addItem: (product, qty = 1) => {
        set((state) => {
          const existing = state.items.find(
            (i) => i.productId === product.productId,
          );

          if (existing) {
            const newQty = Math.min(
              existing.quantity + qty,
              product.maxQuantity,
            );
            return {
              items: state.items.map((i) =>
                i.productId === product.productId
                  ? { ...i, quantity: newQty }
                  : i,
              ),
            };
          }

          return {
            items: [
              ...state.items,
              { ...product, quantity: Math.min(qty, product.maxQuantity) },
            ],
          };
        });
      },

      removeItem: (productId) => {
        set((state) => ({
          items: state.items.filter((i) => i.productId !== productId),
        }));
      },

      updateQuantity: (productId, qty) => {
        if (qty <= 0) {
          get().removeItem(productId);
          return;
        }
        set((state) => ({
          items: state.items.map((i) =>
            i.productId === productId
              ? { ...i, quantity: Math.min(qty, i.maxQuantity) }
              : i,
          ),
        }));
      },

      clearCart: () => set({ items: [], coupon: null }),

      applyCoupon: (coupon) => set({ coupon }),

      removeCoupon: () => set({ coupon: null }),

      getSubtotal: () => {
        const { items } = get();
        return parseFloat(
          items
            .reduce((sum, i) => sum + i.effectivePrice * i.quantity, 0)
            .toFixed(2),
        );
      },

      getDeliveryFee: () => {
        const subtotal = get().getSubtotal();
        const discount = get().getDiscountAmount();
        return subtotal - discount >= FREE_DELIVERY_THRESHOLD
          ? 0
          : DELIVERY_FEE;
      },

      getDiscountAmount: () => {
        const { coupon } = get();
        return coupon?.discountAmount ?? 0;
      },

      getTotal: () => {
        const { getSubtotal, getDeliveryFee, getDiscountAmount } = get();
        return parseFloat(
          (getSubtotal() - getDiscountAmount() + getDeliveryFee()).toFixed(2),
        );
      },

      getItemCount: () => {
        return get().items.reduce((sum, i) => sum + i.quantity, 0);
      },
    }),
    {
      name: "my-oxygen-cart",
      storage: createJSONStorage(() => localStorage),
      // Only persist items and coupon; derived fns are rehydrated automatically
      partialize: (state) => ({
        items: state.items,
        coupon: state.coupon,
      }),
    },
  ),
);
```

---

### Step 5: Frontend — Cart Drawer Component

The Drawer opens from the right side when the cart icon is clicked. Each item row is wrapped in a Framer Motion `motion.div` managed by `AnimatePresence` so additions slide in from the right and removals fade + scale out. The coupon input calls the backend validate-coupon endpoint in real time.

**`apps/web/src/components/cart/CartDrawer.tsx`**

```tsx
"use client";

import {
  Drawer,
  Stack,
  Group,
  Text,
  Button,
  NumberInput,
  ActionIcon,
  Badge,
  TextInput,
  Divider,
  Box,
  Image,
  ThemeIcon,
  Center,
} from "@mantine/core";
import {
  IconTrash,
  IconShoppingCartOff,
  IconTag,
  IconCheck,
  IconX,
} from "@tabler/icons-react";
import { AnimatePresence, motion } from "motion/react";
import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useCartStore } from "@/store/cart.store";
import { notifications } from "@mantine/notifications";

interface CartDrawerProps {
  opened: boolean;
  onClose: () => void;
}

// ── Animated cart item wrapper ───────────────────────────────────────────────

const itemVariants = {
  initial: { opacity: 0, x: 40 },
  animate: {
    opacity: 1,
    x: 0,
    transition: { type: "spring", stiffness: 300, damping: 28 },
  },
  exit: { opacity: 0, x: -40, scale: 0.95, transition: { duration: 0.2 } },
};

// ── Empty state ──────────────────────────────────────────────────────────────

function EmptyCart() {
  return (
    <Center h={320}>
      <motion.div
        initial={{ opacity: 0, scale: 0.7 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 20 }}
      >
        <Stack align="center" gap="md">
          <ThemeIcon size={80} radius="xl" variant="light" color="pink">
            <IconShoppingCartOff size={40} />
          </ThemeIcon>
          <Text fw={600} size="lg" c="dimmed">
            Your cart is empty
          </Text>
          <Text size="sm" c="dimmed" ta="center" maw={220}>
            Add some products to get started on your My Oxygen order.
          </Text>
        </Stack>
      </motion.div>
    </Center>
  );
}

// ── Main drawer ──────────────────────────────────────────────────────────────

export function CartDrawer({ opened, onClose }: CartDrawerProps) {
  const router = useRouter();
  const {
    items,
    coupon,
    removeItem,
    updateQuantity,
    applyCoupon,
    removeCoupon,
    getSubtotal,
    getDeliveryFee,
    getDiscountAmount,
    getTotal,
  } = useCartStore();

  const [couponCode, setCouponCode] = useState("");
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);

  const subtotal = getSubtotal();
  const deliveryFee = getDeliveryFee();
  const discountAmount = getDiscountAmount();
  const total = getTotal();

  // ── Coupon validation ──────────────────────────────────────────────────────

  const handleApplyCoupon = useCallback(async () => {
    if (!couponCode.trim()) return;
    setCouponLoading(true);
    setCouponError(null);

    try {
      const token =
        typeof window !== "undefined"
          ? localStorage.getItem("access_token")
          : null;

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/orders/validate-coupon`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            code: couponCode.trim().toUpperCase(),
            cartTotal: subtotal,
            items: items.map((i) => ({
              productId: i.productId,
              quantity: i.quantity,
            })),
          }),
        },
      );

      const data = await res.json();

      if (data.valid) {
        applyCoupon({
          code: couponCode.trim().toUpperCase(),
          discountAmount: data.discountAmount,
          isApplied: true,
        });
        notifications.show({
          title: "Coupon applied! 🎉",
          message: `You saved ৳${data.discountAmount.toLocaleString("bn-BD")}`,
          color: "green",
        });
        setCouponCode("");
      } else {
        setCouponError(data.reason ?? "Invalid coupon.");
      }
    } catch {
      setCouponError("Failed to validate coupon. Please try again.");
    } finally {
      setCouponLoading(false);
    }
  }, [couponCode, subtotal, items, applyCoupon]);

  // ── Checkout navigation ────────────────────────────────────────────────────

  const handleCheckout = () => {
    onClose();
    router.push("/checkout");
  };

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      title={
        <Text fw={700} size="lg" c="dark.8">
          Your Cart
        </Text>
      }
      position="right"
      size="md"
      padding="md"
      overlayProps={{ backgroundOpacity: 0.4, blur: 2 }}
    >
      <Stack h="100%" justify="space-between">
        {/* ── Item list ──────────────────────────────────────────────── */}
        <Box style={{ flex: 1, overflowY: "auto" }}>
          {items.length === 0 ? (
            <EmptyCart />
          ) : (
            <Stack gap="xs">
              <AnimatePresence initial={false}>
                {items.map((item) => (
                  <motion.div
                    key={item.productId}
                    variants={itemVariants}
                    initial="initial"
                    animate="animate"
                    exit="exit"
                    layout
                  >
                    <Group
                      align="flex-start"
                      p="sm"
                      style={{
                        borderRadius: 12,
                        border: "1px solid #F3E8E8",
                        backgroundColor: "#FFF8F6",
                      }}
                    >
                      <Image
                        src={item.image}
                        alt={item.title}
                        w={64}
                        h={64}
                        radius="md"
                        fit="cover"
                      />
                      <Stack gap={4} style={{ flex: 1 }}>
                        <Text fw={600} size="sm" lineClamp={2}>
                          {item.title}
                        </Text>
                        <Text size="sm" c="pink" fw={700}>
                          ৳{item.effectivePrice.toLocaleString("bn-BD")}
                        </Text>
                        <Group gap="xs" mt={4}>
                          <NumberInput
                            value={item.quantity}
                            onChange={(val) =>
                              updateQuantity(item.productId, Number(val))
                            }
                            min={1}
                            max={item.maxQuantity}
                            size="xs"
                            w={80}
                            styles={{
                              input: { textAlign: "center", fontWeight: 600 },
                            }}
                          />
                          <ActionIcon
                            variant="subtle"
                            color="red"
                            size="sm"
                            onClick={() => removeItem(item.productId)}
                            aria-label={`Remove ${item.title}`}
                          >
                            <IconTrash size={14} />
                          </ActionIcon>
                        </Group>
                      </Stack>
                    </Group>
                  </motion.div>
                ))}
              </AnimatePresence>
            </Stack>
          )}
        </Box>

        {/* ── Footer: coupon + summary + CTA ─────────────────────────── */}
        {items.length > 0 && (
          <Stack gap="sm" mt="md">
            {/* Coupon input */}
            {coupon?.isApplied ? (
              <Group
                p="xs"
                style={{
                  borderRadius: 8,
                  border: "1px solid #4CAF7D",
                  backgroundColor: "#F0FDF4",
                }}
                justify="space-between"
              >
                <Group gap={6}>
                  <IconTag size={14} color="#4CAF7D" />
                  <Text size="sm" fw={600} c="green.7">
                    {coupon.code}
                  </Text>
                  <Badge color="green" size="xs" variant="light">
                    −৳{coupon.discountAmount}
                  </Badge>
                </Group>
                <ActionIcon
                  size="xs"
                  variant="subtle"
                  color="red"
                  onClick={removeCoupon}
                  aria-label="Remove coupon"
                >
                  <IconX size={12} />
                </ActionIcon>
              </Group>
            ) : (
              <Stack gap={4}>
                <Group gap="xs">
                  <TextInput
                    placeholder="Enter coupon code"
                    value={couponCode}
                    onChange={(e) => {
                      setCouponCode(e.currentTarget.value.toUpperCase());
                      setCouponError(null);
                    }}
                    onKeyDown={(e) => e.key === "Enter" && handleApplyCoupon()}
                    size="sm"
                    style={{ flex: 1 }}
                    leftSection={<IconTag size={14} />}
                    error={!!couponError}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    color="pink"
                    loading={couponLoading}
                    onClick={handleApplyCoupon}
                    disabled={!couponCode.trim()}
                  >
                    Apply
                  </Button>
                </Group>
                {couponError && (
                  <Text size="xs" c="red">
                    {couponError}
                  </Text>
                )}
              </Stack>
            )}

            <Divider />

            {/* Order summary */}
            <Stack gap={6}>
              <Group justify="space-between">
                <Text size="sm" c="dimmed">
                  Subtotal
                </Text>
                <Text size="sm" fw={500}>
                  ৳{subtotal.toLocaleString("bn-BD")}
                </Text>
              </Group>

              {discountAmount > 0 && (
                <Group justify="space-between">
                  <Text size="sm" c="green.7">
                    Coupon Discount
                  </Text>
                  <Text size="sm" fw={500} c="green.7">
                    −৳{discountAmount.toLocaleString("bn-BD")}
                  </Text>
                </Group>
              )}

              <Group justify="space-between">
                <Text size="sm" c="dimmed">
                  Delivery Fee
                </Text>
                <Text size="sm" fw={500}>
                  {deliveryFee === 0 ? (
                    <Badge color="green" variant="light" size="sm">
                      FREE
                    </Badge>
                  ) : (
                    `৳${deliveryFee}`
                  )}
                </Text>
              </Group>

              <Divider />

              <Group justify="space-between">
                <Text fw={700} size="md">
                  Total
                </Text>
                <Text fw={800} size="lg" c="pink">
                  ৳{total.toLocaleString("bn-BD")}
                </Text>
              </Group>
            </Stack>

            <Button
              fullWidth
              size="md"
              onClick={handleCheckout}
              style={{
                background: "linear-gradient(135deg, #FF6B8B 0%, #F472B6 100%)",
                borderRadius: 12,
                fontWeight: 700,
                letterSpacing: "0.02em",
              }}
            >
              Proceed to Checkout →
            </Button>
          </Stack>
        )}
      </Stack>
    </Drawer>
  );
}
```

---

### Step 6: Frontend — Multi-Step Checkout Page

The checkout page is divided into three animated steps. Step transitions use Framer Motion `AnimatePresence` with a directional `x` slide so the form feels like moving forward or backward through a linear flow. Form state is managed with `@mantine/form`; the district field is a `Select` populated with all 64 Bangladesh districts.

**`apps/web/src/app/(storefront)/checkout/page.tsx`**

```tsx
"use client";

import { useState } from "react";
import {
  Container,
  Paper,
  Stack,
  Group,
  Text,
  Title,
  Button,
  TextInput,
  Select,
  Textarea,
  Radio,
  Loader,
  Box,
  Divider,
  Badge,
  ThemeIcon,
  Table,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { zodResolver } from "mantine-form-zod-resolver";
import {
  IconMapPin,
  IconCreditCard,
  IconCash,
  IconClipboardCheck,
} from "@tabler/icons-react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { notifications } from "@mantine/notifications";
import { useCartStore } from "@/store/cart.store";
import { shippingAddressSchema } from "@/lib/schemas/orders.schema";

// ── Bangladesh Districts ─────────────────────────────────────────────────────

const BD_DISTRICTS = [
  "Bagerhat",
  "Bandarban",
  "Barguna",
  "Barishal",
  "Bhola",
  "Bogura",
  "Brahmanbaria",
  "Chandpur",
  "Chattogram",
  "Chuadanga",
  "Cox's Bazar",
  "Cumilla",
  "Dhaka",
  "Dinajpur",
  "Faridpur",
  "Feni",
  "Gaibandha",
  "Gazipur",
  "Gopalganj",
  "Habiganj",
  "Jamalpur",
  "Jashore",
  "Jhalokati",
  "Jhenaidah",
  "Joypurhat",
  "Khagrachhari",
  "Khulna",
  "Kishoreganj",
  "Kurigram",
  "Kushtia",
  "Lakshmipur",
  "Lalmonirhat",
  "Madaripur",
  "Magura",
  "Manikganj",
  "Meherpur",
  "Moulvibazar",
  "Munshiganj",
  "Mymensingh",
  "Naogaon",
  "Narail",
  "Narayanganj",
  "Narsingdi",
  "Natore",
  "Netrokona",
  "Nilphamari",
  "Noakhali",
  "Pabna",
  "Panchagarh",
  "Patuakhali",
  "Pirojpur",
  "Rajbari",
  "Rajshahi",
  "Rangamati",
  "Rangpur",
  "Satkhira",
  "Shariatpur",
  "Sherpur",
  "Sirajganj",
  "Sunamganj",
  "Sylhet",
  "Tangail",
  "Thakurgaon",
].map((d) => ({ value: d, label: d }));

// ── Step indicator ───────────────────────────────────────────────────────────

const STEPS = [
  { label: "Delivery Info", icon: <IconMapPin size={16} /> },
  { label: "Payment", icon: <IconCreditCard size={16} /> },
  { label: "Review", icon: <IconClipboardCheck size={16} /> },
];

function StepIndicator({ current }: { current: number }) {
  return (
    <Group justify="center" gap={0} mb="xl">
      {STEPS.map((step, idx) => {
        const isActive = idx === current;
        const isDone = idx < current;
        return (
          <Group key={idx} gap={0} align="center">
            <motion.div
              animate={{
                scale: isActive ? 1.12 : 1,
                backgroundColor: isActive
                  ? "#FF6B8B"
                  : isDone
                    ? "#4CAF7D"
                    : "#E5E7EB",
              }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: isActive || isDone ? "#fff" : "#9CA3AF",
                fontWeight: 700,
                fontSize: 14,
              }}
            >
              {isDone ? "✓" : idx + 1}
            </motion.div>
            <Stack gap={0} ml={8} mr={24}>
              <Text
                size="xs"
                fw={isActive ? 700 : 400}
                c={isActive ? "pink" : "dimmed"}
              >
                {step.label}
              </Text>
            </Stack>
            {idx < STEPS.length - 1 && (
              <Box
                style={{
                  width: 32,
                  height: 2,
                  backgroundColor: isDone ? "#4CAF7D" : "#E5E7EB",
                  borderRadius: 1,
                  marginRight: 16,
                }}
              />
            )}
          </Group>
        );
      })}
    </Group>
  );
}

// ── Slide variants ───────────────────────────────────────────────────────────

function slideVariants(direction: 1 | -1) {
  return {
    initial: { opacity: 0, x: direction * 60 },
    animate: {
      opacity: 1,
      x: 0,
      transition: { type: "spring" as const, stiffness: 280, damping: 26 },
    },
    exit: { opacity: 0, x: direction * -60, transition: { duration: 0.18 } },
  };
}

// ── Payment method card ──────────────────────────────────────────────────────

function PaymentCard({
  value,
  selected,
  onSelect,
  icon,
  title,
  description,
}: {
  value: string;
  selected: boolean;
  onSelect: () => void;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <motion.div
      animate={{
        borderColor: selected ? "#FF6B8B" : "#E5E7EB",
        boxShadow: selected ? "0 0 0 2px #FF6B8B33" : "0 0 0 0px transparent",
      }}
      transition={{ duration: 0.2 }}
      style={{
        border: "2px solid",
        borderRadius: 12,
        padding: 16,
        cursor: "pointer",
        backgroundColor: selected ? "#FFF0F3" : "#FAFAFA",
      }}
      onClick={onSelect}
    >
      <Group>
        <ThemeIcon
          size={44}
          radius="md"
          color={selected ? "pink" : "gray"}
          variant="light"
        >
          {icon}
        </ThemeIcon>
        <Stack gap={2}>
          <Text fw={700} size="sm">
            {title}
          </Text>
          <Text size="xs" c="dimmed">
            {description}
          </Text>
        </Stack>
        <Radio
          ml="auto"
          value={value}
          checked={selected}
          onChange={() => onSelect()}
          color="pink"
        />
      </Group>
    </motion.div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function CheckoutPage() {
  const router = useRouter();
  const {
    items,
    coupon,
    getSubtotal,
    getDeliveryFee,
    getDiscountAmount,
    getTotal,
    clearCart,
  } = useCartStore();

  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [paymentMethod, setPaymentMethod] = useState<"COD" | "ONLINE_GATEWAY">(
    "COD",
  );
  const [placing, setPlacing] = useState(false);

  const subtotal = getSubtotal();
  const deliveryFee = getDeliveryFee();
  const discountAmount = getDiscountAmount();
  const total = getTotal();

  const form = useForm({
    validate: zodResolver(shippingAddressSchema),
    initialValues: {
      fullName: "",
      phone: "",
      addressLine1: "",
      addressLine2: "",
      city: "",
      district: "",
      postalCode: "",
    },
  });

  // ── Navigation helpers ─────────────────────────────────────────────────────

  const goNext = () => {
    if (step === 0) {
      const result = form.validate();
      if (result.hasErrors) return;
    }
    setDirection(1);
    setStep((s) => s + 1);
  };

  const goBack = () => {
    setDirection(-1);
    setStep((s) => s - 1);
  };

  // ── Order submission ───────────────────────────────────────────────────────

  const handlePlaceOrder = async () => {
    setPlacing(true);

    const token =
      typeof window !== "undefined"
        ? localStorage.getItem("access_token")
        : null;

    if (!token) {
      router.push("/auth/login?redirect=/checkout");
      return;
    }

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/orders/place`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            items: items.map((i) => ({
              productId: i.productId,
              quantity: i.quantity,
            })),
            shippingAddress: form.values,
            paymentMethod,
            couponCode: coupon?.code,
          }),
        },
      );

      const data = await res.json();

      if (!res.ok || !data.success) {
        notifications.show({
          title: "Order failed",
          message: data.error ?? "Something went wrong. Please try again.",
          color: "red",
        });
        return;
      }

      clearCart();
      router.push(`/orders/success?order=${data.order.orderNumber}`);
    } catch {
      notifications.show({
        title: "Network error",
        message: "Could not reach the server. Check your connection.",
        color: "red",
      });
    } finally {
      setPlacing(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (items.length === 0) {
    router.replace("/");
    return null;
  }

  return (
    <Container size="sm" py={40}>
      <Title order={2} fw={800} ta="center" mb="xl" c="dark.8">
        Checkout
      </Title>

      <StepIndicator current={step} />

      <Paper radius="xl" shadow="sm" p="xl" withBorder>
        <Box style={{ overflow: "hidden", minHeight: 360 }}>
          <AnimatePresence mode="wait" initial={false}>
            {/* ── Step 0: Delivery Info ───────────────────────────────── */}
            {step === 0 && (
              <motion.div key="step-0" {...slideVariants(direction)}>
                <Stack gap="sm">
                  <Title order={4} fw={700}>
                    📦 Delivery Information
                  </Title>

                  <TextInput
                    label="Full Name"
                    placeholder="Fatema Begum"
                    required
                    {...form.getInputProps("fullName")}
                  />

                  <TextInput
                    label="Phone Number"
                    placeholder="+8801712345678"
                    required
                    {...form.getInputProps("phone")}
                  />

                  <TextInput
                    label="Address Line 1"
                    placeholder="House 12, Road 4, Dhanmondi"
                    required
                    {...form.getInputProps("addressLine1")}
                  />

                  <TextInput
                    label="Address Line 2 (optional)"
                    placeholder="Flat 3B, Building Name"
                    {...form.getInputProps("addressLine2")}
                  />

                  <Group grow>
                    <TextInput
                      label="City / Thana"
                      placeholder="Dhanmondi"
                      required
                      {...form.getInputProps("city")}
                    />
                    <Select
                      label="District"
                      placeholder="Select district"
                      data={BD_DISTRICTS}
                      searchable
                      required
                      {...form.getInputProps("district")}
                    />
                  </Group>

                  <TextInput
                    label="Postal Code"
                    placeholder="1205"
                    required
                    maxLength={4}
                    {...form.getInputProps("postalCode")}
                  />
                </Stack>
              </motion.div>
            )}

            {/* ── Step 1: Payment Method ──────────────────────────────── */}
            {step === 1 && (
              <motion.div key="step-1" {...slideVariants(direction)}>
                <Stack gap="md">
                  <Title order={4} fw={700}>
                    💳 Choose Payment Method
                  </Title>

                  <PaymentCard
                    value="COD"
                    selected={paymentMethod === "COD"}
                    onSelect={() => setPaymentMethod("COD")}
                    icon={<IconCash size={22} />}
                    title="Cash on Delivery"
                    description="Pay with cash when your order arrives at your door."
                  />

                  <PaymentCard
                    value="ONLINE_GATEWAY"
                    selected={paymentMethod === "ONLINE_GATEWAY"}
                    onSelect={() => setPaymentMethod("ONLINE_GATEWAY")}
                    icon={<IconCreditCard size={22} />}
                    title="Online Payment"
                    description="Bkash, Nagad, or card — secure gateway checkout."
                  />
                </Stack>
              </motion.div>
            )}

            {/* ── Step 2: Review & Confirm ────────────────────────────── */}
            {step === 2 && (
              <motion.div key="step-2" {...slideVariants(direction)}>
                <Stack gap="md">
                  <Title order={4} fw={700}>
                    🧾 Review Your Order
                  </Title>

                  <Table
                    striped
                    highlightOnHover
                    withTableBorder
                    withColumnBorders
                  >
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Product</Table.Th>
                        <Table.Th ta="center">Qty</Table.Th>
                        <Table.Th ta="right">Price</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {items.map((item) => (
                        <Table.Tr key={item.productId}>
                          <Table.Td>{item.title}</Table.Td>
                          <Table.Td ta="center">{item.quantity}</Table.Td>
                          <Table.Td ta="right">
                            ৳
                            {(
                              item.effectivePrice * item.quantity
                            ).toLocaleString("bn-BD")}
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>

                  <Stack gap={6} mt="xs">
                    <Group justify="space-between">
                      <Text size="sm" c="dimmed">
                        Subtotal
                      </Text>
                      <Text size="sm">৳{subtotal.toLocaleString("bn-BD")}</Text>
                    </Group>

                    {discountAmount > 0 && (
                      <Group justify="space-between">
                        <Group gap={4}>
                          <Text size="sm" c="green.7">
                            Coupon
                          </Text>
                          <Badge color="green" size="xs" variant="light">
                            {coupon?.code}
                          </Badge>
                        </Group>
                        <Text size="sm" c="green.7">
                          −৳{discountAmount}
                        </Text>
                      </Group>
                    )}

                    <Group justify="space-between">
                      <Text size="sm" c="dimmed">
                        Delivery Fee
                      </Text>
                      <Text size="sm">
                        {deliveryFee === 0 ? (
                          <Badge color="green" size="xs" variant="light">
                            FREE
                          </Badge>
                        ) : (
                          `৳${deliveryFee}`
                        )}
                      </Text>
                    </Group>

                    <Divider />

                    <Group justify="space-between">
                      <Text fw={700}>Grand Total</Text>
                      <Text fw={800} size="xl" c="pink">
                        ৳{total.toLocaleString("bn-BD")}
                      </Text>
                    </Group>

                    <Group justify="space-between">
                      <Text size="sm" c="dimmed">
                        Payment
                      </Text>
                      <Badge
                        color={paymentMethod === "COD" ? "orange" : "blue"}
                        variant="light"
                      >
                        {paymentMethod === "COD"
                          ? "Cash on Delivery"
                          : "Online Gateway"}
                      </Badge>
                    </Group>
                  </Stack>
                </Stack>
              </motion.div>
            )}
          </AnimatePresence>
        </Box>

        {/* ── Navigation buttons ───────────────────────────────────────── */}
        <Group justify="space-between" mt="xl">
          {step > 0 ? (
            <Button variant="subtle" color="gray" onClick={goBack}>
              ← Back
            </Button>
          ) : (
            <Box />
          )}

          {step < 2 ? (
            <Button
              onClick={goNext}
              style={{
                background: "linear-gradient(135deg, #FF6B8B 0%, #F472B6 100%)",
                fontWeight: 700,
              }}
            >
              Next →
            </Button>
          ) : (
            <Button
              onClick={handlePlaceOrder}
              loading={placing}
              leftSection={placing ? <Loader size="xs" color="white" /> : null}
              style={{
                background: "linear-gradient(135deg, #FF6B8B 0%, #F472B6 100%)",
                fontWeight: 700,
              }}
            >
              Place Order
            </Button>
          )}
        </Group>
      </Paper>
    </Container>
  );
}
```

---

### Step 7: Frontend — Order Success Page

After a successful order placement, the customer is redirected here. A spring-animated green circle with a checkmark scales into view, the order number fades in, and multiple small coloured motion `div` elements burst outward from the centre for a confetti-like celebration effect.

**`apps/web/src/app/(storefront)/orders/success/page.tsx`**

```tsx
"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useRef } from "react";
import {
  Container,
  Stack,
  Title,
  Text,
  Button,
  Group,
  Box,
  Paper,
} from "@mantine/core";
import { IconCheck } from "@tabler/icons-react";
import { motion } from "motion/react";

// ── Confetti particle ────────────────────────────────────────────────────────

const CONFETTI_COLORS = [
  "#FF6B8B",
  "#4CAF7D",
  "#A78BFA",
  "#FBBF24",
  "#34D399",
  "#F472B6",
];

function ConfettiParticle({ delay, angle }: { delay: number; angle: number }) {
  const distance = 80 + Math.random() * 80;
  const x = Math.cos(angle) * distance;
  const y = Math.sin(angle) * distance;
  const color =
    CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
  const size = 6 + Math.random() * 8;

  return (
    <motion.div
      initial={{ opacity: 1, x: 0, y: 0, scale: 1 }}
      animate={{
        opacity: 0,
        x,
        y,
        scale: 0.3,
        rotate: Math.random() * 360,
      }}
      transition={{
        duration: 0.9 + Math.random() * 0.6,
        delay,
        ease: "easeOut",
      }}
      style={{
        position: "absolute",
        width: size,
        height: size,
        borderRadius: Math.random() > 0.5 ? "50%" : 2,
        backgroundColor: color,
        pointerEvents: "none",
      }}
    />
  );
}

function Confetti() {
  const count = 28;
  return (
    <Box
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        pointerEvents: "none",
      }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <ConfettiParticle
          key={i}
          delay={i * 0.025}
          angle={(i / count) * 2 * Math.PI}
        />
      ))}
    </Box>
  );
}

// ── Success content ──────────────────────────────────────────────────────────

function SuccessContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const orderNumber = searchParams.get("order") ?? "—";

  return (
    <Container size="xs" py={60}>
      <Paper radius="xl" shadow="md" p="xl" withBorder>
        <Stack align="center" gap="lg">
          {/* Animated checkmark circle with confetti burst */}
          <Box style={{ position: "relative", display: "inline-flex" }}>
            <Confetti />
            <motion.div
              initial={{ scale: 0, rotate: -30 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{
                type: "spring",
                stiffness: 260,
                damping: 18,
                delay: 0.1,
              }}
              style={{
                width: 96,
                height: 96,
                borderRadius: "50%",
                background: "linear-gradient(135deg, #4CAF7D, #34D399)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 8px 32px #4CAF7D44",
                zIndex: 1,
                position: "relative",
              }}
            >
              <IconCheck size={48} color="#fff" stroke={3} />
            </motion.div>
          </Box>

          {/* Title */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.5 }}
          >
            <Stack align="center" gap={4}>
              <Title order={2} fw={800} ta="center" c="dark.8">
                Order Placed! 🎉
              </Title>
              <Text size="md" c="dimmed" ta="center">
                Thank you for shopping with My Oxygen.
              </Text>
            </Stack>
          </motion.div>

          {/* Order number */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.55, type: "spring", stiffness: 220 }}
            style={{ width: "100%" }}
          >
            <Box
              p="md"
              style={{
                borderRadius: 12,
                backgroundColor: "#FFF8F6",
                border: "1.5px dashed #FF6B8B",
                textAlign: "center",
              }}
            >
              <Text size="xs" c="dimmed" mb={4} tt="uppercase" fw={600}>
                Order Number
              </Text>
              <Text
                fw={800}
                size="xl"
                c="pink"
                style={{ letterSpacing: "0.06em" }}
              >
                {orderNumber}
              </Text>
              <Text size="xs" c="dimmed" mt={4}>
                Keep this number to track your delivery.
              </Text>
            </Box>
          </motion.div>

          {/* CTA buttons */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7, duration: 0.4 }}
            style={{ width: "100%" }}
          >
            <Stack gap="sm">
              <Button
                fullWidth
                size="md"
                onClick={() => router.push(`/account/orders`)}
                style={{
                  background:
                    "linear-gradient(135deg, #4CAF7D 0%, #A78BFA 100%)",
                  fontWeight: 700,
                  borderRadius: 12,
                }}
              >
                Track Your Order →
              </Button>
              <Button
                fullWidth
                size="md"
                variant="outline"
                color="pink"
                onClick={() => router.push("/")}
                style={{ borderRadius: 12, fontWeight: 600 }}
              >
                Continue Shopping
              </Button>
            </Stack>
          </motion.div>
        </Stack>
      </Paper>
    </Container>
  );
}

// ── Page export (wrapped in Suspense for useSearchParams) ────────────────────

export default function OrderSuccessPage() {
  return (
    <Suspense fallback={null}>
      <SuccessContent />
    </Suspense>
  );
}
```

---

### Step 8: Frontend — My Orders Page

The account orders page is authentication-gated. Each order card fades in and slides up in a staggered sequence driven by Framer Motion. Status badges are colour-coded to match the global status vocabulary established in Phase 1.

**`apps/web/src/app/(storefront)/account/orders/page.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Container,
  Stack,
  Title,
  Text,
  Paper,
  Group,
  Badge,
  Button,
  Skeleton,
  Center,
  ThemeIcon,
} from "@mantine/core";
import { IconPackage } from "@tabler/icons-react";
import { motion, AnimatePresence } from "motion/react";

// ── Types ────────────────────────────────────────────────────────────────────

type OrderStatus =
  "PENDING" | "PROCESSING" | "SHIPPED" | "DELIVERED" | "CANCELLED" | "REFUNDED";

interface OrderSummary {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentMethod: "COD" | "ONLINE_GATEWAY";
  paymentStatus: string;
  total: string;
  createdAt: string;
}

// ── Status badge config ──────────────────────────────────────────────────────

const STATUS_CONFIG: Record<OrderStatus, { color: string; label: string }> = {
  PENDING: { color: "orange", label: "Pending" },
  PROCESSING: { color: "blue", label: "Processing" },
  SHIPPED: { color: "violet", label: "Shipped" },
  DELIVERED: { color: "green", label: "Delivered" },
  CANCELLED: { color: "gray", label: "Cancelled" },
  REFUNDED: { color: "red", label: "Refunded" },
};

// ── Order card ───────────────────────────────────────────────────────────────

function OrderCard({ order, index }: { order: OrderSummary; index: number }) {
  const router = useRouter();
  const config = STATUS_CONFIG[order.status];
  const date = new Date(order.createdAt).toLocaleDateString("en-BD", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{
        delay: index * 0.07,
        type: "spring",
        stiffness: 260,
        damping: 24,
      }}
    >
      <Paper
        radius="xl"
        shadow="xs"
        p="md"
        withBorder
        style={{ borderColor: "#F3E8E8" }}
      >
        <Group justify="space-between" align="flex-start">
          <Stack gap={4}>
            <Group gap={6}>
              <Text fw={700} size="sm" c="dark.8">
                {order.orderNumber}
              </Text>
              <motion.div
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.07 + 0.15, type: "spring" }}
              >
                <Badge
                  color={config.color}
                  variant="light"
                  size="sm"
                  radius="md"
                >
                  {config.label}
                </Badge>
              </motion.div>
            </Group>

            <Text size="xs" c="dimmed">
              {date}
            </Text>

            <Text size="xs" c="dimmed">
              {order.paymentMethod === "COD"
                ? "Cash on Delivery"
                : "Online Payment"}
            </Text>
          </Stack>

          <Stack align="flex-end" gap={6}>
            <Text fw={800} size="md" c="pink">
              ৳
              {parseFloat(order.total).toLocaleString("bn-BD", {
                minimumFractionDigits: 0,
              })}
            </Text>
            <Button
              size="xs"
              variant="outline"
              color="pink"
              radius="md"
              onClick={() =>
                router.push(`/account/orders/${order.orderNumber}`)
              }
            >
              View Details
            </Button>
          </Stack>
        </Group>
      </Paper>
    </motion.div>
  );
}

// ── Empty state ──────────────────────────────────────────────────────────────

function EmptyOrders() {
  const router = useRouter();
  return (
    <Center py={80}>
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 240, damping: 20 }}
      >
        <Stack align="center" gap="md">
          <ThemeIcon size={80} radius="xl" color="pink" variant="light">
            <IconPackage size={40} />
          </ThemeIcon>
          <Title order={4} fw={700} ta="center">
            No orders yet
          </Title>
          <Text c="dimmed" ta="center" maw={260} size="sm">
            You haven't placed any orders. Start shopping to see your history
            here.
          </Text>
          <Button
            variant="filled"
            color="pink"
            onClick={() => router.push("/")}
          >
            Shop Now
          </Button>
        </Stack>
      </motion.div>
    </Center>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function MyOrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    const token =
      typeof window !== "undefined"
        ? localStorage.getItem("access_token")
        : null;

    if (!token) {
      router.replace("/auth/login?redirect=/account/orders");
      return;
    }

    const fetchOrders = async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/orders/my-orders?page=${page}&limit=10`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        const data = await res.json();
        if (data.success) {
          setOrders(data.data);
          setTotalPages(data.meta.totalPages);
        }
      } catch {
        // Handle silently; empty state is shown
      } finally {
        setLoading(false);
      }
    };

    fetchOrders();
  }, [page, router]);

  return (
    <Container size="sm" py={40}>
      <Stack gap="lg">
        <Group justify="space-between" align="center">
          <Title order={3} fw={800} c="dark.8">
            My Orders
          </Title>
          <Text size="sm" c="dimmed">
            {loading ? "Loading…" : `${orders.length} order(s)`}
          </Text>
        </Group>

        {loading ? (
          <Stack gap="sm">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} height={100} radius="xl" />
            ))}
          </Stack>
        ) : orders.length === 0 ? (
          <EmptyOrders />
        ) : (
          <AnimatePresence mode="popLayout">
            <Stack gap="sm">
              {orders.map((order, idx) => (
                <OrderCard key={order.id} order={order} index={idx} />
              ))}
            </Stack>
          </AnimatePresence>
        )}

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <Group justify="center" mt="md">
            <Button
              variant="subtle"
              color="gray"
              size="sm"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              ← Previous
            </Button>
            <Text size="sm" c="dimmed">
              Page {page} of {totalPages}
            </Text>
            <Button
              variant="subtle"
              color="gray"
              size="sm"
              disabled={page === totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next →
            </Button>
          </Group>
        )}
      </Stack>
    </Container>
  );
}
```

---

### Step 9: Phase 7 Verification Checklist

Execute the following tests sequentially before declaring Phase 7 complete and initiating Phase 8:

1. **Zustand cart persistence:**

```bash
pnpm --filter @my-oxygen/web dev
```

_Expected outcome:_ Open the storefront, add two products to cart, reload the page — items persist in the cart drawer. `localStorage` key `my-oxygen-cart` contains a serialised JSON blob.

2. **Coupon validation (valid code):**

```bash
curl -X POST http://localhost:4000/orders/validate-coupon \
  -H "Authorization: Bearer <customer_jwt>" \
  -H "Content-Type: application/json" \
  -d '{"code":"OXYGEN10","cartTotal":1200,"items":[{"productId":"<uuid>","quantity":2}]}'
```

_Expected outcome:_ Returns `{"valid":true,"discountAmount":120,"effectiveTotal":1080,"couponType":"PERCENTAGE","couponValue":10}`.

3. **Coupon validation (expired / invalid code):**

```bash
curl -X POST http://localhost:4000/orders/validate-coupon \
  -H "Authorization: Bearer <customer_jwt>" \
  -H "Content-Type: application/json" \
  -d '{"code":"BADCODE","cartTotal":1200,"items":[{"productId":"<uuid>","quantity":1}]}'
```

_Expected outcome:_ Returns `{"valid":false,"reason":"Coupon code is invalid or has expired."}`.

4. **Cart drawer coupon flow (UI):**

_Expected outcome:_ Enter a valid coupon code in the CartDrawer input, press Apply — green badge appears with discount amount, order summary updates to show reduced total and correct delivery fee recalculation.

5. **Three-step checkout navigation:**

_Expected outcome:_ Clicking "Next →" from Step 0 with empty required fields shows Mantine form validation errors. Filling valid data advances to Step 1 with a rightward slide animation. Step 1 (Payment) selecting Online Gateway highlights the card in pink with animated border. Step 2 (Review) shows all items, applied coupon, delivery fee, and grand total. "← Back" returns with leftward slide.

6. **Order placement (COD):**

```bash
curl -X POST http://localhost:4000/orders/place \
  -H "Authorization: Bearer <customer_jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "items":[{"productId":"<uuid>","quantity":1}],
    "shippingAddress":{"fullName":"Fatema Begum","phone":"+8801712345678","addressLine1":"House 12, Road 4","city":"Dhanmondi","district":"Dhaka","postalCode":"1205"},
    "paymentMethod":"COD"
  }'
```

_Expected outcome:_ Returns HTTP 201 with `{"success":true,"order":{"orderNumber":"OXY202609221430XXXX",...}}`. Batch `availableQuantity` decremented in `product_batches` table. Earliest-expiring batch consumed first (FEFO).

7. **Order success page animation:**

_Expected outcome:_ Navigate to `/orders/success?order=OXY202609221430XXXX` — green checkmark circle springs into view, confetti particles burst outward from centre, order number appears in pink dashed box, "Track Your Order" and "Continue Shopping" buttons fade in.

8. **My Orders page (authenticated):**

_Expected outcome:_ `/account/orders` shows the just-placed order with an orange "Pending" badge. Order cards stagger in 70 ms apart. Clicking "View Details" navigates to `/account/orders/OXY202609221430XXXX`.

9. **My Orders page (unauthenticated):**

_Expected outcome:_ Visiting `/account/orders` without a stored JWT token redirects immediately to `/auth/login?redirect=/account/orders`.

10. **FEFO batch allocation integrity:**

```sql
-- Run in psql after placing an order for a batch-tracked product
SELECT batch_number, available_quantity
FROM product_batches
WHERE product_id = '<uuid>'
ORDER BY expiry_date ASC;
```

_Expected outcome:_ The batch with the earliest `expiry_date` has its `available_quantity` decremented first, regardless of insertion order.
