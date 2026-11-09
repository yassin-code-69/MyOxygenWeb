/**
 * Admin v2 management DTOs — customers, categories, brands, delivery,
 * payments, staff, roles and system status. They mirror the "Admin v2 →
 * Management" and "Payments and search" sections of `docs/API_CONTRACT.md`
 * (and the route files in `backend/src/routes/admin.{customers,catalog-meta,
 * delivery,payments,staff,system}.ts`) exactly.
 *
 * Kept out of the `types/index.ts` barrel on purpose: import from
 * `types/admin-management` directly.
 */
import type { Permission, StaffRole, UserRole } from "./auth";
import type { OrderSummaryDTO, PaymentMethod, PaymentStatus, ShippingAddress } from "./order";
import type { AdminKpi } from "./admin-dashboard";

// ---------------------------------------------------------------------------
// Customers — GET/PATCH /admin/customers (ORDERS_READ; PATCH needs STAFF_MANAGE)
// ---------------------------------------------------------------------------

export const ADMIN_CUSTOMER_SORTS = ["newest", "spend_desc", "orders_desc"] as const;
export type AdminCustomerSort = (typeof ADMIN_CUSTOMER_SORTS)[number];

/** A CUSTOMER account (`GET /admin/customers/:id` → `customer`, `PATCH` response). */
export interface AdminCustomer {
  id: string;
  fullName: string;
  /** Canonical `01XXXXXXXXX`. */
  phone: string;
  email: string | null;
  isActive: boolean;
  createdAt: string;
}

/** Row of `GET /admin/customers`. `totalSpent` excludes CANCELLED / REFUNDED orders. */
export interface AdminCustomerListItem extends AdminCustomer {
  ordersCount: number;
  totalSpent: number;
  lastOrderAt: string | null;
}

export interface AdminCustomerStats {
  ordersCount: number;
  totalSpent: number;
  /** Spend ÷ non-cancelled, non-refunded orders. */
  avgOrderValue: number;
  firstOrderAt: string | null;
  lastOrderAt: string | null;
}

/** `data` of `GET /admin/customers/:id` (404 for staff ids). */
export interface AdminCustomerDetail {
  customer: AdminCustomer;
  stats: AdminCustomerStats;
  /** Newest first, at most 10. */
  recentOrders: OrderSummaryDTO[];
  /** Distinct shipping addresses, most recent first, at most 5. */
  addresses: ShippingAddress[];
}

/** Body of `PATCH /admin/customers/:id`. */
export interface AdminCustomerUpdatePayload {
  isActive: boolean;
}

/** `kpis` of `GET /admin/reports/customers` (ANALYTICS_READ) — the only part the customers page uses. */
export interface AdminCustomerReportKpis {
  totalCustomers: AdminKpi;
  newCustomers: AdminKpi;
  /** Customers with 2+ revenue orders in the range. */
  returningCustomers: AdminKpi;
  repeatRatePercent: number;
  avgOrderValue: AdminKpi;
}

export interface AdminCustomerReport {
  kpis: AdminCustomerReportKpis;
}

// ---------------------------------------------------------------------------
// Categories — /admin/catalog/categories (PRODUCTS_READ; writes PRODUCTS_WRITE)
// ---------------------------------------------------------------------------

export interface AdminCategory {
  id: string;
  name: string;
  slug: string;
  /** http(s) URL or a `/icons/...` path. */
  iconUrl: string | null;
  parentId: string | null;
  sortOrder: number;
  isActive: boolean;
  productCount: number;
  activeProductCount: number;
  createdAt: string;
  updatedAt: string;
}

/** Body of `POST /admin/catalog/categories` (strict: unknown keys are a 422). */
export interface AdminCategoryCreatePayload {
  name: string;
  /** Kebab-case; generated from the name when omitted. */
  slug?: string;
  /** `null` / empty clears the icon. */
  iconUrl?: string | null;
  parentId?: string | null;
  sortOrder?: number;
  isActive?: boolean;
}

/** Body of `PATCH /admin/catalog/categories/:id` — any subset; the slug is immutable. */
export type AdminCategoryUpdatePayload = Partial<Omit<AdminCategoryCreatePayload, "slug">>;

/** `details` of the 409 raised when deactivating a category that still lists products. */
export interface AdminCategoryInUseDetails {
  listedProductCount: number;
}

// ---------------------------------------------------------------------------
// Brands — /admin/catalog/brands (PRODUCTS_READ; rename PRODUCTS_WRITE)
// ---------------------------------------------------------------------------

/** One distinct brand spelling across the catalog. */
export interface AdminBrand {
  name: string;
  productCount: number;
  activeProductCount: number;
  /** Units sold in the last 30 days. */
  unitsSold30d: number;
}

