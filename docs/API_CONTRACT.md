# My Oxygen API Contract

The single reference for every HTTP endpoint the Bun + Hono backend exposes. Frontend code should be written against this document; the route files in `backend/src/routes/` are the source of truth if the two ever disagree (then fix this file).

Base URL: `NEXT_PUBLIC_API_URL` (local: `http://localhost:4000`).

## Conventions

| Topic | Rule |
|---|---|
| Success envelope | `{ "success": true, "data": T, "meta"?: {...} }` |
| Error envelope | `{ "success": false, "error": { "code": ErrorCode, "message": string, "details"?: unknown } }` |
| Pagination | Query `page` (≥1, default 1) and `limit` (1–100, default 20 unless stated). Response `meta: { page, limit, total, totalPages }`, sometimes with extra keys (`facets`, `summary`). |
| Money | JSON numbers in BDT (৳), 2 decimals. Never strings. |
| Time | Timestamps are ISO-8601 strings. Calendar dates are `YYYY-MM-DD`. "Today" means today in `Asia/Dhaka` (`APP_TIMEZONE`). |
| Query booleans | Only `true`, `false`, `1`, `0`. |
| Auth | `Authorization: Bearer <accessToken>`. Access tokens live 15 minutes; renew with `POST /auth/refresh`. Tokens carry issuer `my-oxygen-api`, audience `my-oxygen`. |
| Caching | Anonymous `GET /catalog/*` responses are cached in-process (`X-Cache: HIT|MISS`). Any request with `Authorization` bypasses the cache. |

### Error codes

| Code | HTTP | Typical cause |
|---|---|---|
| `VALIDATION_ERROR` | 422 | Body, query or param failed Zod validation. `details = { target?, formErrors, fieldErrors }` |
| `BAD_REQUEST` | 400 | Malformed JSON, invalid reference |
| `UNAUTHORIZED` | 401 | Missing, expired or wrong-type token; inactive user |
| `FORBIDDEN` | 403 | Missing permission or not the owner |
| `NOT_FOUND` | 404 | Unknown resource or route |
| `CONFLICT` | 409 | Duplicate (slug, sku, code, batch), already dispatched, already inactive |
| `INSUFFICIENT_STOCK` | 409 | `details = { productId, requested, available }` |
| `INVALID_COUPON` | 422 | Checkout with an unusable coupon. `details = { reasonCode, code }` |
| `INVALID_STATUS_TRANSITION` | 409 | `details = { from, to }` |
| `RATE_LIMITED` | 429 | `Retry-After` header set |
| `SERVICE_UNAVAILABLE` | 502/503 | Courier not configured or unreachable; database down |
| `INTERNAL_ERROR` | 500 | Unexpected failure (message is generic outside development) |

### Roles and permissions

Roles: `SUPER_ADMIN`, `INVENTORY_MANAGER`, `ORDER_MANAGER`, `MARKETING_MANAGER`, `SUPPORT_STAFF`, `CUSTOMER`. `SUPER_ADMIN` has every permission. See `backend/src/lib/rbac.ts` for the full matrix; the permissions each endpoint needs are listed below.

## Shared shapes

