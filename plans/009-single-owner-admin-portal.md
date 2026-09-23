# Plan 009: Single-Owner Admin Back-Office, Batch Inspector & Telemetry

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Working directories**: `backend/` and `frontend/`

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MED
- **Depends on**: plans/005-design-system-motion-ui.md, plans/007-purchase-funnel-checkout.md
- **Category**: direction | dx
- **Planned at**: 2026-09-22

---

## Why this matters

Phase 9 delivers the operational back-office portal for the single owner and their staff. It equips the store owner with:
1. **Sales & Inventory Telemetry**: Live metric summaries (revenue, order status breakdown, low-stock warnings, upcoming batch expirations).
2. **Perishable Batch Inspector**: A filterable, color-coded ledger to monitor batch shelf life and take proactive markdown/clearance actions before products expire.
3. **Inventory Audit Ledger**: An immutable, paginated view of all `stock_history_logs` ensuring end-to-end stock accountability.
4. **Order Management & Logistics Fulfillment**: Real-time order status transitions, automated Steadfast parcel dispatch, and invoice downloads.

---

## Current state

- `backend/`:
  - RBAC engine in `src/lib/rbac.ts` enforces permissions: `ANALYTICS_READ`, `BATCHES_MANAGE`, `ORDERS_READ`, `ORDERS_STATUS_UPDATE`, `COURIER_ASSIGN`, `STOCK_ADJUST`, `STAFF_MANAGE`.
  - Super Admin seeded: `admin@myoxygen.com`.
- `frontend/`:
  - Mantine 9 setup with design system tokens and theme.

---

## Commands you will need

| Purpose | Directory | Command | Expected on success |
|---|---|---|---|
| Backend Test | `backend/` | `bun test src/routes/admin.test.ts` | exit 0, all pass |
| Backend Typecheck | `backend/` | `bun x tsc --noEmit` | exit 0, zero errors |
| Frontend Deps | `frontend/` | `bun add @mantine/dates` | exit 0 |
| Frontend Build | `frontend/` | `bun run build` | exit 0, compiled successfully |

---

## Scope

**In scope**:
- `backend/src/routes/admin.schema.ts` (Admin query & update schemas)
- `backend/src/routes/admin.ts` (Admin endpoints: telemetry, batches, ledger, order status, courier dispatch)
- `backend/src/routes/admin.test.ts` (Unit/integration test suite)
- `backend/src/index.ts` (Register `/admin` route)
- `frontend/package.json` (add `@mantine/dates` if needed for batch date pickers)
- `frontend/app/admin/layout.tsx` (Admin dashboard sidebar & navbar layout)
- `frontend/app/admin/page.tsx` (Telemetry metric cards & overview)
- `frontend/app/admin/batches/page.tsx` (Batch inspector table with expiry status badges)
- `frontend/app/admin/orders/page.tsx` (Order fulfillment, status dropdown & courier trigger)
- `frontend/app/admin/ledger/page.tsx` (Immutable stock audit ledger table)

**Out of scope**:
- Multi-vendor / merchant portals (strictly rejected by single-owner invariant).

---

## Steps

### Step 1: Backend — Admin Schemas & Endpoints (`backend/src/routes/admin.ts`)

1. Create `backend/src/routes/admin.schema.ts`:
   - `updateOrderStatusSchema`: `status` (`PENDING | PROCESSING | SHIPPED | DELIVERED | CANCELLED`), `courierProvider?`, `trackingId?`.
   - `adminQuerySchema`: `page?`, `limit?`, `search?`, `status?`, `productId?`.

2. Create `backend/src/routes/admin.ts`:
   - Route protected by `requireAuth`:
     - `GET /admin/analytics/summary`: (requirePermission `ANALYTICS_READ`)
       - Computes: `totalRevenue` (sum of non-cancelled orders), `totalOrders`, `ordersByStatus`, `lowStockCount`, `expiringSoonCount` (within 30 days), `dailyRevenue` (last 7 days).
     - `GET /admin/batches`: (requirePermission `BATCHES_MANAGE`)
       - Joins `productBatches` with `products`. Computes status (`EXPIRED`, `EXPIRING_SOON`, `HEALTHY`).
     - `GET /admin/inventory/ledger`: (requirePermission `STOCK_ADJUST`)
       - Queries `stockHistoryLogs` ordered by `createdAt DESC` with pagination.
     - `GET /admin/orders`: (requirePermission `ORDERS_READ`)
       - Queries `orders` with customer details and line items.
     - `PATCH /admin/orders/:id/status`: (requirePermission `ORDERS_STATUS_UPDATE`)
       - Updates order status. If changing to `CANCELLED`, automatically releases reserved inventory via `inventoryService.releaseReservation(orderId, userId, db)`.
     - `POST /admin/orders/:id/dispatch-courier`: (requirePermission `COURIER_ASSIGN`)
       - Calls `courierService.createParcel()` and stores `trackingId` and `courierProvider`. Sets order status to `SHIPPED`.

