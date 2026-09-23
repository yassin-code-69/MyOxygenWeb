import { z } from "zod";

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
  effectivePrice?: string;
  totalStock?: number;
  earliestExpiry?: string | null;
  category?: CategoryDTO;
  createdAt: string;
  updatedAt: string;
}

// Stock History
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
  changeDelta: number;
  balanceAfter: number;
  reason: StockHistoryReason;
  note: string | null;
  performedByUserId: string | null;
  createdAt: string;
}
