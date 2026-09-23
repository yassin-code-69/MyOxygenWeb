# Plan 008: Courier Logistics Adapter, PDF Invoices & Notification Hub

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md`.
>
> **Working directory**: `/home/jaber/Documents/job/my_oxygen/backend`

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/007-purchase-funnel-checkout.md
- **Category**: direction | tech-debt
- **Planned at**: 2026-09-22

---

## Why this matters

Phase 8 equips My Oxygen with real-world retail fulfillment operations:
1. **Steadfast Courier Logistics**: Automated parcel booking with tracking IDs and COD collection.
2. **Automated Branded PDF Invoices**: Server-side generated A4 invoices with brand styling, batch numbers, itemized prices, and delivery terms.
3. **Multi-Channel Notification Hub**: Fire-and-forget order confirmation dispatch across Email and SMS (SSL Wireless Bangladesh format).

---

## Current state

- Working directory: `backend/`
- Database table `orders` includes `courierProvider`, `trackingId`, and `pdfInvoiceUrl`.
- Hono API running on port 4000.

---

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install deps | `bun add pdf-lib` | exit 0 |
| Run tests | `bun test src/services/courier/courier.test.ts src/services/invoice/invoice.test.ts` | exit 0, all pass |
| Typecheck | `bun x tsc --noEmit` | exit 0, zero errors |

---

## Scope

**In scope**:
- `backend/package.json` (add `pdf-lib`)
- `backend/src/services/courier/courier.interface.ts` (Vendor-neutral courier interface)
- `backend/src/services/courier/steadfast.provider.ts` (Steadfast Courier implementation with mock fallback)
- `backend/src/services/courier/courier.service.ts` (Courier factory & dispatcher)
- `backend/src/services/courier/courier.test.ts` (Courier tests)
- `backend/src/services/invoice/invoice.service.ts` (PDF invoice generator using `pdf-lib`)
- `backend/src/services/invoice/invoice.test.ts` (PDF invoice generation test)
- `backend/src/services/notification/notification.interface.ts` (Notification interfaces)
- `backend/src/services/notification/email.service.ts` (Email service)
- `backend/src/services/notification/sms.service.ts` (SMS service with SSL Wireless Bangladesh mock)
- `backend/src/services/notification/notification.service.ts` (Fire-and-forget notification hub)
- `backend/src/routes/orders.ts` (Add `GET /orders/:id/invoice` endpoint)

**Out of scope**:
- Frontend admin UI for courier parcel dispatch belongs to Plan 009.

---

## Steps

### Step 1: Install `pdf-lib`

```bash
bun add pdf-lib
```

**Verify**: `backend/package.json` contains `pdf-lib`.

### Step 2: Courier Service Adapter Pattern (`src/services/courier/`)

1. **`courier.interface.ts`**:
   - `CreateParcelPayload`: `orderNumber`, `recipientName`, `recipientPhone`, `recipientAddress`, `city`, `codAmount`, `note`, `weight`.
   - `ParcelCreatedResult`: `trackingId`, `consignmentId`, `label?`.
   - `ParcelStatus`: `status`, `normalizedStatus` (`PENDING | IN_TRANSIT | OUT_FOR_DELIVERY | DELIVERED | RETURNED | CANCELLED | UNKNOWN`), `lastUpdated`.
   - `ICourierProvider`: methods `createParcel`, `trackParcel`, `cancelParcel`.

2. **`steadfast.provider.ts`**:
   - Implements `ICourierProvider`.
   - Checks `process.env.STEADFAST_API_KEY` and `process.env.STEADFAST_SECRET_KEY`.
   - If keys are missing, operates in **Mock Mode** (returns generated tracking ID `STF-MOCK-${Date.now()}` and simulated status transitions) so tests and local development run reliably without third-party network dependencies.
   - If keys exist, sends HTTP POST to Steadfast endpoint `https://portal.steadfast.com.bd/api/v1/create_order`.

3. **`courier.service.ts`**:
   - Factory class `CourierService` resolving the active provider (`new SteadfastCourierProvider()`).

