/**
 * Back-office navigation, filtered by the signed-in user's permissions.
 *
 * Each item names the permission its page needs; `getAdminNavItems(role)`
 * returns only what the role can open, and `getAdminHomeHref(role)` is the
 * landing route (the first allowed item). The backend enforces every
 * permission again — this only keeps the UI honest.
 */
import {
  IconCalendarTime,
  IconDiscount,
  IconFileSpreadsheet,
  IconLayoutDashboard,
  IconPackage,
  IconReceipt,
  IconTruckDelivery,
  type Icon,
} from "@tabler/icons-react";
import { PERMISSIONS, type Permission, type UserRole } from "../types/auth";
import { hasPermission } from "./permissions";

export interface AdminNavItem {
  label: string;
  href: string;
  icon: Icon;
  /** Permission required to open the page. */
  permission: Permission;
  /** Short helper text (sidebar tooltip / screen readers). */
  description: string;
  /** Match the pathname exactly (dashboard). */
  exact?: boolean;
}

export const ADMIN_NAV_ITEMS: readonly AdminNavItem[] = [
  {
    label: "Dashboard",
    href: "/admin",
    icon: IconLayoutDashboard,
    permission: PERMISSIONS.ANALYTICS_READ,
    description: "Revenue, orders and stock alerts",
    exact: true,
  },
  {
    label: "Orders",
    href: "/admin/orders",
    icon: IconTruckDelivery,
    permission: PERMISSIONS.ORDERS_READ,
    description: "Fulfil, dispatch and track orders",
  },
  {
    label: "Invoices",
    href: "/admin/invoices",
    icon: IconReceipt,
    permission: PERMISSIONS.ORDERS_READ,
    description: "Billing records and PDF invoices",
  },
  {
    label: "Products",
    href: "/admin/products",
    icon: IconPackage,
    permission: PERMISSIONS.PRODUCTS_READ,
    description: "Catalog, prices and listing status",
  },
  {
    label: "Batches",
    href: "/admin/batches",
    icon: IconCalendarTime,
    permission: PERMISSIONS.BATCHES_MANAGE,
    description: "Batch inspector and stock imports",
  },
  {
    label: "Stock Ledger",
    href: "/admin/ledger",
    icon: IconFileSpreadsheet,
    permission: PERMISSIONS.STOCK_ADJUST,
    description: "Every stock movement, audited",
  },
  {
    label: "Discounts",
    href: "/admin/discounts",
    icon: IconDiscount,
    permission: PERMISSIONS.DISCOUNTS_MANAGE,
    description: "Coupons, automatic discounts and flash sales",
  },
];

/** Navigation items the role may open, in sidebar order. */
export function getAdminNavItems(role: UserRole | null | undefined): AdminNavItem[] {
  return ADMIN_NAV_ITEMS.filter((item) => hasPermission(role, item.permission));
}

/** Landing route for the role (first allowed item), or `null` when nothing is allowed. */
export function getAdminHomeHref(role: UserRole | null | undefined): string | null {
  return getAdminNavItems(role)[0]?.href ?? null;
}

/** Whether `pathname` belongs to the nav item. */
export function isAdminNavItemActive(item: AdminNavItem, pathname: string): boolean {
  if (item.exact) {
    return pathname === item.href;
  }
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/** The nav item that owns `pathname` (for the header title). */
export function findAdminNavItem(pathname: string): AdminNavItem | undefined {
  return ADMIN_NAV_ITEMS.find((item) => isAdminNavItemActive(item, pathname));
}
