export const Permissions = {
  // Inventory & Batches
  PRODUCTS_READ: "products:read",
  PRODUCTS_WRITE: "products:write",
  BATCHES_MANAGE: "batches:manage",
  STOCK_ADJUST: "stock:adjust",

  // Orders & Fulfillment
  ORDERS_READ: "orders:read",
  ORDERS_STATUS_UPDATE: "orders:status_update",
  COURIER_ASSIGN: "courier:assign",
  INVOICE_GENERATE: "invoice:generate",

  // Refunds & Payments
  REFUNDS_REQUEST: "refunds:request",
  REFUNDS_APPROVE: "refunds:approve",

  // Marketing & Sales
  DISCOUNTS_MANAGE: "discounts:manage",
  ANALYTICS_READ: "analytics:read",

  // System Administration
  STAFF_MANAGE: "staff:manage",
} as const;

export type Permission = (typeof Permissions)[keyof typeof Permissions];

export const RolePermissions: Record<string, Permission[]> = {
  SUPER_ADMIN: Object.values(Permissions),
  INVENTORY_MANAGER: [
    Permissions.PRODUCTS_READ,
    Permissions.PRODUCTS_WRITE,
    Permissions.BATCHES_MANAGE,
    Permissions.STOCK_ADJUST,
    Permissions.ANALYTICS_READ,
  ],
  ORDER_MANAGER: [
    Permissions.ORDERS_READ,
    Permissions.ORDERS_STATUS_UPDATE,
    Permissions.COURIER_ASSIGN,
    Permissions.INVOICE_GENERATE,
    Permissions.REFUNDS_APPROVE,
    Permissions.ANALYTICS_READ,
  ],
  MARKETING_MANAGER: [
    Permissions.PRODUCTS_READ,
    Permissions.DISCOUNTS_MANAGE,
    Permissions.ANALYTICS_READ,
  ],
  SUPPORT_STAFF: [
    Permissions.PRODUCTS_READ,
    Permissions.ORDERS_READ,
    Permissions.REFUNDS_REQUEST,
  ],
  CUSTOMER: [],
};

export { requirePermission } from "../middleware/auth";
