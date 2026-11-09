/**
 * Admin v2 report and expense DTOs — mirror the "Admin v2 → Reports" and
 * "Expenses" sections of `docs/API_CONTRACT.md` (and the services under
 * `backend/src/services/reports/` + `expense.service.ts`) exactly.
 *
 * Kept out of the `types/index.ts` barrel on purpose: import from
 * `types/admin-reports` directly.
 */
import type { AdminBatchDTO, AdminListingStatus } from "./admin";
import type { AdminKpi, AdminReportRange, AdminSeriesPoint } from "./admin-dashboard";
import type { PaginationMeta } from "./api";

/** `{ id, name }` reference used by report rows. */
export interface ReportCategoryRef {
  id: string;
  name: string;
}

/** The fields report filters need from `GET /catalog/categories` (active categories). */
export interface ReportCategoryOption {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
}

// ---------------------------------------------------------------------------
// GET /admin/reports/products (ANALYTICS_READ)
// ---------------------------------------------------------------------------

export const PRODUCT_REPORT_SORTS = ["revenue_desc", "units_desc", "title_asc", "stock_asc"] as const;
export type ProductReportSort = (typeof PRODUCT_REPORT_SORTS)[number];

export interface ProductReportRow {
  productId: string;
  title: string;
  sku: string;
  slug: string;
  image: string | null;
  category: ReportCategoryRef | null;
  unitsSold: number;
  revenue: number;
  ordersCount: number;
  avgSellingPrice: number;
  currentStock: number;
  /** All-time last sale (ISO), `null` when never sold. */
  lastSoldAt: string | null;
  isActive: boolean;
}

/** Pagination plus the totals of every row matching the filter (not just the page). */
export interface ProductReportMeta extends PaginationMeta {
  totals: { unitsSold: number; revenue: number };
}

export interface ProductReportQuery {
  from: string;
  to: string;
  q?: string;
  categoryId?: string | null;
  sort?: ProductReportSort;
  page: number;
  limit: number;
}

// ---------------------------------------------------------------------------
// GET /admin/reports/customers (ANALYTICS_READ)
// ---------------------------------------------------------------------------

export interface CustomerReportKpis {
  totalCustomers: AdminKpi;
  newCustomers: AdminKpi;
  /** Customers with 2+ revenue orders in the range. */
  returningCustomers: AdminKpi;
  repeatRatePercent: number;
  avgOrderValue: AdminKpi;
}

export interface CustomerSignupPoint extends AdminSeriesPoint {
  count: number;
}

export interface CustomerDistrictRow {
  district: string;
  orders: number;
  revenue: number;
}

export interface CustomerReportTopCustomer {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  orders: number;
  totalSpent: number;
  lastOrderAt: string | null;
}

/** `data` of the customers report; `meta` paginates `topCustomers`. */
export interface CustomerReport {
  kpis: CustomerReportKpis;
  signupSeries: CustomerSignupPoint[];
  /** Top 10 districts. */
  byDistrict: CustomerDistrictRow[];
  topCustomers: CustomerReportTopCustomer[];
}

// ---------------------------------------------------------------------------
// GET /admin/reports/inventory (ANALYTICS_READ)
// ---------------------------------------------------------------------------

export interface InventoryReportTotals {
  productCount: number;
  activeCount: number;
  stockUnits: number;
  stockValueCost: number;
  /** Retail value uses `basePrice`. */
  stockValueRetail: number;
}

export interface InventoryCategoryRow {
  categoryId: string;
  name: string;
  stockUnits: number;
  valueCost: number;
  valueRetail: number;
}

export interface InventoryLowStockRow {
  productId: string;
  title: string;
  image: string | null;
  totalStock: number;
  lowStockThreshold: number;
  listingStatus: AdminListingStatus;
}

export interface InventoryDeadStockRow {
  productId: string;
  title: string;
  image: string | null;
  totalStock: number;
  lastSoldAt: string | null;
  /** `null` when the product was never sold. */
  daysSinceLastSale: number | null;
}

/** Each list is capped at 100 rows. */
export interface InventoryReport {
  totals: InventoryReportTotals;
  byCategory: InventoryCategoryRow[];
  lowStock: InventoryLowStockRow[];
  /** Batches with stock expiring within 30 days. */
  expiringSoon: AdminBatchDTO[];
  /** Stock > 0 and no sale in 60 days (never-sold included). */
  deadStock: InventoryDeadStockRow[];
}

// ---------------------------------------------------------------------------
// GET /admin/reports/profit (SUPER_ADMIN)
// ---------------------------------------------------------------------------