4. **`courier.test.ts`**:
   - Tests parcel creation, tracking query, and mock sandbox mode.

**Verify**: `bun test src/services/courier/courier.test.ts` passes.

### Step 3: PDF Invoice Generator (`src/services/invoice/invoice.service.ts`)

1. Create `InvoiceService`:
   - Method `generateInvoicePdf(order: OrderWithItemsAndUser): Promise<Uint8Array>`:
     - Initializes `PDFDocument.create()`.
     - Page size: A4 (`595.28 x 841.89`).
     - Header: "MY OXYGEN" brand banner in `#FF6B8B` (primary pink), subtitle "Premium Mother & Baby Essentials".
     - Metadata box: Order Number, Date, Invoice Number, Payment Method (`COD` or `Online Gateway`), Payment Status.
     - Customer Box: Bill To: Name, Phone, Shipping Address.
     - Table of Items:
       - Columns: Item, Batch #, Qty, Unit Price (৳), Total (৳).
       - Perishable batches display batch number and expiry date.
     - Summary section: Subtotal, Delivery Fee (৳0 / ৳60), Coupon Discount, Grand Total (BDT `৳`).
     - Footer: "Thank you for trusting My Oxygen. Inquiries: support@myoxygen.com | +880 1700-000000".
   - Method `saveInvoiceToDisk(orderId: string, pdfBytes: Uint8Array): Promise<string>`:
     - Ensures directory `uploads/invoices` exists.
     - Writes file `uploads/invoices/invoice-${orderId}.pdf`.
     - Returns relative file path.

2. Create `src/services/invoice/invoice.test.ts`:
   - Generates an invoice and validates that the output buffer is a valid PDF (starts with `%PDF-`).

**Verify**: `bun test src/services/invoice/invoice.test.ts` passes.

### Step 4: Multi-Channel Notification Hub (`src/services/notification/`)

1. **`notification.interface.ts`**:
   - `IEmailProvider`, `ISmsProvider`, `NotificationPayload`.

2. **`email.service.ts`**:
   - Renders HTML email template with order summary and items.
   - Logs or sends via configured transport.

3. **`sms.service.ts`**:
   - Generates SMS text: `"Dear [Name], your My Oxygen order [OrderNumber] for ৳[Total] has been confirmed. Track at: myoxygen.com/orders/[OrderNumber]"`.
   - Supports SSL Wireless Bangladesh gateway format (or mock sandbox).

4. **`notification.service.ts`**:
   - `sendOrderConfirmation(payload: NotificationPayload)`:
     - Dispatches email and SMS using `Promise.allSettled()`.
     - Fire-and-forget: never throws error back to caller or aborts order placement.

**Verify**: `bun x tsc --noEmit` in `backend/` passes.

### Step 5: Add Invoice Endpoint in `backend/src/routes/orders.ts`

- Add `GET /orders/:id/invoice`:
  - Protected by `requireAuth`.
  - Checks if user owns the order or has `ORDERS_READ` permission.
  - If PDF exists, streams PDF; if not, generates PDF on the fly, caches to disk, and streams with `Content-Type: application/pdf` and `Content-Disposition: inline; filename="invoice-${orderNumber}.pdf"`.

**Verify**: `bun x tsc --noEmit` passes.

---

## Done criteria

- [ ] `bun test src/services/courier/courier.test.ts` and `src/services/invoice/invoice.test.ts` pass 100%.
- [ ] `bun x tsc --noEmit` in `backend/` exits with zero errors.
- [ ] Steadfast courier adapter supports transparent mock/sandbox mode.
- [ ] Invoices generate valid A4 PDFs using `pdf-lib` without browser/puppeteer overhead.
- [ ] Notifications run with `Promise.allSettled` fire-and-forget semantics.
- [ ] `plans/README.md` status row for Plan 008 is updated to `DONE`.

---

## STOP conditions

- If `pdf-lib` font rendering requires external font assets, use standard `StandardFonts.Helvetica` and `StandardFonts.HelveticaBold`.
