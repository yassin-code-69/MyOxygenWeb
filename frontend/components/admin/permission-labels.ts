import { PERMISSIONS, type Permission } from "../../types/auth";

/** Human wording for each permission (shown on 403 panels). */
export const PERMISSION_LABELS: Record<Permission, string> = {
  [PERMISSIONS.PRODUCTS_READ]: "view products",
  [PERMISSIONS.PRODUCTS_WRITE]: "edit products",
  [PERMISSIONS.BATCHES_MANAGE]: "manage stock batches",
  [PERMISSIONS.STOCK_ADJUST]: "adjust stock and read the stock ledger",
  [PERMISSIONS.ORDERS_READ]: "view orders and invoices",
  [PERMISSIONS.ORDERS_STATUS_UPDATE]: "update order status",
  [PERMISSIONS.COURIER_ASSIGN]: "dispatch orders to the courier",
  [PERMISSIONS.INVOICE_GENERATE]: "generate invoices",
  [PERMISSIONS.REFUNDS_REQUEST]: "request refunds",
  [PERMISSIONS.REFUNDS_APPROVE]: "approve refunds",
  [PERMISSIONS.DISCOUNTS_MANAGE]: "manage discounts and coupons",
  [PERMISSIONS.ANALYTICS_READ]: "view sales analytics",
  [PERMISSIONS.STAFF_MANAGE]: "manage staff accounts",
};