```ts
type ShippingAddress = {
  fullName: string; phone: string;          // stored as 01XXXXXXXXX; input may be 01…, 880…, +880…, spaces/dashes allowed
  addressLine1: string; addressLine2?: string;
  city: string; district: string; postalCode: string; // 4 digits
};

type CatalogProductDTO = {
  id: string; slug: string; title: string; sku: string; brand: string | null;
  description: string; images: string[];
  category: { id: string; slug: string; name: string };
  basePrice: number; effectivePrice: number; discountAmount: number; discountPercent: number;
  activeDiscount: {
    id: string; name: string | null; type: "PERCENTAGE" | "FIXED_AMOUNT"; value: number;
    isFlashSale: boolean; endsAt: string; countdownMs: number;
  } | null;
  totalStock: number; isLowStock: boolean; isOutOfStock: boolean;
  requiresBatchTracking: boolean; earliestExpiry: string | null; // only for batch-tracked products
  isActive: boolean; createdAt: string;
  // No rating fields and no costPrice on public responses.
};

type AdminProductDTO = CatalogProductDTO & {
  costPrice: number; lowStockThreshold: number; autoDeactivatedAt: string | null;
  listingStatus: "ACTIVE" | "AWAITING_STOCK" | "INACTIVE"; updatedAt: string;
  // AWAITING_STOCK = hidden automatically at zero stock, goes live on the next batch import.
  // INACTIVE = deactivated by an admin, never re-activated automatically.
};

type BatchDTO = {
  id: string; productId: string; productTitle: string; sku: string; batchNumber: string;
  manufactureDate: string | null; expiryDate: string; initialQuantity: number; availableQuantity: number;
  daysUntilExpiry: number;
  healthStatus: "EXPIRED" | "EXPIRING_SOON" | "HEALTHY"; // EXPIRED: expiry ≤ today; EXPIRING_SOON: ≤ today+30 days and has stock
  createdAt: string; updatedAt: string;
};

type ProductStockStatus = { id: string; title: string; sku: string; isActive: boolean; autoDeactivatedAt: string | null; listingStatus: AdminProductDTO["listingStatus"]; totalStock: number };

type DiscountDTO = {
  id: string; kind: "AUTOMATIC" | "COUPON"; code: string | null; name: string | null;
  type: "PERCENTAGE" | "FIXED_AMOUNT"; value: number; scope: "PRODUCT" | "CATEGORY" | "STORE";
  productId: string | null; categoryId: string | null;
  product: { id: string; title: string; slug: string } | null;
  category: { id: string; name: string; slug: string } | null;
  minOrderAmount: number | null; maxDiscountAmount: number | null;
  usageLimit: number | null; usageCount: number; perCustomerLimit: number | null;
  startsAt: string; endsAt: string; isFlashSale: boolean; isActive: boolean;
  status: "SCHEDULED" | "ACTIVE" | "EXPIRED" | "DISABLED"; countdownMs: number;
  createdAt: string; updatedAt: string;
};

type OrderStatus = "PENDING" | "PROCESSING" | "SHIPPED" | "DELIVERED" | "CANCELLED" | "REFUNDED";
type PaymentMethod = "COD" | "ONLINE_GATEWAY";            // requests may send "CASH_ON_DELIVERY" → stored as COD
type PaymentStatus = "UNPAID" | "PAID" | "REFUNDED" | "FAILED";

type OrderItemDTO = { // one row per batch the stock came from
  id: string; productId: string; productTitle: string;
  productSlug: string | null; productSku: string | null; productImage: string | null;
  batchId: string | null; batchNumber: string | null; batchExpiryDate: string | null;
  quantity: number; unitPrice: number; totalPrice: number; // unitPrice = effective price actually charged
};

type OrderStatusHistoryEntryDTO = {
  id: string; fromStatus: OrderStatus | null; toStatus: OrderStatus; note: string | null;
  changedBy: { id: string; fullName: string; role: string } | null; // null for non-staff viewers
  createdAt: string;
};

type OrderDetailDTO = {
  id: string; orderNumber: string; /* ORD-YYYYMMDD-XXXXXXXX */ userId: string;
  status: OrderStatus; paymentMethod: PaymentMethod; paymentStatus: PaymentStatus;
  shippingAddress: ShippingAddress;
  subtotal: number; deliveryFee: number; discountAmount: number; total: number; couponCode: string | null;
  courierProvider: string | null; trackingId: string | null;
  invoiceUrl: string; // API path "/orders/{id}/invoice" — prefix with the API base URL
  createdAt: string; updatedAt: string; shippedAt: string | null; deliveredAt: string | null; cancelledAt: string | null;
  customer: { id: string; fullName: string; email: string | null; phone: string };
  items: OrderItemDTO[]; statusHistory: OrderStatusHistoryEntryDTO[];
  allowedTransitions: OrderStatus[]; canCancel: boolean; // canCancel: owner and PENDING
};

type OrderSummaryDTO = {
  id: string; orderNumber: string; status: OrderStatus; paymentMethod: PaymentMethod; paymentStatus: PaymentStatus;
  subtotal: number; deliveryFee: number; discountAmount: number; total: number;
  itemCount: number; // sum of quantities
  items: { productId: string; productTitle: string; productImage: string | null; quantity: number }[]; // merged per product
  trackingId: string | null; createdAt: string; updatedAt: string;
};

type AdminOrderListItemDTO = {
  id: string; orderNumber: string; status: OrderStatus; paymentMethod: PaymentMethod; paymentStatus: PaymentStatus;
  subtotal: number; deliveryFee: number; discountAmount: number; total: number; itemCount: number; couponCode: string | null;
  courierProvider: string | null; trackingId: string | null; shippingAddress: ShippingAddress;
  customer: { id: string; fullName: string; email: string | null; phone: string };
  items: OrderItemDTO[]; allowedTransitions: OrderStatus[];
  createdAt: string; updatedAt: string; shippedAt: string | null; deliveredAt: string | null; cancelledAt: string | null;
};

type CouponPreviewDTO = {
  valid: boolean; code: string;
  reasonCode: "NOT_FOUND" | "INACTIVE" | "NOT_STARTED" | "EXPIRED" | "NOT_APPLICABLE" | "MIN_ORDER_NOT_MET"
            | "USAGE_LIMIT_REACHED" | "PER_CUSTOMER_LIMIT_REACHED" | null;
  reason: string | null;
  couponType: "PERCENTAGE" | "FIXED_AMOUNT" | null; couponValue: number | null;
  scope: "ORDER" | "PRODUCT" | "CATEGORY" | null;
  minOrderAmount: number | null; maxDiscountAmount: number | null;
  subtotal: number; eligibleSubtotal: number; discountAmount: number; deliveryFee: number; total: number;
};

type ParcelDTO = {
  provider: string; trackingId: string; consignmentId: string | null; rawStatus: string | null;
  normalizedStatus: "PENDING" | "IN_TRANSIT" | "OUT_FOR_DELIVERY" | "ON_HOLD" | "APPROVAL_PENDING" | "DELIVERED"
                  | "PARTIALLY_DELIVERED" | "RETURNED" | "CANCELLED" | "UNKNOWN";
  labelUrl: string | null;
};

type OrderTrackingDTO = {
  orderId: string; orderNumber: string; status: OrderStatus; courierProvider: string | null; trackingId: string | null;
  shippedAt: string | null; deliveredAt: string | null; cancelledAt: string | null;
  history: OrderStatusHistoryEntryDTO[];
  courier: { provider: string; trackingId: string; rawStatus: string | null; normalizedStatus: ParcelDTO["normalizedStatus"]; checkedAt: string } | null;
  courierError: string | null;
};
```

