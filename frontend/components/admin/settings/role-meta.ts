import type { MantineColor } from "@mantine/core";
import { PERMISSIONS, STAFF_ROLES, type Permission, type StaffRole, type UserRole } from "../../../types/auth";
import { PERMISSION_LABELS } from "../permission-labels";

/** Badge color per role (one hue each, so the staff list scans quickly). */
export const ROLE_COLORS: Record<UserRole, MantineColor> = {
  SUPER_ADMIN: "primaryPink",
  INVENTORY_MANAGER: "warning",
  ORDER_MANAGER: "info",
  MARKETING_MANAGER: "accentPurple",
  SUPPORT_STAFF: "secondaryGreen",
  CUSTOMER: "gray",
};

/** One-line summary of what each staff role is for (Add staff role picker). */
export const ROLE_DESCRIPTIONS: Record<StaffRole, string> = {
  SUPER_ADMIN: "Store owner: everything, including staff, profit and expenses.",
  INVENTORY_MANAGER: "Products, stock batches, adjustments and reports.",
  ORDER_MANAGER: "Orders, courier dispatch, invoices, refunds and reports.",
  MARKETING_MANAGER: "Coupons, offers, flash sales and reports.",
  SUPPORT_STAFF: "Looks up orders and products for customers; can request refunds.",
};

/** Staff roles in seniority order (for sorting and pickers). */
export const STAFF_ROLE_ORDER: readonly StaffRole[] = STAFF_ROLES;

export interface PermissionGroup {
  label: string;
  permissions: readonly Permission[];
}

/** Permissions grouped by area for the role matrix. */
export const PERMISSION_GROUPS: readonly PermissionGroup[] = [
  { label: "Catalog", permissions: [PERMISSIONS.PRODUCTS_READ, PERMISSIONS.PRODUCTS_WRITE] },
  { label: "Inventory", permissions: [PERMISSIONS.BATCHES_MANAGE, PERMISSIONS.STOCK_ADJUST] },
  {
    label: "Orders & payments",
    permissions: [
      PERMISSIONS.ORDERS_READ,
      PERMISSIONS.ORDERS_STATUS_UPDATE,
      PERMISSIONS.COURIER_ASSIGN,
      PERMISSIONS.INVOICE_GENERATE,
      PERMISSIONS.REFUNDS_REQUEST,
      PERMISSIONS.REFUNDS_APPROVE,
    ],
  },
  { label: "Marketing", permissions: [PERMISSIONS.DISCOUNTS_MANAGE] },
  { label: "Insights & admin", permissions: [PERMISSIONS.ANALYTICS_READ, PERMISSIONS.STAFF_MANAGE] },
];

/** `"view products"` → `"View products"`. */
export function permissionLabel(permission: Permission): string {
  const label = PERMISSION_LABELS[permission] ?? permission;
  return label.charAt(0).toUpperCase() + label.slice(1);
}
