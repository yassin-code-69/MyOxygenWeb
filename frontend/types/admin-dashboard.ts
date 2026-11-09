/**
 * Admin v2 DTOs (dashboard summary v2, activity feed, global search, health)
 * — mirror the "Admin v2" section of `docs/API_CONTRACT.md` exactly.
 *
 * Kept out of the `types/index.ts` barrel on purpose: import from
 * `types/admin-dashboard` directly.
 */
import type { OrderStatus, PaymentMethod } from "./order";
import type { AdminTelemetrySummary } from "./admin";

// ---------------------------------------------------------------------------
// Shared report primitives
// ---------------------------------------------------------------------------

/** A metric for the selected range plus the same-length period right before it. */
export interface AdminKpi {
  value: number;
  previous: number;
  /** `null` when `previous` is 0 (no meaningful percentage). */
  changePercent: number | null;
}

/** Inclusive Dhaka business dates (`YYYY-MM-DD`). */
export interface AdminDateRange {
  from: string;
  to: string;
}

export type AdminSeriesGranularity = "day" | "month";

/** One bucket of a time series. `period` = `YYYY-MM-DD` (day) or `YYYY-MM` (month). */
export interface AdminSeriesPoint {
  period: string;
  /** Display label: `"Sep 26"` (day) or `"Sep 2026"` (month). */
  label: string;
}

export interface AdminReportRange extends AdminDateRange {
  timezone: string;
  previousFrom: string;
  previousTo: string;
  granularity: AdminSeriesGranularity;
}

// ---------------------------------------------------------------------------
// GET /admin/analytics/summary (v2)
// ---------------------------------------------------------------------------

export interface AdminSummaryKpis {
  revenue: AdminKpi;
  orders: AdminKpi;
  /** Total CUSTOMER accounts at `to` vs at `previousTo`. */
  customers: AdminKpi;
  newCustomers: AdminKpi;
  /** Units sold. */
  productsSold: AdminKpi;
  avgOrderValue: AdminKpi;
}

export interface AdminRevenueSeriesPoint extends AdminSeriesPoint {
  revenue: number;
  orders: number;
}

export interface AdminSummaryRecentOrder {
  id: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  total: number;
  itemCount: number;
  createdAt: string;
  firstItemImage: string | null;
}

export interface AdminSummaryTopProduct {
  productId: string;
  title: string;
  slug: string;
  sku: string;
  image: string | null;
  categoryName: string | null;
  unitsSold: number;
  revenue: number;
}

export interface AdminSalesByCategory {
  categoryId: string;
  name: string;
  slug: string;
  revenue: number;
  unitsSold: number;
  sharePercent: number;
}

export interface AdminLatestCustomer {
  id: string;
  fullName: string;
  email: string | null;
  phone: string;
  createdAt: string;
}

export interface AdminLowStockProduct {
  productId: string;
  title: string;
  slug: string;
  image: string | null;
  totalStock: number;
  lowStockThreshold: number;
}

/**
 * `GET /admin/analytics/summary?from&to` — v2 keeps every v1 field
 * (`totalRevenue`, `ordersByStatus`, `dailyRevenue`, `lowStockCount`,
 * `expiringSoonCount`, …) and adds the dashboard blocks below.
 * `ordersByStatus` counts orders created within the range.
 */
export interface AdminDashboardSummary
  extends Omit<AdminTelemetrySummary, "range" | "recentOrders" | "topProducts"> {
  range: AdminReportRange;
  kpis: AdminSummaryKpis;
  /** Every bucket present (zeros included). */
  revenueSeries: AdminRevenueSeriesPoint[];
  /** Latest 5 orders overall (not range-bound). */
  recentOrders: AdminSummaryRecentOrder[];
  /** Top 5 in range. */
  topProducts: AdminSummaryTopProduct[];
  /** In range, revenue descending. */
  salesByCategory: AdminSalesByCategory[];
  /** 5 newest CUSTOMER accounts. */
  latestCustomers: AdminLatestCustomer[];
  /** 5 lowest-stock products at or below their alert level. */
  lowStockProducts: AdminLowStockProduct[];
}

// ---------------------------------------------------------------------------
// GET /admin/analytics/activity?limit=10
// ---------------------------------------------------------------------------

export const ADMIN_ACTIVITY_TYPES = [
  "ORDER_PLACED",
  "ORDER_STATUS_CHANGED",
  "PAYMENT_RECEIVED",
  "CUSTOMER_REGISTERED",
  "STOCK_IMPORTED",
  "STOCK_SCRAPPED",
  "DISCOUNT_CREATED",
] as const;

export type AdminActivityType = (typeof ADMIN_ACTIVITY_TYPES)[number];

export interface AdminActivityItem {
  id: string;
  type: AdminActivityType;
  title: string;
  description: string | null;
  /** ISO timestamp. */
  at: string;
  /** Admin route to open, when there is one. */
  href: string | null;
}

// ---------------------------------------------------------------------------
// GET /admin/search?q=
// ---------------------------------------------------------------------------

export interface AdminSearchProduct {
  id: string;
  title: string;
  sku: string;
  image: string | null;
  href: string;
}

export interface AdminSearchOrder {
  id: string;
  orderNumber: string;
  customerName: string;
  total: number;
  status: OrderStatus;
  href: string;
}

export interface AdminSearchCustomer {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  href: string;
}

/** ≤ 5 per group; groups the caller lacks permission for are empty. */
export interface AdminSearchResults {
  products: AdminSearchProduct[];
  orders: AdminSearchOrder[];
  customers: AdminSearchCustomer[];
}

/** Minimum query length the search endpoint accepts. */
export const ADMIN_SEARCH_MIN_LENGTH = 2;

// ---------------------------------------------------------------------------
// GET /health (platform; not wrapped in the success envelope)
// ---------------------------------------------------------------------------

export interface StoreHealth {
  status: "UP" | "DOWN";
  database: "CONNECTED" | "DISCONNECTED";
  latencyMs?: number;
  uptime?: number;
  timestamp?: string;
}