3. Register `/admin` in `backend/src/index.ts`.

4. Create `backend/src/routes/admin.test.ts`:
   - Tests telemetry endpoint.
   - Tests order status update and stock release on cancellation.
   - Tests courier dispatch.
   - Verifies customer token is rejected with 403 Forbidden.

**Verify**: `bun test src/routes/admin.test.ts` passes 100%.

### Step 2: Frontend — Admin Portal Layout (`frontend/app/admin/layout.tsx`)

Layout featuring:
- **Left Sidebar**:
  - Logo "My Oxygen Admin".
  - Navigation links with Tabler icons:
    - Overview (`IconDashboard`)
    - Batch Inspector (`IconCalendarTime`)
    - Orders (`IconTruckDelivery`)
    - Stock Ledger (`IconFileSpreadsheet`)
    - Storefront View (`IconArrowBackUp`)
- **Top Header**:
  - Role badge (`SUPER_ADMIN`).
  - Notification indicators.
  - User avatar and Logout button.

**Verify**: `bun x tsc --noEmit` in `frontend/` passes.

### Step 3: Frontend — Admin Dashboard Overview (`frontend/app/admin/page.tsx`)

- Metric Cards in 4-column Mantine Grid:
  - **Total Revenue**: `৳ {summary.totalRevenue}` with trend badge.
  - **Total Orders**: `{summary.totalOrders}` with status breakdown.
  - **Low Stock Warnings**: `{summary.lowStockCount}` (badge in `#F59E0B` warning yellow).
  - **Expiring Batches (≤30 Days)**: `{summary.expiringSoonCount}` (badge in `#EF4444` error red).
- Recent Orders Table:
  - Order Number, Customer, Status badge, Total, Date, Quick Actions.

**Verify**: `bun run build` in `frontend/` passes.

### Step 4: Frontend — Batch Inspector & Orders Management Pages

1. **`frontend/app/admin/batches/page.tsx`**:
   - Filter pills: All, Expired, Expiring Soon, Healthy.
   - Table: Product Name, SKU, Batch #, Manufacture Date, Expiry Date, Remaining Qty, Status Badge (`StatusBadge`).
   - Action to import new batch via modal.

2. **`frontend/app/admin/orders/page.tsx`**:
   - Table with Order #, Customer Name, Phone, Items Qty, Total, Payment Method, Order Status.
   - Status update dropdown (`PENDING` -> `PROCESSING` -> `SHIPPED` -> `DELIVERED` -> `CANCELLED`).
   - "Dispatch Steadfast" button that opens confirmation modal and triggers `POST /admin/orders/:id/dispatch-courier`.
   - "Download Invoice" button opening `GET /orders/:id/invoice`.

3. **`frontend/app/admin/ledger/page.tsx`**:
   - Paginated table showing: Date/Time, Product, Batch #, Delta (+/-), Reason (`IMPORT`, `PURCHASE`, `RETURN`, `EXPIRED_SCRAP`, `ADJUSTMENT`), Note, Performed By.

**Verify**: `bun run build` in `frontend/` succeeds.

---

## Done criteria

- [ ] `bun test src/routes/admin.test.ts` passes 100%.
- [ ] `bun run build` compiles all `/admin/*` routes without SSR errors.
- [ ] Batch inspector correctly flags batches expiring within 30 days.
- [ ] Cancelling an order via admin automatically restores stock with `RETURN` audit log.
- [ ] Courier dispatch updates order status and stores tracking ID.
- [ ] `plans/README.md` status row for Plan 009 is updated to `DONE`.

---

## STOP conditions

- If non-admin users can access admin routes, enforce RBAC checks in route middleware.
- Do not add any vendor payout or merchant splitting schemas.