## Order lifecycle

| From | Allowed next statuses |
|---|---|
| PENDING | PROCESSING, CANCELLED |
| PROCESSING | SHIPPED, CANCELLED |
| SHIPPED | DELIVERED, CANCELLED |
| DELIVERED | REFUNDED |
| CANCELLED, REFUNDED | none (final) |

- Customers may cancel only while PENDING.
- Cancelling restores stock exactly once and gives the coupon use back.
- A COD order that is UNPAID becomes PAID on DELIVERED; REFUNDED sets payment status REFUNDED.
- Courier dispatch requires PROCESSING. The UI must move a PENDING order to PROCESSING first.
- Delivery fee: ৳60 when the subtotal (effective prices, before coupon) is below ৳1,500; free at or above.

## Auth (`/auth`)

Credential endpoints (`login`, `register`, `refresh`) are rate-limited to 15 requests per minute per IP.

| Method & path | Auth | Body | Response `data` |
|---|---|---|---|
| `POST /auth/register` | public | `{ fullName (2–255), phone (Bangladeshi mobile: 01…, 880…, +880…, spaces/dashes allowed; stored as 01XXXXXXXXX), email?: string\|null, password (8–72) }` | 201 `{ accessToken, refreshToken, user: PublicUser }` — 409 on duplicate phone/email |
| `POST /auth/login` | public | `{ identifier (email, or phone in any accepted format), password }` | `{ accessToken, refreshToken, user: PublicUser }` — 401 "Invalid credentials" |
| `POST /auth/refresh` | public | `{ refreshToken }` | `{ accessToken }` — 401 if not a valid refresh token |
| `GET /auth/me` | bearer | — | `PublicUser & { createdAt }` |

`PublicUser = { id, fullName, phone, email: string | null, role: Role }`

## Public catalog

| Method & path | Notes |
|---|---|
| `GET /catalog/categories` | Cached 300 s. `data: [{ id, name, slug, iconUrl: string\|null, parentId: string\|null, sortOrder, productCount }]`, active only, sorted by `sortOrder` then `name`. |
| `GET /catalog/products` | Cached 60 s. Query below. `data: CatalogProductDTO[]`, `meta: { page, limit, total, totalPages, facets: { brands: [{ value, count }], categories: [{ id, slug, name, count }], priceRange: { min, max } \| null } }`. Each facet ignores its own filter. |
| `GET /catalog/products/:idOrSlug` | `[A-Za-z0-9-]{1,255}` else 422; inactive/missing → 404. `data: CatalogProductDTO & { batchSummary: [{ batchNumber, expiryDate, availableQuantity, daysUntilExpiry }] (FEFO order, sellable only), relatedProducts: CatalogProductDTO[] (≤4) }` |
| `GET /catalog/flash-sales` | Cached 30 s. `data: [{ id, name, type, value, scope, productId, categoryId, product: CatalogProductDTO\|null, category: { id, slug, name }\|null, startsAt, endsAt, countdownMs }]`, running automatic flash sales only, soonest-ending first. |

`GET /catalog/products` query:

| Param | Rule |
|---|---|
| `q` | ≤100 chars. Substring match plus trigram word similarity (≥3 chars). Tolerates a missing letter; transposed letters in short words don't match. |
| `category` | Slug; includes direct sub-categories; unknown → 404. (`categorySlug` is a deprecated alias.) |
| `brand` | Repeat or comma-separate, ≤20, case-insensitive. |
| `minPrice`, `maxPrice` | Against the effective price; min > max → 422. |
| `inStockOnly` | boolean |
| `includeInactive` | Needs a bearer token with `PRODUCTS_READ` (401/403 otherwise). |
| `sort` | `relevance \| price_asc \| price_desc \| newest \| popular`. Default `relevance` with `q`, else `newest`. Price sorts use the effective price; `popular` = units sold. |
| `page`, `limit` | `limit` 1–100, default 24. |

## Customer orders (`/orders`)

| Method & path | Auth | Request | Response |
|---|---|---|---|
| `POST /orders/checkout` | bearer | `{ shippingAddress, items: [{ productId: uuid, quantity: 1–1000 }] (1–100 lines, duplicates merged), paymentMethod, couponCode?: 1–64 }` | 201 `OrderDetailDTO`. Errors: 422 VALIDATION_ERROR, 422 INVALID_COUPON, 409 INSUFFICIENT_STOCK, 409 CONFLICT `{ unavailableProductIds }` |
| `POST /orders/validate-coupon` | public (bearer optional, enables per-customer check) | `{ code: 1–64, items: same as checkout (≥1) }` | 200 `CouponPreviewDTO` (unusable coupon is still 200 with `valid: false`). 30 req/min per IP. |
| `GET /orders/my-orders` | bearer | `page`, `limit` | `OrderSummaryDTO[]` newest first + `meta` |
| `GET /orders/:idOrNumber` | owner or `ORDERS_READ` | UUID or order number | `OrderDetailDTO` |
| `GET /orders/:id/invoice` | owner or `ORDERS_READ` | UUID or order number | `application/pdf`, inline; generated on first request |
| `POST /orders/:id/cancel` | owner, PENDING only | `{ reason?: ≤300 }` | `OrderDetailDTO`; 409 INVALID_STATUS_TRANSITION otherwise |
| `GET /orders/:orderNumber/track` | owner or `ORDERS_READ` | — | `OrderTrackingDTO` |

