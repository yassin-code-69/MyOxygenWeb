"use client";

/**
 * Report hooks (Admin v2 → Reports in docs/API_CONTRACT.md).
 *
 * Every key is `[path, params]` and the params always carry the resolved
 * `from` / `to`, so each range (and filter) has its own cache entry and a
 * range change never shows another period's numbers. Keys are `null` when the
 * signed-in role may not call the endpoint, so no request is sent that the
 * backend would answer with 403.
 */
import useSWR from "swr";
import { api, type ApiError } from "../../lib/api-client";
import { collectPages, type CollectPagesOptions, type CollectedPages } from "../../lib/csv";
import { PERMISSIONS } from "../../types/auth";
import type { AdminDateRange } from "../../types/admin-dashboard";
import type {
  CustomerReport,
  InventoryReport,
  ProductReportMeta,
  ProductReportQuery,
  ProductReportRow,
  ProfitProductDetail,
  ProfitProductRow,
  ProfitProductsQuery,
  ProfitSummary,
  ReportCategoryOption,
} from "../../types/admin-reports";
import type { PaginationMeta } from "../../types/api";
import { cleanParams, useAdminPage, useAdminResource, type AdminKey } from "./swr";
import { useAdminRole, useCan } from "./use-permission";

const PRODUCTS_PATH = "/admin/reports/products";
const CUSTOMERS_PATH = "/admin/reports/customers";
const INVENTORY_PATH = "/admin/reports/inventory";
const PROFIT_PATH = "/admin/reports/profit";
const PROFIT_PRODUCTS_PATH = "/admin/reports/profit/products";

/** Rows per request when exporting (the API maximum). */
const EXPORT_PAGE_SIZE = 100;

const REPORT_OPTIONS = { keepPreviousData: true, revalidateOnFocus: false } as const;

/** Profit and expenses are SUPER_ADMIN only (role check, not a permission). */
export function useIsSuperAdmin(): boolean {
  return useAdminRole() === "SUPER_ADMIN";
}

/** Active categories for report filters (`GET /catalog/categories`, public, cached for a minute). */
export function useReportCategories() {
  return useAdminResource<ReportCategoryOption[]>("/catalog/categories", {}, true, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });
}

// ---------------------------------------------------------------------------
// Products report (ANALYTICS_READ)
// ---------------------------------------------------------------------------

function productReportParams(query: ProductReportQuery) {
  return {
    from: query.from,
    to: query.to,
    q: query.q?.trim() || undefined,
    categoryId: query.categoryId ?? undefined,
    sort: query.sort,
    page: query.page,
    limit: query.limit,
  };
}

/** `GET /admin/reports/products` — paginated rows plus `meta.totals` for the whole filter. */
export function useProductsReport(query: ProductReportQuery) {
  const allowed = useCan(PERMISSIONS.ANALYTICS_READ);
  const swr = useAdminPage<ProductReportRow, ProductReportMeta>(PRODUCTS_PATH, productReportParams(query), allowed, REPORT_OPTIONS);
  return { ...swr, allowed };
}

/** Every row of the products report for a filter (sequential pages, capped at 5,000). */
export function fetchAllProductReportRows(
  query: Omit<ProductReportQuery, "page" | "limit">,
  options?: CollectPagesOptions,
): Promise<CollectedPages<ProductReportRow>> {
  return collectPages(
    (page) =>
      api.getPage<ProductReportRow, ProductReportMeta>(
        PRODUCTS_PATH,
        cleanParams(productReportParams({ ...query, page, limit: EXPORT_PAGE_SIZE })),
        { signal: options?.signal },
      ),
    options,
  );
}

// ---------------------------------------------------------------------------
// Customers report (ANALYTICS_READ)
// ---------------------------------------------------------------------------

export interface CustomerReportPage {
  report: CustomerReport;
  /** Paginates `report.topCustomers`. */
  meta: PaginationMeta;
  /** The period this payload answers (the API doesn't echo it). */
  range: AdminDateRange;
}

