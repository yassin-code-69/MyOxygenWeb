/**
 * Back-office (admin portal) DTOs — mirror `docs/API_CONTRACT.md` exactly.
 *
 * Every name is prefixed with `Admin` (except `BatchHealthStatus`, which the
 * shared `StatusBadge` imports) so the `types/index.ts` barrel never collides
 * with storefront / checkout types.
 */
import type { OrderStatus, PaymentMethod, PaymentStatus, ShippingAddress } from "./order";

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

export type AdminDiscountType = "PERCENTAGE" | "FIXED_AMOUNT";

/** AWAITING_STOCK = hidden automatically at zero stock; INACTIVE = deactivated by an admin. */
export const ADMIN_LISTING_STATUSES = ["ACTIVE", "AWAITING_STOCK", "INACTIVE"] as const;
export type AdminListingStatus = (typeof ADMIN_LISTING_STATUSES)[number];

export interface AdminActiveDiscount {
  id: string;
  name: string | null;
  type: AdminDiscountType;
  value: number;
  isFlashSale: boolean;
  endsAt: string;
  countdownMs: number;
}

export interface AdminProductDTO {
  id: string;
  slug: string;
  title: string;
  sku: string;
  brand: string | null;
  description: string;
  images: string[];
  category: { id: string; slug: string; name: string };
  basePrice: number;
  effectivePrice: number;
  discountAmount: number;
  discountPercent: number;
  activeDiscount: AdminActiveDiscount | null;
  totalStock: number;
  isLowStock: boolean;
  isOutOfStock: boolean;
  requiresBatchTracking: boolean;
  earliestExpiry: string | null;
  isActive: boolean;
  createdAt: string;
  costPrice: number;
  lowStockThreshold: number;
  autoDeactivatedAt: string | null;
  listingStatus: AdminListingStatus;
  updatedAt: string;
}

export interface AdminProductDetailDTO extends AdminProductDTO {
  batches: AdminBatchDTO[];
}

export const ADMIN_PRODUCT_STATUS_FILTERS = ["all", "active", "inactive", "awaiting_stock"] as const;
export type AdminProductStatusFilter = (typeof ADMIN_PRODUCT_STATUS_FILTERS)[number];

export const ADMIN_STOCK_FILTERS = ["all", "in_stock", "low", "out"] as const;
export type AdminStockFilter = (typeof ADMIN_STOCK_FILTERS)[number];

export const ADMIN_PRODUCT_SORTS = [
  "newest",
  "oldest",
  "title_asc",
  "title_desc",
  "price_asc",
  "price_desc",
  "stock_asc",
  "stock_desc",
] as const;
export type AdminProductSort = (typeof ADMIN_PRODUCT_SORTS)[number];

/** Body of `POST /admin/catalog/products` (strict). */
export interface AdminProductCreatePayload {
  categoryId: string;
  title: string;
  slug?: string;
  sku: string;
  brand?: string | null;
  description: string;
  basePrice: number;
  costPrice: number;
  images?: string[];
  requiresBatchTracking?: boolean;
  lowStockThreshold?: number;
  isActive?: boolean;
}

/** Body of `PATCH /admin/catalog/products/:id` — any subset (slug/sku immutable). */
export type AdminProductUpdatePayload = Partial<Omit<AdminProductCreatePayload, "slug" | "sku">>;

/** `GET /catalog/categories` item. */
export interface AdminCategoryOption {
  id: string;
  name: string;
  slug: string;
  iconUrl: string | null;
  parentId: string | null;
  sortOrder: number;
  productCount: number;
}

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------

export type BatchHealthStatus = "EXPIRED" | "EXPIRING_SOON" | "HEALTHY";
export const BATCH_HEALTH_STATUSES = ["EXPIRED", "EXPIRING_SOON", "HEALTHY"] as const satisfies readonly BatchHealthStatus[];

export interface AdminBatchDTO {
  id: string;
  productId: string;
  productTitle: string;
  sku: string;
  batchNumber: string;
  manufactureDate: string | null;
  expiryDate: string;
  initialQuantity: number;
  availableQuantity: number;
  daysUntilExpiry: number;
  healthStatus: BatchHealthStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AdminBatchListMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  summary: Record<BatchHealthStatus, number>;
}

export interface AdminProductStockStatus {
  id: string;
  title: string;
  sku: string;
  isActive: boolean;
  autoDeactivatedAt: string | null;
  listingStatus: AdminListingStatus;
  totalStock: number;
}

export interface AdminAvailabilityChange {
  productId: string;
  isActive: boolean;
  change: "AUTO_DEACTIVATED" | "AUTO_REACTIVATED";
}

/** Body of `POST /admin/inventory/batches` (strict). */
export interface AdminImportBatchPayload {
  productId: string;
  batchNumber: string;
  manufactureDate?: string | null;
  expiryDate: string;
  initialQuantity: number;
  note?: string;
}