## Admin: products and discounts

| Method & path | Permission | Request | Response |
|---|---|---|---|
| `GET /admin/catalog/products` | `PRODUCTS_READ` | `page`, `limit`, `q`, `category` (slug or UUID), `brand`, `status=all\|active\|inactive\|awaiting_stock`, `stock=all\|in_stock\|low\|out`, `sort=newest\|oldest\|title_asc\|title_desc\|price_asc\|price_desc\|stock_asc\|stock_desc` | `AdminProductDTO[]` + `meta` |
| `GET /admin/catalog/products/:id` | `PRODUCTS_READ` | UUID | `AdminProductDTO & { batches: BatchDTO[] }` |
| `POST /admin/catalog/products` | `PRODUCTS_WRITE` | Strict body (unknown keys → 422): `{ categoryId: uuid, title: 2–255, slug?: kebab ≤200 (auto from title), sku: 2–64 [A-Z0-9_-] (stored upper-case), brand?: string\|null, description, basePrice > 0, costPrice ≥ 0 (number or numeric string, ≤2 decimals), images?: ≤12 http(s) URLs or /images/... paths, requiresBatchTracking?, lowStockThreshold?: 0–100000 (default 5), isActive? }` | 201 `AdminProductDTO`. New products have no stock → `listingStatus: AWAITING_STOCK` until the first batch import. 409 duplicate slug/sku. |
| `PATCH /admin/catalog/products/:id` | `PRODUCTS_WRITE` | Any subset of create fields (≥1). `slug`/`sku` only if unchanged (else 422). `isActive: true` re-activates (ACTIVE or AWAITING_STOCK); `isActive: false` = manual INACTIVE. | `AdminProductDTO` |
| `DELETE /admin/catalog/products/:id` | `PRODUCTS_WRITE` | — | Soft delete → INACTIVE. Returns `AdminProductDTO`. 409 if already manually inactive. |
| `GET /admin/discounts` | `DISCOUNTS_MANAGE` | `page`, `limit`, `type=automatic\|coupon`, `active`, `status`, `discountType`, `q` (name or code), `productId`, `categoryId` | `DiscountDTO[]` newest first + `meta` |
| `GET /admin/discounts/:id` | `DISCOUNTS_MANAGE` | — | `DiscountDTO` |
| `POST /admin/discounts` | `DISCOUNTS_MANAGE` | Strict: `{ code?: 3–64\|null (null/omitted = automatic, stored upper-case), name?, type, value > 0 (≤100 for PERCENTAGE), productId? XOR categoryId? (neither = store-wide), minOrderAmount?, usageLimit?, perCustomerLimit? (coupon only), maxDiscountAmount?, startsAt? (ISO with offset, default now), endsAt (after startsAt, in the future), isFlashSale? (automatic only), isActive? }` | 201 `DiscountDTO`. 409 duplicate code. |
| `PATCH /admin/discounts/:id` | `DISCOUNTS_MANAGE` | Any subset; `code` and `usageCount` are read-only (422) | `DiscountDTO` |
| `DELETE /admin/discounts/:id` | `DISCOUNTS_MANAGE` | — | Deactivates (`status: DISABLED`); 409 if already inactive |
| `POST /admin/catalog/flash-sales` | `DISCOUNTS_MANAGE` | Alias: `{ productId?, categoryId?, name?, type?/discountType?, value, maxDiscountAmount?, startsAt?, endsAt, isFlashSale? (default true), isActive? }` | 201 `DiscountDTO` (always automatic) |

## Admin: inventory

| Method & path | Permission | Request | Response |
|---|---|---|---|
| `GET /admin/batches` | `BATCHES_MANAGE` | `page`, `limit`, `status=EXPIRED\|EXPIRING_SOON\|HEALTHY`, `q` (batch no., title, sku), `productId`, `inStockOnly` | `BatchDTO[]` in expiry order; `meta` + `summary: { EXPIRED, EXPIRING_SOON, HEALTHY }` (summary ignores `status`) |
| `POST /admin/inventory/batches` | `BATCHES_MANAGE` | Strict: `{ productId, batchNumber: 2–64 [A-Za-z0-9._/-], manufactureDate?: date\|null (≤ today, < expiry), expiryDate: date > today, initialQuantity: 1–1,000,000, note? }` | 201 `{ batch: BatchDTO, product: ProductStockStatus, ledgerEntryId, availabilityChanges: [{ productId, isActive, change: "AUTO_DEACTIVATED"\|"AUTO_REACTIVATED" }] }`. 409 duplicate batch, 404 product, 422 dates. **The only import endpoint.** |
| `POST /admin/inventory/adjust` | `STOCK_ADJUST` | Strict: `{ productId, batchId, delta: non-zero int, reason?: "MANUAL_ADJUSTMENT" (default) \| "EXPIRED_SCRAP" (negative only), note? }` | `{ batch, product, ledgerEntryId, reason, delta, previousQuantity, newQuantity, availabilityChanges }`. 409 INSUFFICIENT_STOCK below zero; 422 adding to an expired batch. |
| `GET /admin/inventory/ledger` | `STOCK_ADJUST` | `page`, `limit`, `productId`, `batchId`, `orderId`, `reason` (PURCHASE, RETURN, IMPORT, MANUAL_ADJUSTMENT/ADJUSTMENT, EXPIRED_SCRAP), `from`, `to` (date = inclusive Dhaka day, or ISO datetime) | `[{ id, productId, productTitle, sku, batchId, batchNumber, expiryDate, orderId, orderNumber, changeDelta, balanceAfter, reason, note, performedBy: { id, fullName, role }\|null, createdAt }]` newest first + `meta`. **The only ledger endpoint.** |
| `GET /admin/inventory/low-stock` | `PRODUCTS_READ` | `page`, `limit` | `[{ productId, title, slug, sku, totalStock, lowStockThreshold, isOutOfStock, isActive, autoDeactivatedAt, listingStatus, earliestExpiry }]` lowest first + `meta` |
| `GET /admin/inventory/expiring-soon` | `BATCHES_MANAGE` | `days` (1–365, default 30), `page`, `limit` | `BatchDTO[]` + `meta` |

