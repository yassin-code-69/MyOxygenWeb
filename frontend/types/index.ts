
// API Response Envelopes
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code?: string;
    message: string;
    details?: any;
  } | string;
}

// User & Role Types
export type UserRole =
  | "SUPER_ADMIN"
  | "INVENTORY_MANAGER"
  | "ORDER_MANAGER"
  | "MARKETING_MANAGER"
  | "SUPPORT_STAFF"
  | "CUSTOMER";

export interface UserDTO {
  id: string;
  fullName: string;
  email: string | null;
  phone: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
}

// Category & Product Types
export interface CategoryDTO {
  id: string;
  name: string;
  slug: string;
  iconUrl: string | null;
  parentId: string | null;
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
  description: string;
  basePrice: string;
  costPrice: string;
  images: string[];
  isActive: boolean;
  requiresBatchTracking: boolean;
  lowStockThreshold: number;
  effectivePrice?: number | string;
  totalStock?: number;
  totalAvailable?: number;
  earliestExpiry?: string | null;
  category?: CategoryDTO;
  createdAt: string;
  updatedAt: string;
}

export interface CatalogProductItem {
  id: string;
  title: string;
  slug: string;
  sku: string;
  description: string;
  basePrice: string;
  costPrice?: string;
  images: string[];
  requiresBatchTracking: boolean;
  lowStockThreshold: number;
  categoryId: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  totalAvailable: number;
  searchRank?: number;
  effectivePrice: number;
  earliestExpiry?: string | null;
  discount?: {
    id?: string;
    code?: string | null;
    type: "PERCENTAGE" | "FIXED_AMOUNT";
    value: string | number;
    isFlashSale?: boolean;
    endsAt?: string;
    countdownMs?: number;
  } | null;
  isLowStock: boolean;
  isOutOfStock: boolean;
}

export interface ProductDetailItem extends CatalogProductItem {
  activeDiscount?: CatalogProductItem["discount"];
  earliestExpiry: string | null;
  batchSummary: Array<{
    batchNumber: string;
    expiryDate: string;
    availableQuantity: number;
  }>;
  relatedProducts?: Array<{
    id: string;
    title: string;
    slug: string;
    basePrice: string;
    images: string[];
  }>;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface CatalogProductsResponse {
  success: boolean;
  data: CatalogProductItem[];
  pagination: PaginationMeta;
}

export interface ProductDetailResponse {
  success: boolean;
  data: ProductDetailItem;
}

// Stock History
export type StockHistoryReason =
  | "IMPORT"
  | "PURCHASE"
  | "RETURN"
  | "MANUAL_ADJUSTMENT"
  | "EXPIRED_SCRAP"
  | "ADJUSTMENT";

export interface StockHistoryLogDTO {
  id: string;
  productId: string;
  batchId: string | null;
  changeDelta: number;
  balanceAfter: number;
  reason: StockHistoryReason;
  note: string | null;
  performedByUserId: string | null;
  createdAt: string;
}

export type BatchHealthStatus = "EXPIRED" | "EXPIRING_SOON" | "HEALTHY";

export interface BatchItemDTO {
  id: string;
  productId: string;
  batchNumber: string;
  manufactureDate: string | null;
  expiryDate: string;
  initialQuantity: number;
  availableQuantity: number;
  shelfLifeDays?: number;
  healthStatus?: BatchHealthStatus;
  product?: {
    id: string;
    title: string;
    sku: string;
  } | null;
  createdAt: string;
}

export interface StockLedgerItemDTO {
  id: string;
  productId: string;
  batchId: string | null;
  changeDelta: number;
  balanceAfter: number;
  reason: StockHistoryReason | string;
  note: string | null;
  createdAt: string;
  product?: {
    id: string;
    title: string;
    sku: string;
  } | null;
  batch?: {
    batchNumber: string;
    expiryDate: string;
  } | null;
  performedBy?: {
    id: string;
    fullName: string;
    role: string;
  } | null;
}

export interface StockLedgerResponse {
  success: boolean;
  data: {
    entries: StockLedgerItemDTO[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// Admin Orders
export type AdminOrderStatus =
  | "PENDING"
  | "PROCESSING"
  | "SHIPPED"
  | "DELIVERED"
  | "CANCELLED";

export interface OrderShippingAddress {
  fullName?: string;
  recipientName?: string;
  phone?: string;
  recipientPhone?: string;
  addressLine1?: string;
  address?: string;
  city?: string;
  district?: string;
  postalCode?: string;
  [key: string]: any;
}

export interface AdminOrderItemDTO {
  id: string;
  orderId: string;
  productId: string;
  batchId: string | null;
  quantity: number;
  unitPrice: string | number;
  totalPrice: string | number;
  product?: {
    id: string;
    title: string;
    slug?: string;
    sku?: string;
    images?: string[];
    basePrice?: string;
  } | null;
  batch?: {
    id: string;
    batchNumber: string;
    expiryDate: string;
  } | null;
}

export interface AdminOrderDTO {
  id: string;
  orderNumber: string;
  userId: string;
  status: AdminOrderStatus;
  paymentMethod: string;
  paymentStatus: "UNPAID" | "PAID" | "FAILED" | string;
  shippingAddress: OrderShippingAddress | string | null;
  subtotal: string | number;
  deliveryFee: string | number;
  discountAmount: string | number;
  total: string | number;
  courierProvider: string | null;
  trackingId: string | null;
  pdfInvoiceUrl: string | null;
  createdAt: string;
  updatedAt: string;
  user?: {
    id: string;
    fullName: string;
    email: string | null;
    phone: string;
    role?: string;
  } | null;
  items?: AdminOrderItemDTO[];
}

export interface AdminOrdersResponse {
  success: boolean;
  data: AdminOrderDTO[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

export interface InvoiceItemSnapshot {
  id: string;
  productId: string | null;
  title: string;
  sku: string | null;
  batchNumber: string | null;
  expiryDate: string | null;
  quantity: number;
  unitPrice: string;
  totalPrice: string;
}

export interface AdminInvoiceDTO {
  id: string;
  invoiceNumber: string;
  orderId: string;
  userId: string | null;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  paymentMethod: string;
  paymentStatus: string;
  subtotal: string;
  discountAmount: string;
  deliveryFee: string;
  totalAmount: string;
  itemsSnapshot: InvoiceItemSnapshot[];
  hasPdf: boolean;
  createdAt: string;
  updatedAt: string;
  orderNumber?: string | null;
}

export interface AdminInvoicesResponse {
  success: boolean;
  data: {
    items: AdminInvoiceDTO[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
    summary: {
      totalInvoices: number;
      totalBilledAmount: string;
      codCount: number;
      digitalCount: number;
    };
  };
}

