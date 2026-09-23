# Plan 007: Purchase Funnel: Cart Store, Coupon Engine & 3-Step Checkout

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Working directories**: `backend/` and `frontend/`

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: plans/005-design-system-motion-ui.md, plans/006-customer-storefront-catalog.md
- **Category**: correctness | direction
- **Planned at**: 2026-09-22

---

## Why this matters

Phase 7 delivers the core revenue-generating purchase funnel: a reactive, persisted cart drawer, real-time coupon validation, transactional FEFO order placement (preventing overselling), and an animated 3-step checkout flow tailored to Bangladesh (Bangladeshi phone validation, Cash on Delivery, flat ৳60 / free delivery over ৳1,500).

---

## Current state

- `backend/`:
  - Drizzle tables `orders`, `order_items`, `discounts`, and `stock_history_logs` exist and are migrated in PostgreSQL.
  - `InventoryService` in `src/services/inventory.service.ts` provides `allocateBatchesFEFO()`, `reserveStock()`, and `releaseReservation()`.
  - 67 tests passing across auth, inventory, and catalog.
- `frontend/`:
  - Design tokens, Mantine 9 theme, and UI primitives are available.

---

## Commands you will need

| Purpose | Directory | Command | Expected on success |
|---|---|---|---|
| Backend Test | `backend/` | `bun test src/routes/orders.test.ts` | exit 0, all pass |
| Backend Typecheck | `backend/` | `bun x tsc --noEmit` | exit 0, zero errors |
| Frontend Deps | `frontend/` | `bun add zustand` | exit 0 |
| Frontend Typecheck | `frontend/` | `bun x tsc --noEmit` | exit 0, zero errors |
| Frontend Build | `frontend/` | `bun run build` | exit 0, compiled successfully |

---

## Scope

**In scope**:
- `backend/src/routes/orders.schema.ts` (Zod schemas for address, coupon, checkout)
- `backend/src/services/coupon.service.ts` (Coupon validation engine)
- `backend/src/services/order.service.ts` (Transactional order placement with FEFO reservation)
- `backend/src/routes/orders.ts` (Hono routes: checkout, validate-coupon, order history)
- `backend/src/routes/orders.test.ts` (Unit/integration test suite)
- `backend/src/index.ts` (Register `/orders` route)
- `frontend/package.json` (add `zustand`)
- `frontend/lib/cart-store.ts` (Zustand cart store with `persist`)
- `frontend/components/CartDrawer.tsx` (Slide-out cart drawer with quantity stepper and coupon code)
- `frontend/app/checkout/page.tsx` (3-step animated checkout flow)
- `frontend/app/orders/[orderNumber]/page.tsx` (Order confirmation page)

**Out of scope**:
- Steadfast courier API registration and PDF invoice generation belong to Plan 008.

---

## Steps

### Step 1: Backend — Order & Coupon Schemas (`backend/src/routes/orders.schema.ts`)

Define Zod schemas:
- `shippingAddressSchema`:
  - `fullName`: string (min 2, max 100)
  - `phone`: regex `/^(\+880|880|0)1[3-9]\d{8}$/` ("Enter a valid Bangladeshi phone number")
  - `addressLine1`: string (min 5, max 255)
  - `city`: string (min 2, max 100)
  - `district`: string (min 2, max 100)
  - `postalCode`: regex `/^\d{4}$/` ("4-digit Bangladesh postcode")
- `cartItemInputSchema`:
  - `productId`: uuid
  - `quantity`: positive integer
- `validateCouponSchema`:
  - `code`: string (min 2)
  - `items`: array of `cartItemInputSchema`
- `checkoutSchema`:
  - `shippingAddress`: `shippingAddressSchema`
  - `items`: array of `cartItemInputSchema` (non-empty)
  - `paymentMethod`: enum `["CASH_ON_DELIVERY", "ONLINE_GATEWAY"]`
  - `couponCode`: optional string

**Verify**: `bun x tsc --noEmit` in `backend/` passes.

### Step 2: Backend — Coupon & Order Services

1. **`backend/src/services/coupon.service.ts`**:
   - `validateCoupon(code: string, subtotal: number, items: { productId: string, quantity: number, unitPrice: number }[])`:
     - Queries `discounts` where `code = code` and `isActive = true` and `startsAt <= NOW()` and `endsAt >= NOW()`.
     - Throws error if coupon expired or not found.
     - Calculates discount amount (percentage or fixed).
     - Returns `{ isValid: true, discountAmount: number, code: string }`.