export interface AdminImportBatchResult {
  batch: AdminBatchDTO;
  product: AdminProductStockStatus;
  ledgerEntryId: string;
  availabilityChanges: AdminAvailabilityChange[];
}

export const ADMIN_ADJUSTMENT_REASONS = ["MANUAL_ADJUSTMENT", "EXPIRED_SCRAP"] as const;
export type AdminAdjustmentReason = (typeof ADMIN_ADJUSTMENT_REASONS)[number];

/** Body of `POST /admin/inventory/adjust` (strict). */
export interface AdminAdjustStockPayload {
  productId: string;
  batchId: string;
  delta: number;
  reason?: AdminAdjustmentReason;
  note?: string;
}

export interface AdminAdjustStockResult {
  batch: AdminBatchDTO;
  product: AdminProductStockStatus;
  ledgerEntryId: string;
  reason: AdminAdjustmentReason;
  delta: number;
  previousQuantity: number;
  newQuantity: number;
  availabilityChanges: AdminAvailabilityChange[];
}

export const ADMIN_LEDGER_REASONS = ["IMPORT", "PURCHASE", "RETURN", "MANUAL_ADJUSTMENT", "EXPIRED_SCRAP"] as const;
/** `ADJUSTMENT` is a legacy alias the API may still return for old rows. */
export type AdminLedgerReason = (typeof ADMIN_LEDGER_REASONS)[number] | "ADJUSTMENT";

export interface AdminStaffRef {
  id: string;
  fullName: string;
  role: string;
}

