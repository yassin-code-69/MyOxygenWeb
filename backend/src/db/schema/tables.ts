/**
 * My Oxygen database schema (single-owner retail store).
 *
 * Conventions:
 * - uuid primary keys (`gen_random_uuid()`), `timestamptz` everywhere,
 *   `updated_at` maintained by Drizzle via `$onUpdate`.
 * - Every foreign-key column is covered by an index whose leading column is
 *   the FK (Postgres does not index FKs automatically).
 * - Money is `numeric(10,2)` (strings in TypeScript); CHECK constraints keep
 *   money, quantities and date ranges sane at the database level.
 * - Emails are stored lower-case (enforced by CHECK); normalise before insert.
 * - Discounts: rows with `code IS NULL` are automatic (catalog/flash-sale
 *   prices); rows with a code are coupons, unique case-insensitively.
 * - Trigram search indexes and RLS live in the custom migration
 *   `0001_search_and_security.sql` (pg_trgm is installed in schema `extensions`).
 */
import { relations, sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import type { ShippingAddress } from "../../types";
import {
  discountTypeEnum,
  orderStatusEnum,
  paymentMethodEnum,
  paymentStatusEnum,
  stockHistoryReasonEnum,
  userRoleEnum,
} from "./enums";

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).defaultNow().notNull();

const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date());

const money = (name: string) => numeric(name, { precision: 10, scale: 2 });

// ---------------------------------------------------------------------------
// Users & RBAC
// ---------------------------------------------------------------------------
export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    role: userRoleEnum("role").default("CUSTOMER").notNull(),
    fullName: varchar("full_name", { length: 255 }).notNull(),
    email: varchar("email", { length: 255 }).unique("users_email_unique"),
    phone: varchar("phone", { length: 32 }).notNull().unique("users_phone_unique"),
    passwordHash: varchar("password_hash", { length: 255 }),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("users_role_idx").on(t.role),
    check("users_email_lowercase_chk", sql`${t.email} IS NULL OR ${t.email} = lower(${t.email})`),
  ],
);

// ---------------------------------------------------------------------------
// Categories (Newborn, Mother Care, Skin Care, Inner Wear)
// ---------------------------------------------------------------------------
export const categories = pgTable(
  "categories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 255 }).notNull().unique("categories_slug_unique"),
    iconUrl: varchar("icon_url", { length: 512 }),
    parentId: uuid("parent_id").references((): AnyPgColumn => categories.id, {
      onDelete: "set null",
    }),
    sortOrder: integer("sort_order").default(0).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("categories_parent_idx").on(t.parentId),
    index("categories_active_sort_idx").on(t.isActive, t.sortOrder),
    check("categories_not_own_parent_chk", sql`${t.parentId} IS NULL OR ${t.parentId} <> ${t.id}`),
  ],
);

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------
export const products = pgTable(
  "products",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    categoryId: uuid("category_id")
      .references(() => categories.id, { onDelete: "restrict" })
      .notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 255 }).notNull().unique("products_slug_unique"),
    sku: varchar("sku", { length: 64 }).notNull().unique("products_sku_unique"),
    brand: varchar("brand", { length: 120 }),
    description: text("description").notNull(),
    basePrice: money("base_price").notNull(),
    costPrice: money("cost_price").notNull(),
    images: text("images").array().default(sql`'{}'::text[]`).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    /**
     * Set when the inventory engine hid the product because its sellable
     * stock reached 0 (NULL otherwise). Only products with this marker are
     * re-activated automatically when stock comes back; a manual deactivation
     * by an admin clears it so a restock never overrides the owner.
     */
    autoDeactivatedAt: timestamp("auto_deactivated_at", { withTimezone: true }),
    requiresBatchTracking: boolean("requires_batch_tracking").default(false).notNull(),
    lowStockThreshold: integer("low_stock_threshold").default(5).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("products_category_idx").on(t.categoryId),
    index("products_brand_idx").on(t.brand),
    index("products_active_created_idx").on(t.isActive, t.createdAt),
    check("products_base_price_nonneg_chk", sql`${t.basePrice} >= 0`),
    check("products_cost_price_nonneg_chk", sql`${t.costPrice} >= 0`),
    check("products_low_stock_threshold_nonneg_chk", sql`${t.lowStockThreshold} >= 0`),
  ],
);