export const EXPENSE_CATEGORIES = [
  "SHIPPING",
  "MARKETING",
  "DELIVERY_SUBSIDY",
  "PACKAGING",
  "SALARIES",
  "RENT",
  "UTILITIES",
  "OTHER",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export interface ProfitKpis {
  revenue: AdminKpi;
  cogs: AdminKpi;
  grossProfit: AdminKpi;
  /** `changePercent` is the relative change of the percentage (not points). */
  grossMarginPercent: AdminKpi;
  expenses: AdminKpi;
  netProfit: AdminKpi;
  netMarginPercent: AdminKpi;
}

export interface ProfitTrendPoint extends AdminSeriesPoint {
  revenue: number;
  cost: number;
  profit: number;
  marginPercent: number;
}

export interface ProfitCategoryRow {
  categoryId: string;
  name: string;
  revenue: number;
  cost: number;
  profit: number;
  marginPercent: number;
}

export interface ProfitTopProduct {
  productId: string;
  title: string;
  image: string | null;
  profit: number;
  marginPercent: number;
}

export interface ProfitExpenseSlice {
  key: "PRODUCT_COST" | ExpenseCategory;
  label: string;
  amount: number;
  /** Share of COGS + expenses. */
  percent: number;
}

export interface ProfitSummary {
  range: AdminReportRange;
  kpis: ProfitKpis;
  trend: ProfitTrendPoint[];
  byCategory: ProfitCategoryRow[];
  /** Top 5 by profit. */
  topProfitable: ProfitTopProduct[];
  /** PRODUCT_COST plus every non-zero expense category, by amount. */
  expenseBreakdown: ProfitExpenseSlice[];
}

// ---------------------------------------------------------------------------
// GET /admin/reports/profit/products (SUPER_ADMIN)
// ---------------------------------------------------------------------------

export const PROFIT_PRODUCT_SORTS = ["margin_desc", "margin_asc", "profit_desc", "revenue_desc"] as const;
export type ProfitProductSort = (typeof PROFIT_PRODUCT_SORTS)[number];

export interface ProfitProductRow {
  productId: string;
  title: string;
  sku: string;
  image: string | null;
  category: ReportCategoryRef | null;
  /** Average realised unit price, or the current effective price when unsold. */
  sellingPrice: number;
  /** Average `unit_cost` snapshot, or the current cost price when unsold. */
  avgCost: number;
  profitPerUnit: number;
  marginPercent: number;
  unitsSold: number;
  revenue: number;
  cogs: number;
  profit: number;
  isActive: boolean;
}

export interface ProfitProductsQuery {
  from: string;
  to: string;
  q?: string;
  categoryId?: string | null;
  sort?: ProfitProductSort;
  page: number;
  limit: number;
}

// ---------------------------------------------------------------------------
// GET /admin/reports/profit/products/:id (SUPER_ADMIN)
// ---------------------------------------------------------------------------

/** Per-unit landed cost components (`landedCost` = their sum). */
export interface CostBreakdown {
  supplierPrice: number;
  shipping: number;
  customsDuty: number;
  packaging: number;
  other: number;
}

export interface ProfitProductDetail {
  product: {
    id: string;
    title: string;
    sku: string;
    image: string | null;
    category: ReportCategoryRef | null;
    isActive: boolean;
  };
  range: AdminReportRange;
  unitsSold: number;
  revenue: number;
  cogs: number;
  grossProfit: number;
  marginPercent: number;
  /** `null` when the product has no recorded breakdown. */
  costBreakdown: (CostBreakdown & { landedCost: number }) | null;
  pricing: {
    basePrice: number;
    /** `basePrice − netSellingPrice`. */
    avgDiscountPerUnit: number;
    /** Average realised unit price. */
    netSellingPrice: number;
    /** Uses the product's current landed cost. */
    profitPerUnit: number;
    marginPercent: number;
  };
}

// ---------------------------------------------------------------------------
// /admin/expenses (SUPER_ADMIN)
// ---------------------------------------------------------------------------

export interface ExpenseDTO {
  id: string;
  category: ExpenseCategory;
  amount: number;
  /** Business date `YYYY-MM-DD` (Dhaka), never in the future. */
  incurredOn: string;
  vendor: string | null;
  note: string | null;
  createdBy: { id: string; fullName: string } | null;
  createdAt: string;
  updatedAt: string;
}

/** Pagination plus the sum of every expense matching the filter. */
export interface ExpenseListMeta extends PaginationMeta {
  totalAmount: number;
  /** Per-category totals for the date range (ignores the category filter), largest first, non-zero only. */
  byCategory?: Array<{ category: ExpenseCategory; count: number; amount: number }>;
}

export interface ExpenseListQuery {
  from?: string | null;
  to?: string | null;
  category?: ExpenseCategory | null;
  page: number;
  limit: number;
}

export interface ExpenseCreatePayload {
  category: ExpenseCategory;
  /** > 0, at most 2 decimals. */
  amount: number;
  incurredOn: string;
  /** ≤ 120 characters; `null` clears. */
  vendor?: string | null;
  /** ≤ 500 characters; `null` clears. */
  note?: string | null;
}

export type ExpenseUpdatePayload = Partial<ExpenseCreatePayload>;

/** Field limits shared by the form and the API. */
export const EXPENSE_LIMITS = {
  vendor: 120,
  note: 500,
  maxAmount: 9_999_999_999.99,
} as const;