export interface AdminLedgerEntryDTO {
  id: string;
  productId: string;
  productTitle: string;
  sku: string;
  batchId: string | null;
  batchNumber: string | null;
  expiryDate: string | null;
  orderId: string | null;
  orderNumber: string | null;
  changeDelta: number;
  balanceAfter: number;
  reason: AdminLedgerReason;
  note: string | null;
  performedBy: AdminStaffRef | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Orders & fulfilment
// ---------------------------------------------------------------------------

/** Every order status in lifecycle order. */
export const ADMIN_ORDER_STATUSES = [
  "PENDING",
  "PROCESSING",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
  "REFUNDED",
] as const satisfies readonly OrderStatus[];

export const ADMIN_PAYMENT_STATUSES = ["UNPAID", "PAID", "REFUNDED", "FAILED"] as const satisfies readonly PaymentStatus[];
export const ADMIN_PAYMENT_METHODS = ["COD", "ONLINE_GATEWAY"] as const satisfies readonly PaymentMethod[];

export interface AdminOrderItemDTO {
  id: string;
  productId: string;
  productTitle: string;
  productSlug: string | null;
  productSku: string | null;
  productImage: string | null;
  batchId: string | null;
  batchNumber: string | null;
  batchExpiryDate: string | null;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface AdminOrderCustomer {
  id: string;
  fullName: string;
  email: string | null;
  phone: string;
}

export interface AdminOrderStatusHistoryEntry {
  id: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  note: string | null;
  changedBy: AdminStaffRef | null;
  createdAt: string;
}

/** `GET /admin/orders` list item. */
export interface AdminOrderDTO {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  subtotal: number;
  deliveryFee: number;
  discountAmount: number;
  total: number;
  itemCount: number;
  couponCode: string | null;
  courierProvider: string | null;
  trackingId: string | null;
  shippingAddress: ShippingAddress;
  customer: AdminOrderCustomer;
  items: AdminOrderItemDTO[];
  allowedTransitions: OrderStatus[];
  createdAt: string;
  updatedAt: string;
  shippedAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
}

/** `GET /orders/:id`, `PATCH /admin/orders/:id/status`. */
export interface AdminOrderDetailDTO extends Omit<AdminOrderDTO, "itemCount"> {
  userId: string;
  invoiceUrl: string;
  statusHistory: AdminOrderStatusHistoryEntry[];
  canCancel: boolean;
}

/** Body of `PATCH /admin/orders/:id/status`. */
export interface AdminOrderStatusPayload {
  status: OrderStatus;
  note?: string;
  courierCancellationConfirmed?: boolean;
  courierProvider?: string;
  trackingId?: string;
}

export type AdminParcelStatus =
  | "PENDING"
  | "IN_TRANSIT"
  | "OUT_FOR_DELIVERY"
  | "ON_HOLD"
  | "APPROVAL_PENDING"
  | "DELIVERED"
  | "PARTIALLY_DELIVERED"
  | "RETURNED"
  | "CANCELLED"
  | "UNKNOWN";

export interface AdminParcelDTO {
  provider: string;
  trackingId: string;
  consignmentId: string | null;
  rawStatus: string | null;
  normalizedStatus: AdminParcelStatus;
  labelUrl: string | null;
}

export interface AdminDispatchPayload {
  weightKg?: number;
  note?: string;
}

export interface AdminDispatchResult {
  order: AdminOrderDetailDTO;
  parcel: AdminParcelDTO;
}

export interface AdminOrderTrackingDTO {
  orderId: string;
  orderNumber: string;
  status: OrderStatus;
  courierProvider: string | null;
  trackingId: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  history: AdminOrderStatusHistoryEntry[];
  courier: {
    provider: string;
    trackingId: string;
    rawStatus: string | null;
    normalizedStatus: AdminParcelStatus;
    checkedAt: string;
  } | null;
  courierError: string | null;
}

/** `details` of the 409 CONFLICT raised when the courier cannot confirm a parcel cancellation. */
export interface AdminCourierCancellation {
  provider: string;
  trackingId: string;
  status: "CANCELLED" | "NOT_SUPPORTED" | "FAILED";
  message: string;
}

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------

export interface AdminInvoiceDTO {
  id: string;
  invoiceNumber: string;
  orderId: string;
  orderNumber: string | null;
  userId: string | null;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  subtotal: number;
  discountAmount: number;
  deliveryFee: number;
  totalAmount: number;
  itemCount: number;
  hasPdf: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdminInvoiceItem {
  orderItemId: string;
  productId: string;
  title: string;
  sku: string | null;
  batchNumber: string | null;
  expiryDate: string | null;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface AdminInvoiceDetailDTO extends AdminInvoiceDTO {
  items: AdminInvoiceItem[];
  order: {
    id: string;
    orderNumber: string;
    status: OrderStatus;
    paymentStatus: PaymentStatus;
    trackingId: string | null;
    courierProvider: string | null;
    createdAt: string;
  } | null;
}

export interface AdminInvoiceSummary {
  totalInvoices: number;
  totalBilledAmount: number;
  codCount: number;
  onlineCount: number;
}

// ---------------------------------------------------------------------------
// Discounts
// ---------------------------------------------------------------------------

export const ADMIN_DISCOUNT_STATUSES = ["SCHEDULED", "ACTIVE", "EXPIRED", "DISABLED"] as const;
export type AdminDiscountStatus = (typeof ADMIN_DISCOUNT_STATUSES)[number];
export type AdminDiscountKind = "AUTOMATIC" | "COUPON";
export type AdminDiscountScope = "PRODUCT" | "CATEGORY" | "STORE";

export interface AdminDiscountDTO {
  id: string;
  kind: AdminDiscountKind;
  code: string | null;
  name: string | null;
  type: AdminDiscountType;
  value: number;
  scope: AdminDiscountScope;
  productId: string | null;
  categoryId: string | null;
  product: { id: string; title: string; slug: string } | null;
  category: { id: string; name: string; slug: string } | null;
  minOrderAmount: number | null;
  maxDiscountAmount: number | null;
  usageLimit: number | null;
  usageCount: number;
  perCustomerLimit: number | null;
  startsAt: string;
  endsAt: string;
  isFlashSale: boolean;
  isActive: boolean;
  status: AdminDiscountStatus;
  countdownMs: number;
  createdAt: string;
  updatedAt: string;
}

/** Body of `POST /admin/discounts` (strict). */
export interface AdminDiscountCreatePayload {
  code?: string | null;
  name?: string | null;
  type: AdminDiscountType;
  value: number;
  productId?: string | null;
  categoryId?: string | null;
  minOrderAmount?: number | null;
  maxDiscountAmount?: number | null;
  usageLimit?: number | null;
  perCustomerLimit?: number | null;
  startsAt?: string;
  endsAt: string;
  isFlashSale?: boolean;
  isActive?: boolean;
}

/** Body of `PATCH /admin/discounts/:id` — `code` is read-only. */
export type AdminDiscountUpdatePayload = Partial<Omit<AdminDiscountCreatePayload, "code">>;

// ---------------------------------------------------------------------------
// Telemetry
// ---------------------------------------------------------------------------

export interface AdminDailyRevenue {
  date: string;
  revenue: number;
  orderCount: number;
}

export interface AdminRecentOrder {
  id: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  total: number;
  itemCount: number;
  createdAt: string;
}

export interface AdminTopProduct {
  productId: string;
  title: string;
  sku: string;
  unitsSold: number;
  revenue: number;
}

/** `GET /admin/analytics/summary`. Revenue excludes CANCELLED/REFUNDED and includes delivery fees. */
export interface AdminTelemetrySummary {
  range: { from: string | null; to: string | null; timezone: string };
  totalRevenue: number;
  totalOrders: number;
  revenueOrderCount: number;
  avgOrderValue: number;
  revenueTrendPercent: number | null;
  ordersByStatus: Record<OrderStatus, number>;
  recentOrders: AdminRecentOrder[];
  topProducts: AdminTopProduct[];
  dailyRevenue: AdminDailyRevenue[];
  lowStockCount: number;
  expiringSoonCount: number;
}
