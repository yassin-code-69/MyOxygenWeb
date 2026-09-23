import { pgEnum } from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", [
  "SUPER_ADMIN",
  "INVENTORY_MANAGER",
  "ORDER_MANAGER",
  "MARKETING_MANAGER",
  "SUPPORT_STAFF",
  "CUSTOMER",
]);

export const orderStatusEnum = pgEnum("order_status", [
  "PENDING",
  "PROCESSING",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
  "REFUNDED",
]);

export const paymentMethodEnum = pgEnum("payment_method", [
  "COD",
  "ONLINE_GATEWAY",
]);

export const paymentStatusEnum = pgEnum("payment_status", [
  "UNPAID",
  "PAID",
  "REFUNDED",
  "FAILED",
]);

export const discountTypeEnum = pgEnum("discount_type", [
  "PERCENTAGE",
  "FIXED_AMOUNT",
]);

export const stockHistoryReasonEnum = pgEnum("stock_history_reason", [
  "IMPORT",
  "PURCHASE",
  "RETURN",
  "MANUAL_ADJUSTMENT",
  "EXPIRED_SCRAP",
]);
