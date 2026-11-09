/**
 * Role → permission matrix, mirrored from `backend/src/lib/rbac.ts`.
 *
 * The backend enforces every permission; the frontend uses this copy only to
 * hide navigation and actions a user cannot perform. Keep both files in sync.
 */
import { PERMISSIONS, type Permission, type UserRole } from "../types/auth";

const ALL_PERMISSIONS = Object.values(PERMISSIONS) as readonly Permission[];

export const ROLE_PERMISSIONS: Readonly<Record<UserRole, readonly Permission[]>> = {
  SUPER_ADMIN: ALL_PERMISSIONS,
  INVENTORY_MANAGER: [
    PERMISSIONS.PRODUCTS_READ,
    PERMISSIONS.PRODUCTS_WRITE,
    PERMISSIONS.BATCHES_MANAGE,
    PERMISSIONS.STOCK_ADJUST,
    PERMISSIONS.ANALYTICS_READ,
  ],
  ORDER_MANAGER: [
    PERMISSIONS.ORDERS_READ,
    PERMISSIONS.ORDERS_STATUS_UPDATE,
    PERMISSIONS.COURIER_ASSIGN,
    PERMISSIONS.INVOICE_GENERATE,
    PERMISSIONS.REFUNDS_APPROVE,
    PERMISSIONS.ANALYTICS_READ,
  ],
  MARKETING_MANAGER: [PERMISSIONS.PRODUCTS_READ, PERMISSIONS.DISCOUNTS_MANAGE, PERMISSIONS.ANALYTICS_READ],
  SUPPORT_STAFF: [PERMISSIONS.PRODUCTS_READ, PERMISSIONS.ORDERS_READ, PERMISSIONS.REFUNDS_REQUEST],
  CUSTOMER: [],
};

export function hasPermission(role: UserRole | null | undefined, permission: Permission): boolean {
  if (!role) {return false;}
  return role === "SUPER_ADMIN" || ROLE_PERMISSIONS[role].includes(permission);
}

export function hasAnyPermission(role: UserRole | null | undefined, permissions: readonly Permission[]): boolean {
  return permissions.some((permission) => hasPermission(role, permission));
}

export function hasAllPermissions(role: UserRole | null | undefined, permissions: readonly Permission[]): boolean {
  return permissions.every((permission) => hasPermission(role, permission));
}