Removed (now 404): `POST /admin/batches`, `GET /admin/inventory/logs`, `GET /admin/inventory/batches`, `GET /admin/inventory/batches/:productId`, `PUT /admin/catalog/products/:id`, and all `/inventory/*` paths.

## Admin: orders, fulfilment, invoices, analytics

| Method & path | Permission | Request | Response |
|---|---|---|---|
| `GET /admin/analytics/summary` | `ANALYTICS_READ` | `from?`, `to?` (inclusive dates, ≤366 days) | `{ range: { from, to, timezone }, totalRevenue, totalOrders, revenueOrderCount, avgOrderValue, revenueTrendPercent: number\|null, ordersByStatus: Record<OrderStatus, number>, recentOrders: [{ id, orderNumber, customerName, customerPhone, status, paymentMethod, total, itemCount, createdAt }] (5), topProducts: [{ productId, title, sku, unitsSold, revenue }] (5), dailyRevenue: [{ date, revenue, orderCount }], lowStockCount, expiringSoonCount }`. Revenue excludes CANCELLED/REFUNDED, includes delivery fees. |
| `GET /admin/orders` | `ORDERS_READ` | `page`, `limit` (default 20), `status` (enum or `ALL`), `q` (≤100: order no., names, phones in any format, email), `from`, `to` | `AdminOrderListItemDTO[]` + `meta` |
| `PATCH /admin/orders/:id/status` | `ORDERS_STATUS_UPDATE` (+ `REFUNDS_APPROVE` for REFUNDED) | `{ status, note?: ≤500, courierCancellationConfirmed?: boolean, courierProvider?: 2–64, trackingId?: 1–128 }` — `courierProvider`+`trackingId` together, only with SHIPPED (manual shipment) | `OrderDetailDTO`. 409 INVALID_STATUS_TRANSITION `{ from, to }`; 409 CONFLICT `{ courierCancellation }` when cancelling a SHIPPED order the courier can't confirm — retry with `courierCancellationConfirmed: true`. |
| `POST /admin/orders/:id/dispatch-courier` | `COURIER_ASSIGN` | `{ weightKg?: ≤50, note?: ≤250 }` (provider comes from `COURIER_PROVIDER`) | `{ order: OrderDetailDTO, parcel: ParcelDTO }`. 409 unless PROCESSING; 409 already dispatched; 503 courier not configured; 502 courier rejected/unreachable; 500 booked-but-not-saved (compensation attempted). |
| `GET /admin/orders/:id/tracking` | `ORDERS_READ` | — | `OrderTrackingDTO` |
| `GET /admin/invoices` | `ORDERS_READ` | `page`, `limit`, `q`, `paymentStatus`, `paymentMethod` (`ALL` = no filter), `from`, `to` | `[{ id, invoiceNumber, orderId, orderNumber\|null, userId\|null, customerName, customerPhone, customerAddress, paymentMethod, paymentStatus, subtotal, discountAmount, deliveryFee, totalAmount, itemCount, hasPdf, createdAt, updatedAt }]` + `meta` |
| `GET /admin/invoices/summary` | `ORDERS_READ` | — | `{ totalInvoices, totalBilledAmount, codCount, onlineCount }` |
| `GET /admin/invoices/:id` | `ORDERS_READ` | UUID or invoice number | list item + `items: [{ orderItemId, productId, title, sku, batchNumber, expiryDate, quantity, unitPrice, totalPrice }]`, `order: { id, orderNumber, status, paymentStatus, trackingId, courierProvider, createdAt } \| null` |
| `GET /admin/invoices/:id/pdf` | `ORDERS_READ` | — | PDF stream. Generates a missing PDF only for `INVOICE_GENERATE`; others get 404. |
| `POST /admin/invoices/generate/:orderId` | `INVOICE_GENERATE` | — | Regenerates; returns the invoice detail |

## Platform

| Method & path | Notes |
|---|---|
| `GET /health` | 200 `{ status: "UP", database: "CONNECTED", latencyMs, uptime, timestamp }`; 503 `{ status: "DOWN", database: "DISCONNECTED" }` |

## Background jobs

With `REDIS_URL` set, jobs run on BullMQ (worker inside the API process). Without it, an in-process queue with the same retry policy is used (development only: jobs are lost on restart). Jobs: `send-order-notification` (email + SMS per order event), `generate-invoice`, `inventory-digest` (08:00 `APP_TIMEZONE`, to `ADMIN_ALERT_EMAIL`), plus the nightly expiry scan at 02:00 `APP_TIMEZONE`. Missing provider keys log `skipped: not configured`; nothing is reported as sent unless it was.