2. **`backend/src/services/order.service.ts`**:
   - `createOrder(payload: CheckoutPayload, userId: string)`:
     - Runs inside `db.transaction(async (tx) => { ... })`.
     - For each cart item:
       - Checks product price and availability.
       - Calls `inventoryService.allocateBatchesFEFO(item.productId, item.quantity, tx)`.
       - Calls `inventoryService.reserveStock(allocations, orderId, userId, tx)`.
     - Calculates:
       - `subtotal` = sum of `item.unitPrice * item.quantity`.
       - `deliveryFee` = `subtotal >= 1500 ? 0 : 60`.
       - `discountAmount` from validated coupon if provided.
       - `total` = `subtotal + deliveryFee - discountAmount`.
     - Generates unique `orderNumber`: `ORD-${Date.now()}-${random4Digits}`.
     - Inserts into `orders` with status `PENDING`, paymentStatus `UNPAID` (or `COD`).
     - Inserts into `orderItems` linking allocated batch IDs.
     - Returns created order.

**Verify**: `bun x tsc --noEmit` in `backend/` passes.

### Step 3: Backend — Orders Route & Tests

1. **`backend/src/routes/orders.ts`**:
   - `POST /orders/checkout`: protected by `requireAuth`.
   - `POST /orders/validate-coupon`: public or authenticated.
   - `GET /orders/my-orders`: protected by `requireAuth`.
   - `GET /orders/:idOrNumber`: protected by `requireAuth`.
2. Register route in `backend/src/index.ts`: `app.route("/orders", ordersRoute)`.
3. Create `backend/src/routes/orders.test.ts`:
   - Test coupon validation for valid and expired codes.
   - Test checkout creates order and decrements batch stock.
   - Test phone number validation rejects non-Bangladeshi numbers.

**Verify**: `bun test src/routes/orders.test.ts` passes 100%.

### Step 4: Frontend — Zustand Cart Store (`frontend/lib/cart-store.ts`)

Install Zustand:
```bash
bun add zustand
```

Create `frontend/lib/cart-store.ts`:
- Uses Zustand `create` with `persist` middleware storing to `"my_oxygen_cart"`.
- Methods: `addItem(product, qty)`, `removeItem(productId)`, `updateQuantity(productId, qty)`, `clearCart()`, `openDrawer()`, `closeDrawer()`.
- Computed getters: `totalCount`, `subtotal`, `amountNeededForFreeDelivery` (`max(0, 1500 - subtotal)`).

**Verify**: `bun x tsc --noEmit` in `frontend/` passes.

### Step 5: Frontend — Cart Drawer & Multi-Step Checkout

1. **`frontend/components/CartDrawer.tsx`**:
   - Mantine `Drawer` positioned on the right (`position="right"`).
   - Displays free delivery banner with progress bar (`subtotal / 1500 * 100%`).
   - List of cart items with image, title, price, quantity increment/decrement, and remove button.
   - Coupon input field with "Apply" button showing instant discount.
   - Subtotal, Delivery Fee (৳60 or FREE), Total.
   - "Proceed to Checkout" button linking to `/checkout`.

2. **`frontend/app/checkout/page.tsx`**:
   - 3-step animated stepper:
     - **Step 1: Delivery Address**: Full Name, Bangladeshi Phone Number (`01[3-9]\d{8}`), Address, City, District.
     - **Step 2: Payment Method**: Radio cards for "Cash on Delivery (COD)" and "Online Gateway (bKash / Nagad / Cards)".
     - **Step 3: Review & Place Order**: Itemized breakdown, delivery fee, discount, total, and "Place Order (৳{total})" button.
   - Submits to `POST /orders/checkout`.
   - On success: clears cart and redirects to `/orders/${orderNumber}`.

3. **`frontend/app/orders/[orderNumber]/page.tsx`**:
   - Success badge with animated checkmark.
   - Order number, payment status, delivery address.
   - Estimated delivery notice ("Delivery within 24-48 hours via Steadfast").
   - "Continue Shopping" button.

**Verify**: `bun run build` in `frontend/` succeeds.

---

## Done criteria

- [ ] `bun test src/routes/orders.test.ts` in `backend/` passes 100%.
- [ ] `bun run build` in `frontend/` succeeds cleanly with zero errors.
- [ ] FEFO batch reservation is executed atomically inside a transaction on checkout.
- [ ] Cart state persists in `localStorage` across page reloads.
- [ ] Phone validation enforces Bangladesh mobile format `01[3-9]\d{8}`.
- [ ] Free delivery rule (৳60 fee below ৳1,500; ৳0 at or above ৳1,500) is enforced.
- [ ] `plans/README.md` status row for Plan 007 is updated to `DONE`.

---

## STOP conditions

- If concurrent checkout requests fail or throw isolation errors, ensure transaction uses proper row locking.
- Stop and report if guest checkout vs authenticated checkout requirements conflict — per Phase 2 & Phase 7, checkout requires authentication (`requireAuth`).
