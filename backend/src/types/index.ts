/**
 * Backend DTOs and API envelope contracts.
 *
 * Every JSON response is either
 *   ApiSuccess<T>  → { success: true,  data: T, meta?: PaginationMeta }
 *   ApiErrorBody   → { success: false, error: { code, message, details? } }
 */
import type { ApiErrorBody, ApiErrorPayload, ErrorCode } from "../lib/errors";

export type { ApiErrorBody, ApiErrorPayload, ErrorCode };

// ---------------------------------------------------------------------------
// API envelopes
// ---------------------------------------------------------------------------

/** Pagination metadata returned by every list endpoint. */
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiSuccess<T, M = PaginationMeta> {
  success: true;
  data: T;
  meta?: M;
}

export type ApiResponse<T, M = PaginationMeta> = ApiSuccess<T, M> | ApiErrorBody;

/** Convenience alias for paginated list responses. */
export type ApiPaginated<T> = ApiSuccess<T[], PaginationMeta> & { meta: PaginationMeta };

// ---------------------------------------------------------------------------
// Users & roles
// ---------------------------------------------------------------------------

export const USER_ROLES = [
  "SUPER_ADMIN",
  "INVENTORY_MANAGER",
  "ORDER_MANAGER",
  "MARKETING_MANAGER",
  "SUPPORT_STAFF",
  "CUSTOMER",
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export interface UserDTO {
  id: string;
  fullName: string;
  email: string | null;
  phone: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

export interface CategoryDTO {
  id: string;
  name: string;
  slug: string;
  iconUrl: string | null;
  parentId: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
}

export interface ProductBatchDTO {
  id: string;
  productId: string;
  batchNumber: string;
  manufactureDate: string | null;
  expiryDate: string;
  initialQuantity: number;
  availableQuantity: number;
  createdAt: string;
}

export interface ProductDTO {
  id: string;
  categoryId: string;
  title: string;
  slug: string;
  sku: string;
  brand: string | null;
  description: string;
  basePrice: string;
  costPrice: string;
  images: string[];
  isActive: boolean;
  requiresBatchTracking: boolean;
  lowStockThreshold: number;
  effectivePrice?: string;
  totalStock?: number;
  earliestExpiry?: string | null;
  category?: CategoryDTO;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------

export type StockHistoryReason =
  | "IMPORT"
  | "PURCHASE"
  | "RETURN"
  | "MANUAL_ADJUSTMENT"
  | "EXPIRED_SCRAP";

export interface StockHistoryLogDTO {
  id: string;
  productId: string;
  batchId: string | null;
  orderId: string | null;
  changeDelta: number;
  balanceAfter: number;
  reason: StockHistoryReason;
  note: string | null;
  performedByUserId: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

/**
 * Canonical shipping address stored in `orders.shipping_address` (jsonb).
 * The checkout Zod schema (`routes/orders.schema.ts`) must produce exactly this shape.
 */
export interface ShippingAddress {
  fullName: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  district: string;
  postalCode: string;
}

export type OrderStatus =
  | "PENDING"
  | "PROCESSING"
  | "SHIPPED"
  | "DELIVERED"
  | "CANCELLED"
  | "REFUNDED";

export type PaymentMethod = "COD" | "ONLINE_GATEWAY";
export type PaymentStatus = "UNPAID" | "PAID" | "REFUNDED" | "FAILED";
export type DiscountType = "PERCENTAGE" | "FIXED_AMOUNT";

export interface OrderStatusHistoryDTO {
  id: string;
  orderId: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  changedBy: string | null;
  note: string | null;
  createdAt: string;
}