/** Body of `PATCH /admin/catalog/brands`: renames (or merges into) `to` on every product whose brand matches `from` case-insensitively. */
export interface AdminBrandRenamePayload {
  from: string;
  to: string;
}

export interface AdminBrandRenameResult {
  updated: number;
}

// ---------------------------------------------------------------------------
// Delivery — GET /admin/delivery/summary (ORDERS_READ)
// ---------------------------------------------------------------------------

export interface AdminCourierDelivery {
  /** Courier provider name; `"unknown"` for orders without a courier. */
  provider: string;
  /** Live: orders currently SHIPPED with this courier. */
  inTransit: number;
  /** Delivered within the range. */
  delivered: number;
}

export interface AdminDeliverySummary {
  /** Live: orders currently PROCESSING. */
  readyToShip: number;
  /** Live: orders currently SHIPPED. */
  inTransit: number;
  /** Orders whose `deliveredAt` falls in the range. */
  deliveredInRange: number;
  /** Orders cancelled in the range after they had shipped. */
  cancelledAfterShipping: number;
  /** Average shipped → delivered time for deliveries in the range; `null` without data. */
  avgDeliveryHours: number | null;
  byCourier: AdminCourierDelivery[];
}

// ---------------------------------------------------------------------------
// Payments — GET /admin/payments/summary (ORDERS_READ)
// ---------------------------------------------------------------------------

export interface AdminPaymentMethodTotal {
  method: PaymentMethod;
  orders: number;
  amount: number;
}

export interface AdminPaymentStatusTotal {
  status: PaymentStatus;
  orders: number;
  amount: number;
}

/**
 * Orders placed in the range. `byMethod` / `byStatus` exclude CANCELLED
 * orders and list every enum value (zeros included).
 */
export interface AdminPaymentSummary {
  /** Σ total of PAID orders. */
  collected: number;
  /** Σ total of COD orders still UNPAID and not cancelled / refunded. */
  pendingCod: number;
  /** Σ total of REFUNDED payments. */
  refunded: number;
  /** Σ total of FAILED payments. */
  failed: number;
  byMethod: AdminPaymentMethodTotal[];
  byStatus: AdminPaymentStatusTotal[];
}

// ---------------------------------------------------------------------------
// Staff & roles — /admin/staff, /admin/roles (STAFF_MANAGE)
// ---------------------------------------------------------------------------

/** A non-CUSTOMER account. */
export interface AdminStaffMember {
  id: string;
  fullName: string;
  email: string | null;
  phone: string;
  role: StaffRole;
  isActive: boolean;
  createdAt: string;
}

/** Body of `POST /admin/staff`. */
export interface AdminStaffCreatePayload {
  fullName: string;
  email: string;
  /** Bangladeshi mobile in any accepted format (stored as `01XXXXXXXXX`). */
  phone: string;
  role: StaffRole;
  /** 12–72 bytes. */
  password: string;
}

/** Body of `PATCH /admin/staff/:id` (at least one field). */
export interface AdminStaffUpdatePayload {
  fullName?: string;
  role?: StaffRole;
  isActive?: boolean;
}

/** `details.reason` of a 409 from `PATCH /admin/staff/:id`. */
export const ADMIN_STAFF_CONFLICT_REASONS = ["SELF_ROLE_CHANGE", "SELF_DEACTIVATION", "LAST_SUPER_ADMIN"] as const;
export type AdminStaffConflictReason = (typeof ADMIN_STAFF_CONFLICT_REASONS)[number];

/** Row of `GET /admin/roles` (all 6 roles; CUSTOMER has no permissions; counts include inactive accounts). */
export interface AdminRoleSummary {
  role: UserRole;
  permissions: Permission[];
  userCount: number;
}

// ---------------------------------------------------------------------------
// System — GET /admin/system/status (STAFF_MANAGE, Cache-Control: no-store)
// ---------------------------------------------------------------------------

export interface AdminSystemStatus {
  api: {
    status: "UP";
    uptimeSeconds: number;
    nodeEnv: string;
    timezone: string;
    version: string;
  };
  database: {
    status: "CONNECTED" | "DISCONNECTED";
    latencyMs: number | null;
    /** `null` when DISCONNECTED, `0` when the migrations table is missing. */
    migrationsApplied: number | null;
  };
  jobs: {
    queue: "bullmq" | "in-process";
    redisConfigured: boolean;
  };
  integrations: {
    courier: { provider: string; configured: boolean };
    sms: { configured: boolean };
    email: { configured: boolean };
  };
  cache: { entries: number };
}