---

## Admin v2 (dashboard, reports, management)

Added for the admin redesign. Conventions above apply. Unless stated, `from`/`to` are inclusive `YYYY-MM-DD` business dates (Asia/Dhaka), max span 366 days; the **previous period** is the same number of days immediately before `from`. "Revenue" everywhere means what customers paid (order `total`, including delivery fees) for orders **not** CANCELLED or REFUNDED. Series use `granularity: "day"` when the range is ≤ 92 days, otherwise `"month"`.

```ts
type Kpi = { value: number; previous: number; changePercent: number | null }; // null when previous = 0
type SeriesPoint = { period: string /* YYYY-MM-DD or YYYY-MM */; label: string /* "Sep 26" or "Sep 2026" */ };
type ExpenseCategory = "SHIPPING" | "MARKETING" | "DELIVERY_SUBSIDY" | "PACKAGING" | "SALARIES" | "RENT" | "UTILITIES" | "OTHER";
type CostBreakdown = { supplierPrice: number; shipping: number; customsDuty: number; packaging: number; other: number }; // landed cost = sum
```

### Dashboard & activity (ANALYTICS_READ)

`GET /admin/analytics/summary?from&to` is **extended** (all existing fields stay). Default range: last 7 days ending today.

```ts
{
  ...existingTelemetryFields, // totalRevenue, totalOrders, ordersByStatus, recentOrders, topProducts, dailyRevenue, lowStockCount, expiringSoonCount, ...
  range: { from: string; to: string; timezone: string; previousFrom: string; previousTo: string; granularity: "day" | "month" };
  kpis: {
    revenue: Kpi; orders: Kpi;
    customers: Kpi;      // total CUSTOMER accounts at `to` vs at previousTo
    newCustomers: Kpi; productsSold: Kpi /* units */; avgOrderValue: Kpi;
  };
  revenueSeries: Array<SeriesPoint & { revenue: number; orders: number }>; // every bucket present, zeros included
  ordersByStatus: Record<OrderStatus, number>; // within range
  recentOrders: Array<{ id; orderNumber; customerName; customerPhone; status; paymentMethod; total; itemCount; createdAt; firstItemImage: string | null }>; // latest 5 overall
  topProducts: Array<{ productId; title; slug; sku; image: string | null; categoryName: string | null; unitsSold; revenue }>; // top 5 in range
  salesByCategory: Array<{ categoryId; name; slug; revenue; unitsSold; sharePercent }>; // in range, desc
  latestCustomers: Array<{ id; fullName; email: string | null; phone; createdAt }>; // 5 newest CUSTOMER accounts
  lowStockProducts: Array<{ productId; title; slug; image: string | null; totalStock; lowStockThreshold }>; // 5 lowest
}
```

`GET /admin/analytics/activity?limit=10` (1–50) returns `Array<{ id: string; type: "ORDER_PLACED" | "ORDER_STATUS_CHANGED" | "PAYMENT_RECEIVED" | "CUSTOMER_REGISTERED" | "STOCK_IMPORTED" | "STOCK_SCRAPPED" | "DISCOUNT_CREATED"; title: string; description: string | null; at: string; href: string | null /* admin route */ }>`, newest first, built only from real rows (orders, order_status_history, users, stock_history_logs, discounts).

### Reports

- `GET /admin/reports/products?from&to&q&categoryId&sort&page&limit` (ANALYTICS_READ): `Array<{ productId; title; sku; slug; image; category: { id; name } | null; unitsSold; revenue; ordersCount; avgSellingPrice; currentStock; lastSoldAt: string | null; isActive }>`. `sort` = `revenue_desc` (default) | `units_desc` | `title_asc` | `stock_asc`. `meta` = pagination + `totals: { unitsSold; revenue }`.
- `GET /admin/reports/customers?from&to&page&limit` (ANALYTICS_READ): `{ kpis: { totalCustomers: Kpi; newCustomers: Kpi; returningCustomers: Kpi /* ≥2 orders in range */; repeatRatePercent: number; avgOrderValue: Kpi }; signupSeries: Array<SeriesPoint & { count }>; byDistrict: Array<{ district; orders; revenue }> /* top 10 */; topCustomers: Array<{ id; fullName; phone; email; orders; totalSpent; lastOrderAt }> }`. `meta` paginates `topCustomers`.
- `GET /admin/reports/inventory` (ANALYTICS_READ): `{ totals: { productCount; activeCount; stockUnits; stockValueCost; stockValueRetail }; byCategory: Array<{ categoryId; name; stockUnits; valueCost; valueRetail }>; lowStock: Array<{ productId; title; image; totalStock; lowStockThreshold; listingStatus }>; expiringSoon: BatchDTO[] /* ≤30 days, with stock */; deadStock: Array<{ productId; title; image; totalStock; lastSoldAt: string | null; daysSinceLastSale: number | null }> /* stock > 0, no sale in 60 days */ }`.
- `GET /admin/reports/profit?from&to` (**SUPER_ADMIN**): `{ range; kpis: { revenue: Kpi; cogs: Kpi; grossProfit: Kpi; grossMarginPercent: Kpi; expenses: Kpi; netProfit: Kpi; netMarginPercent: Kpi }; trend: Array<SeriesPoint & { revenue; cost; profit; marginPercent }>; byCategory: Array<{ categoryId; name; revenue; cost; profit; marginPercent }>; topProfitable: Array<{ productId; title; image; profit; marginPercent }> /* 5 */; expenseBreakdown: Array<{ key: "PRODUCT_COST" | ExpenseCategory; label; amount; percent }> }`. COGS = Σ `order_items.unit_cost × quantity`; gross profit = revenue − COGS; net profit = gross profit − expenses in range.
- `GET /admin/reports/profit/products?from&to&q&categoryId&sort&page&limit` (**SUPER_ADMIN**): `Array<{ productId; title; sku; image; category: { id; name } | null; sellingPrice /* avg realised unit price, or current effective price when unsold */; avgCost /* avg unit_cost, or current costPrice when unsold */; profitPerUnit; marginPercent; unitsSold; revenue; cogs; profit; isActive }>`. `sort` = `margin_desc` (default) | `margin_asc` | `profit_desc` | `revenue_desc`.
- `GET /admin/reports/profit/products/:id?from&to` (**SUPER_ADMIN**): `{ product: { id; title; sku; image; category; isActive }; range; unitsSold; revenue; cogs; grossProfit; marginPercent; costBreakdown: (CostBreakdown & { landedCost }) | null; pricing: { basePrice; avgDiscountPerUnit; netSellingPrice; profitPerUnit; marginPercent } }`.