async function customerReportFetcher([path, params]: AdminKey): Promise<CustomerReportPage> {
  const result = await api.envelope<CustomerReport, PaginationMeta>(path, { method: "GET", params });
  const meta = result.meta ?? { page: 1, limit: result.data.topCustomers.length, total: result.data.topCustomers.length, totalPages: 1 };
  return { report: result.data, meta, range: { from: String(params.from ?? ""), to: String(params.to ?? "") } };
}

/** `GET /admin/reports/customers` — KPIs, sign-ups, districts and a page of top customers. */
export function useCustomersReport(range: AdminDateRange, page: number, limit: number) {
  const allowed = useCan(PERMISSIONS.ANALYTICS_READ);
  const key: AdminKey | null = allowed ? [CUSTOMERS_PATH, cleanParams({ from: range.from, to: range.to, page, limit })] : null;
  const swr = useSWR<CustomerReportPage, ApiError, AdminKey | null>(key, customerReportFetcher, REPORT_OPTIONS);
  return { ...swr, allowed };
}

// ---------------------------------------------------------------------------
// Inventory report (ANALYTICS_READ) — a current snapshot, not range-bound
// ---------------------------------------------------------------------------

/** `GET /admin/reports/inventory`. */
export function useInventoryReport() {
  const allowed = useCan(PERMISSIONS.ANALYTICS_READ);
  const swr = useAdminResource<InventoryReport>(INVENTORY_PATH, {}, allowed, { keepPreviousData: true, refreshInterval: 120_000 });
  return { ...swr, allowed };
}

// ---------------------------------------------------------------------------
// Profit (SUPER_ADMIN)
// ---------------------------------------------------------------------------

/** `GET /admin/reports/profit?from&to`. */
export function useProfitSummary(range: AdminDateRange) {
  const allowed = useIsSuperAdmin();
  const swr = useAdminResource<ProfitSummary>(PROFIT_PATH, { from: range.from, to: range.to }, allowed, REPORT_OPTIONS);
  return { ...swr, allowed };
}

function profitProductsParams(query: ProfitProductsQuery) {
  return {
    from: query.from,
    to: query.to,
    q: query.q?.trim() || undefined,
    categoryId: query.categoryId ?? undefined,
    sort: query.sort,
    page: query.page,
    limit: query.limit,
  };
}

/** `GET /admin/reports/profit/products` — paginated product profitability. */
export function useProfitProducts(query: ProfitProductsQuery, enabled = true) {
  const allowed = useIsSuperAdmin();
  const swr = useAdminPage<ProfitProductRow>(PROFIT_PRODUCTS_PATH, profitProductsParams(query), allowed && enabled, REPORT_OPTIONS);
  return { ...swr, allowed };
}

/** Every product-profitability row for a filter (sequential pages, capped at 5,000). */
export function fetchAllProfitProducts(
  query: Omit<ProfitProductsQuery, "page" | "limit">,
  options?: CollectPagesOptions,
): Promise<CollectedPages<ProfitProductRow>> {
  return collectPages(
    (page) =>
      api.getPage<ProfitProductRow, PaginationMeta>(
        PROFIT_PRODUCTS_PATH,
        cleanParams(profitProductsParams({ ...query, page, limit: EXPORT_PAGE_SIZE })),
        { signal: options?.signal },
      ),
    options,
  );
}

/** `GET /admin/reports/profit/products/:id?from&to`. Pass `productId = null` to skip. */
export function useProfitProductDetail(productId: string | null, range: AdminDateRange) {
  const allowed = useIsSuperAdmin();
  const swr = useAdminResource<ProfitProductDetail>(
    productId ? `${PROFIT_PRODUCTS_PATH}/${encodeURIComponent(productId)}` : null,
    { from: range.from, to: range.to },
    allowed,
    REPORT_OPTIONS,
  );
  return { ...swr, allowed };
}