// ---------------------------------------------------------------------------
// Product batches (FEFO for perishables)
// ---------------------------------------------------------------------------
export const productBatches = pgTable(
  "product_batches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id")
      .references(() => products.id, { onDelete: "cascade" })
      .notNull(),
    batchNumber: varchar("batch_number", { length: 64 }).notNull(),
    manufactureDate: date("manufacture_date"),
    expiryDate: date("expiry_date").notNull(),
    initialQuantity: integer("initial_quantity").notNull(),
    availableQuantity: integer("available_quantity").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // Leading product_id also serves as the FK index.
    uniqueIndex("product_batch_unique").on(t.productId, t.batchNumber),
    // FEFO allocation: WHERE product_id = ? AND expiry_date > ? ORDER BY expiry_date
    index("batch_product_expiry_idx").on(t.productId, t.expiryDate),
    // Nightly expiry scan only cares about batches that still hold stock.
    index("batch_expiry_in_stock_idx").on(t.expiryDate).where(sql`${t.availableQuantity} > 0`),
    check("batch_available_nonneg_chk", sql`${t.availableQuantity} >= 0`),
    check("batch_initial_positive_chk", sql`${t.initialQuantity} > 0`),
    check(
      "batch_dates_chk",
      sql`${t.manufactureDate} IS NULL OR ${t.manufactureDate} < ${t.expiryDate}`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Discounts: automatic price discounts / flash sales (code IS NULL) and coupons
// ---------------------------------------------------------------------------
export const discounts = pgTable(
  "discounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** Coupon code; NULL for automatic discounts. Unique case-insensitively. */
    code: varchar("code", { length: 64 }),
    /** Optional admin-facing label, e.g. "Weekend Flash Sale". */
    name: varchar("name", { length: 160 }),
    type: discountTypeEnum("type").notNull(),
    value: money("value").notNull(),
    productId: uuid("product_id").references(() => products.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "cascade" }),
    minOrderAmount: money("min_order_amount"),
    maxDiscountAmount: money("max_discount_amount"),
    usageLimit: integer("usage_limit"),
    usageCount: integer("usage_count").default(0).notNull(),
    perCustomerLimit: integer("per_customer_limit"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    isFlashSale: boolean("is_flash_sale").default(false).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("discounts_code_lower_unique")
      .on(sql`lower(${t.code})`)
      .where(sql`${t.code} IS NOT NULL`),
    index("discounts_active_window_idx").on(t.isActive, t.startsAt, t.endsAt),
    index("discounts_product_idx").on(t.productId),
    index("discounts_category_idx").on(t.categoryId),
    check("discounts_value_positive_chk", sql`${t.value} > 0`),
    check(
      "discounts_percentage_max_chk",
      sql`${t.type} <> 'PERCENTAGE' OR ${t.value} <= 100`,
    ),
    check("discounts_window_chk", sql`${t.endsAt} > ${t.startsAt}`),
    check("discounts_usage_count_nonneg_chk", sql`${t.usageCount} >= 0`),
    check("discounts_usage_limit_positive_chk", sql`${t.usageLimit} IS NULL OR ${t.usageLimit} > 0`),
    check(
      "discounts_per_customer_limit_positive_chk",
      sql`${t.perCustomerLimit} IS NULL OR ${t.perCustomerLimit} > 0`,
    ),
    check(
      "discounts_min_order_nonneg_chk",
      sql`${t.minOrderAmount} IS NULL OR ${t.minOrderAmount} >= 0`,
    ),
    check(
      "discounts_max_discount_positive_chk",
      sql`${t.maxDiscountAmount} IS NULL OR ${t.maxDiscountAmount} > 0`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------
export const orders = pgTable(
  "orders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderNumber: varchar("order_number", { length: 64 }).notNull().unique("orders_order_number_unique"),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "restrict" })
      .notNull(),
    status: orderStatusEnum("status").default("PENDING").notNull(),
    paymentMethod: paymentMethodEnum("payment_method").notNull(),
    paymentStatus: paymentStatusEnum("payment_status").default("UNPAID").notNull(),
    shippingAddress: jsonb("shipping_address").$type<ShippingAddress>().notNull(),
    /** Coupon applied at checkout (automatic price discounts are baked into unit prices). */
    discountId: uuid("discount_id").references(() => discounts.id, { onDelete: "set null" }),
    subtotal: money("subtotal").notNull(),
    deliveryFee: money("delivery_fee").notNull(),
    discountAmount: money("discount_amount").default("0.00").notNull(),
    total: money("total").notNull(),
    courierProvider: varchar("courier_provider", { length: 64 }),
    trackingId: varchar("tracking_id", { length: 128 }),
    pdfInvoiceUrl: varchar("pdf_invoice_url", { length: 512 }),
    shippedAt: timestamp("shipped_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("orders_user_created_idx").on(t.userId, t.createdAt),
    index("orders_status_created_idx").on(t.status, t.createdAt),
    index("orders_created_at_idx").on(t.createdAt),
    index("orders_discount_idx").on(t.discountId),
    check("orders_subtotal_nonneg_chk", sql`${t.subtotal} >= 0`),
    check("orders_delivery_fee_nonneg_chk", sql`${t.deliveryFee} >= 0`),
    check("orders_discount_amount_nonneg_chk", sql`${t.discountAmount} >= 0`),
    check("orders_total_nonneg_chk", sql`${t.total} >= 0`),
  ],
);

// ---------------------------------------------------------------------------
// Order line items & batch allocation link
// ---------------------------------------------------------------------------
export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderId: uuid("order_id")
      .references(() => orders.id, { onDelete: "cascade" })
      .notNull(),
    productId: uuid("product_id")
      .references(() => products.id, { onDelete: "restrict" })
      .notNull(),
    batchId: uuid("batch_id").references(() => productBatches.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull(),
    unitPrice: money("unit_price").notNull(),
    totalPrice: money("total_price").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("order_items_order_idx").on(t.orderId),
    index("order_items_product_idx").on(t.productId),
    index("order_items_batch_idx").on(t.batchId),
    check("order_items_quantity_positive_chk", sql`${t.quantity} > 0`),
    check("order_items_unit_price_nonneg_chk", sql`${t.unitPrice} >= 0`),
    check("order_items_total_price_nonneg_chk", sql`${t.totalPrice} >= 0`),
  ],
);

// ---------------------------------------------------------------------------
// Order status audit trail
// ---------------------------------------------------------------------------
export const orderStatusHistory = pgTable(
  "order_status_history",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderId: uuid("order_id")
      .references(() => orders.id, { onDelete: "cascade" })
      .notNull(),
    fromStatus: orderStatusEnum("from_status"),
    toStatus: orderStatusEnum("to_status").notNull(),
    changedBy: uuid("changed_by").references(() => users.id, { onDelete: "set null" }),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [
    index("order_status_history_order_created_idx").on(t.orderId, t.createdAt),
    index("order_status_history_changed_by_idx").on(t.changedBy),
  ],
);

// ---------------------------------------------------------------------------
// Stock audit ledger
// ---------------------------------------------------------------------------
export const stockHistoryLogs = pgTable(
  "stock_history_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id")
      .references(() => products.id, { onDelete: "restrict" })
      .notNull(),
    batchId: uuid("batch_id").references(() => productBatches.id, { onDelete: "set null" }),
    /**
     * Order that caused the movement (PURCHASE / RETURN), if any.
     * The FK is DEFERRABLE INITIALLY DEFERRED (migration 0002, not expressible
     * in Drizzle) so checkout may reserve stock before inserting the order row
     * inside the same transaction. Re-declaring this FK in a later migration
     * must keep the DEFERRABLE clause.
     */
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    changeDelta: integer("change_delta").notNull(),
    balanceAfter: integer("balance_after").notNull(),
    reason: stockHistoryReasonEnum("reason").notNull(),
    note: text("note"),
    performedByUserId: uuid("performed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
  },
  (t) => [
    index("stock_logs_product_created_idx").on(t.productId, t.createdAt),
    index("stock_logs_batch_idx").on(t.batchId),
    index("stock_logs_order_idx").on(t.orderId),
    index("stock_logs_performed_by_idx").on(t.performedByUserId),
    index("stock_logs_created_at_idx").on(t.createdAt),
    check("stock_logs_balance_nonneg_chk", sql`${t.balanceAfter} >= 0`),
  ],
);

// ---------------------------------------------------------------------------
// Invoices (persisted snapshot + PDF)
// ---------------------------------------------------------------------------
export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    invoiceNumber: varchar("invoice_number", { length: 64 }).notNull().unique("invoices_invoice_number_unique"),
    /** One invoice per order; the unique constraint doubles as the FK index. */
    orderId: uuid("order_id")
      .references(() => orders.id, { onDelete: "cascade" })
      .notNull()
      .unique("invoices_order_id_unique"),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    customerName: varchar("customer_name", { length: 255 }).notNull(),
    customerPhone: varchar("customer_phone", { length: 32 }).notNull(),
    customerAddress: text("customer_address").notNull(),
    // Snapshot of orders.payment_method / payment_status; defaults match those enums.
    paymentMethod: varchar("payment_method", { length: 32 }).default("COD").notNull(),
    paymentStatus: varchar("payment_status", { length: 32 }).default("UNPAID").notNull(),
    subtotal: money("subtotal").notNull(),
    discountAmount: money("discount_amount").default("0.00").notNull(),
    deliveryFee: money("delivery_fee").default("0.00").notNull(),
    totalAmount: money("total_amount").notNull(),
    itemsSnapshot: jsonb("items_snapshot").notNull(),
    pdfBase64: text("pdf_base64"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("invoices_user_idx").on(t.userId),
    index("invoices_customer_phone_idx").on(t.customerPhone),
    index("invoices_created_at_idx").on(t.createdAt),
    check("invoices_subtotal_nonneg_chk", sql`${t.subtotal} >= 0`),
    check("invoices_discount_amount_nonneg_chk", sql`${t.discountAmount} >= 0`),
    check("invoices_delivery_fee_nonneg_chk", sql`${t.deliveryFee} >= 0`),
    check("invoices_total_amount_nonneg_chk", sql`${t.totalAmount} >= 0`),
  ],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------
export const usersRelations = relations(users, ({ many }) => ({
  orders: many(orders),
  stockHistoryLogs: many(stockHistoryLogs),
  invoices: many(invoices),
  orderStatusChanges: many(orderStatusHistory),
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  parent: one(categories, {
    fields: [categories.parentId],
    references: [categories.id],
    relationName: "category_hierarchy",
  }),
  children: many(categories, { relationName: "category_hierarchy" }),
  products: many(products),
  discounts: many(discounts),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  category: one(categories, {
    fields: [products.categoryId],
    references: [categories.id],
  }),
  batches: many(productBatches),
  stockHistoryLogs: many(stockHistoryLogs),
  orderItems: many(orderItems),
  discounts: many(discounts),
}));

export const productBatchesRelations = relations(productBatches, ({ one, many }) => ({
  product: one(products, {
    fields: [productBatches.productId],
    references: [products.id],
  }),
  stockHistoryLogs: many(stockHistoryLogs),
  orderItems: many(orderItems),
}));

export const discountsRelations = relations(discounts, ({ one, many }) => ({
  product: one(products, {
    fields: [discounts.productId],
    references: [products.id],
  }),
  category: one(categories, {
    fields: [discounts.categoryId],
    references: [categories.id],
  }),
  orders: many(orders),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  user: one(users, {
    fields: [orders.userId],
    references: [users.id],
  }),
  discount: one(discounts, {
    fields: [orders.discountId],
    references: [discounts.id],
  }),
  items: many(orderItems),
  statusHistory: many(orderStatusHistory),
  stockHistoryLogs: many(stockHistoryLogs),
  invoice: one(invoices, {
    fields: [orders.id],
    references: [invoices.orderId],
  }),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, {
    fields: [orderItems.orderId],
    references: [orders.id],
  }),
  product: one(products, {
    fields: [orderItems.productId],
    references: [products.id],
  }),
  batch: one(productBatches, {
    fields: [orderItems.batchId],
    references: [productBatches.id],
  }),
}));

export const orderStatusHistoryRelations = relations(orderStatusHistory, ({ one }) => ({
  order: one(orders, {
    fields: [orderStatusHistory.orderId],
    references: [orders.id],
  }),
  changedByUser: one(users, {
    fields: [orderStatusHistory.changedBy],
    references: [users.id],
  }),
}));

export const stockHistoryLogsRelations = relations(stockHistoryLogs, ({ one }) => ({
  product: one(products, {
    fields: [stockHistoryLogs.productId],
    references: [products.id],
  }),
  batch: one(productBatches, {
    fields: [stockHistoryLogs.batchId],
    references: [productBatches.id],
  }),
  order: one(orders, {
    fields: [stockHistoryLogs.orderId],
    references: [orders.id],
  }),
  performedBy: one(users, {
    fields: [stockHistoryLogs.performedByUserId],
    references: [users.id],
  }),
}));

export const invoicesRelations = relations(invoices, ({ one }) => ({
  order: one(orders, {
    fields: [invoices.orderId],
    references: [orders.id],
  }),
  user: one(users, {
    fields: [invoices.userId],
    references: [users.id],
  }),
}));