### Expenses (SUPER_ADMIN)

`ExpenseDTO = { id; category: ExpenseCategory; amount; incurredOn: "YYYY-MM-DD"; vendor: string | null; note: string | null; createdBy: { id; fullName } | null; createdAt; updatedAt }`

- `GET /admin/expenses?from&to&category&page&limit` returns `ExpenseDTO[]`, `meta` + `totalAmount` + `byCategory: Array<{ category; count; amount }>` (totals per category for the date range, ignoring the category filter, largest first, non-zero only).
- `POST /admin/expenses` `{ category, amount > 0, incurredOn ≤ today, vendor?: ≤120, note?: ≤500 }` returns 201 `ExpenseDTO`.
- `PATCH /admin/expenses/:id` (any subset) returns `ExpenseDTO`. `DELETE /admin/expenses/:id` returns 204.

### Products: cost breakdown

`AdminProductDTO` gains `costBreakdown: CostBreakdown | null`. `POST/PATCH /admin/catalog/products` accept `costBreakdown` (each ≥ 0); when present the server sets `costPrice` to its sum (sending a different `costPrice` alongside is a 422). `order_items.unit_cost` snapshots the product's `costPrice` at checkout (existing rows were backfilled with the cost price current at migration time).

### Payments and search

- `GET /admin/payments/summary?from&to` (ORDERS_READ): `{ collected /* PAID */; pendingCod /* COD, UNPAID, not cancelled/refunded */; refunded; failed; byMethod: Array<{ method: PaymentMethod; orders; amount }>; byStatus: Array<{ status: PaymentStatus; orders; amount }> }`.
- `GET /admin/orders` gains filters `paymentStatus` and `paymentMethod` (or `ALL`), `courier` (provider, case-insensitive; `unknown` = no courier recorded) and `dateField` = `createdAt` (default) | `shippedAt` | `deliveredAt`, which selects the timestamp the `from`/`to` range filters on.
- `GET /admin/search?q=` (any staff role; `q` ≥ 2 chars): `{ products: Array<{ id; title; sku; image; href }>; orders: Array<{ id; orderNumber; customerName; total; status; href }>; customers: Array<{ id; fullName; phone; email; href }> }`, ≤5 each. Groups the caller lacks permission for are empty (products: PRODUCTS_READ; orders and customers: ORDERS_READ). `href` is an admin route.

### Management

- `GET /admin/customers?q&sort&page&limit` (ORDERS_READ): `sort` = `newest` (default) | `spend_desc` | `orders_desc`. `Array<{ id; fullName; phone; email; isActive; createdAt; ordersCount; totalSpent; lastOrderAt: string | null }>` + `meta`.
- `GET /admin/customers/:id` (ORDERS_READ): `{ customer: { id; fullName; phone; email; isActive; createdAt }; stats: { ordersCount; totalSpent; avgOrderValue; firstOrderAt; lastOrderAt }; recentOrders: OrderSummaryDTO[] /* 10 */; addresses: ShippingAddress[] /* distinct, ≤5 */ }`.
- `PATCH /admin/customers/:id` (STAFF_MANAGE): `{ isActive }`, CUSTOMER accounts only; returns the customer object.
- `GET /admin/catalog/categories` (PRODUCTS_READ): `Array<{ id; name; slug; iconUrl; parentId; sortOrder; isActive; productCount; activeProductCount; createdAt; updatedAt }>`, inactive included.
- `POST /admin/catalog/categories` (PRODUCTS_WRITE): `{ name 2–255, slug? (kebab, auto from name), iconUrl?: URL or /icons/... path, parentId?, sortOrder?, isActive? }` returns 201; 409 on duplicate slug.
- `PATCH /admin/catalog/categories/:id` (PRODUCTS_WRITE): any subset; slug is immutable.
- `DELETE /admin/catalog/categories/:id` (PRODUCTS_WRITE): deactivates; 409 while it has active products.
- `GET /admin/catalog/brands` (PRODUCTS_READ): `Array<{ name; productCount; activeProductCount; unitsSold30d }>`.
- `PATCH /admin/catalog/brands` (PRODUCTS_WRITE): `{ from, to }` renames the brand on every product; returns `{ updated: number }`.
- `GET /admin/staff` (STAFF_MANAGE): `Array<{ id; fullName; email; phone; role; isActive; createdAt }>` for non-CUSTOMER users.
- `POST /admin/staff` (STAFF_MANAGE): `{ fullName, email, phone (BD mobile), role (staff role), password ≥ 12 }` returns 201.
- `PATCH /admin/staff/:id` (STAFF_MANAGE): `{ fullName?, role?, isActive? }`; 409 when it would demote or deactivate yourself, or remove the last active SUPER_ADMIN.
- `GET /admin/roles` (STAFF_MANAGE): `Array<{ role; permissions: Permission[]; userCount }>`.
- `GET /admin/system/status` (STAFF_MANAGE): `{ api: { status: "UP"; uptimeSeconds; nodeEnv; timezone; version }; database: { status: "CONNECTED" | "DISCONNECTED"; latencyMs: number | null; migrationsApplied }; jobs: { queue: "bullmq" | "in-process"; redisConfigured }; integrations: { courier: { provider; configured }; sms: { configured }; email: { configured } }; cache: { entries } }`. Never secrets.
- `GET /admin/delivery/summary?from&to` (ORDERS_READ): `{ readyToShip /* PROCESSING */; inTransit /* SHIPPED */; deliveredInRange; cancelledAfterShipping; avgDeliveryHours: number | null /* shipped→delivered, in range */; byCourier: Array<{ provider; inTransit; delivered }> }`.

