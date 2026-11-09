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