### Admin v2 implementation notes

Behaviour the tables above leave open, as implemented:

- **Default ranges.** The dashboard summary defaults to the last 7 days; reports, payments and the delivery summary default to the last 30. If only one of `from`/`to` is sent, the other is derived. Spans over 366 days are a 422.
- **Order counts.** `kpis.orders` and `revenueSeries.orders` count every order placed in the range, in any status. The legacy `dailyRevenue` now follows the resolved range and its `orderCount` counts revenue orders only.
- **Product and category revenue** = line total minus that line's proportional share of the order's coupon discount. Delivery fees are not attributed to products, so category totals = revenue − delivery fees.
- **Margins.** `grossMarginPercent` and `netMarginPercent` are profit ÷ revenue × 100 (0 when revenue is 0); their `changePercent` is the relative change of the percentage, not percentage points.
- **Profit product detail.** `netSellingPrice` is the average realised unit price, `avgDiscountPerUnit` = basePrice − netSellingPrice, and `profitPerUnit` uses the product's current landed cost. The list's `avgCost` uses the historical `unit_cost` snapshots.
- **expenseBreakdown** lists PRODUCT_COST plus every non-zero expense category, sorted by amount; `percent` is of COGS + expenses.
- **Payments.** Both breakdowns list every enum value (zeros included). `byMethod` excludes CANCELLED orders; `byStatus` excludes only cancelled orders that are still UNPAID, so its PAID / REFUNDED / FAILED rows equal `collected` / `refunded` / `failed`.
- **Inventory report.** Retail value uses `basePrice`; each list is capped at 100 rows; deadStock includes products never sold. The products report's `lastSoldAt` is all-time.
- **Customers report** counts CUSTOMER accounts only; returning = 2+ revenue orders in the range.
- **Activity.** ORDER_STATUS_CHANGED skips the initial placed row; PAYMENT_RECEIVED is the DELIVERED event of a paid COD order. Links: discounts `/admin/discounts?discountId=`, stock events `/admin/products?productId=`.
- **costBreakdown.** On create, `costPrice` may be omitted when a breakdown is sent; omitted components count as 0; unknown keys are a 422. PATCHing `costPrice` alone on a product that has a breakdown is a 422 unless it equals the sum.
- **Search** returns 403 for customers; `q` is 2–100 characters; phones match in any accepted format.
- **System status.** `database.migrationsApplied` is `null` when DISCONNECTED and `0` when the migrations table is missing; the response is `Cache-Control: no-store`.
- **Categories.** DELETE returns 200 with the category (409 if already inactive). Deactivating (DELETE or `PATCH isActive:false`) is a 409 while the category has ACTIVE or AWAITING_STOCK products (`details.listedProductCount`). Resending the current slug is accepted; changing it is a 422; a name without latin letters needs an explicit slug. Unknown parent, self-parenting or a cycle is a 422 on `parentId`.
- **Brands** are listed by exact spelling (so "Nivea" and "nivea" can be merged by a rename); a case-only rename is allowed.
- **Delivery summary.** `byCourier.inTransit` is live (current SHIPPED) and `delivered` is in range; orders without a courier are grouped as `"unknown"`.
- **Roles** returns all 6 roles (CUSTOMER with no permissions); `userCount` includes inactive accounts.
- **Staff.** Email is required; passwords are 12–72 bytes; duplicates are 409 with `details.field` = `email` | `phone`; PATCH conflicts are 409 with `details.reason` = `SELF_ROLE_CHANGE` | `SELF_DEACTIVATION` | `LAST_SUPER_ADMIN`.
- **Customers.** `GET /admin/customers/:id` is 404 for staff ids; `avgOrderValue` = spend ÷ non-cancelled, non-refunded orders; addresses are de-duplicated ignoring case and whitespace, most recent first; search also matches partial phone digits.
