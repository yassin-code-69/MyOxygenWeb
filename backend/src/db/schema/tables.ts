import { relations } from "drizzle-orm";
import {
  pgTable,
  uuid,
  varchar,
  text,
  numeric,
  boolean,
  integer,
  timestamp,
  date,
  index,
  uniqueIndex,
  jsonb,
} from "drizzle-orm/pg-core";
import {
  userRoleEnum,
  orderStatusEnum,
  paymentMethodEnum,
  paymentStatusEnum,
  discountTypeEnum,
  stockHistoryReasonEnum,
} from "./enums";

// Users & RBAC
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  role: userRoleEnum("role").default("CUSTOMER").notNull(),
  fullName: varchar("full_name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).unique(),
  phone: varchar("phone", { length: 32 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// Categories (Newborn, Mother Care, Skin Care, Inner Wear)
export const categories = pgTable("categories", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  iconUrl: varchar("icon_url", { length: 512 }),
  parentId: uuid("parent_id"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// Products Master
export const products = pgTable(
  "products",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    categoryId: uuid("category_id")
      .references(() => categories.id, { onDelete: "restrict" })
      .notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 255 }).notNull().unique(),
    sku: varchar("sku", { length: 64 }).notNull().unique(),
    description: text("description").notNull(),
    basePrice: numeric("base_price", { precision: 10, scale: 2 }).notNull(),
    costPrice: numeric("cost_price", { precision: 10, scale: 2 }).notNull(),
    images: text("images").array().notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    requiresBatchTracking: boolean("requires_batch_tracking")
      .default(false)
      .notNull(),
    lowStockThreshold: integer("low_stock_threshold").default(5).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("products_category_idx").on(table.categoryId),
    index("products_sku_idx").on(table.sku),
    index("products_active_idx").on(table.isActive),
  ],
);

// Product Batches (Crucial for Skincare FEFO)
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("product_batch_unique").on(table.productId, table.batchNumber),
    index("batch_expiry_idx").on(table.expiryDate),
    index("batch_available_idx").on(table.availableQuantity),
  ],
);

// Stock Audit Ledger
export const stockHistoryLogs = pgTable(
  "stock_history_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id")
      .references(() => products.id, { onDelete: "restrict" })
      .notNull(),
    batchId: uuid("batch_id").references(() => productBatches.id, {
      onDelete: "set null",
    }),
    changeDelta: integer("change_delta").notNull(),
    balanceAfter: integer("balance_after").notNull(),
    reason: stockHistoryReasonEnum("reason").notNull(),
    note: text("note"),
    performedByUserId: uuid("performed_by_user_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("stock_logs_product_idx").on(table.productId),
    index("stock_logs_batch_idx").on(table.batchId),
  ],
);

// Discounts, Coupons & Flash Sales
export const discounts = pgTable("discounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: varchar("code", { length: 64 }).unique(),
  type: discountTypeEnum("type").notNull(),
  value: numeric("value", { precision: 10, scale: 2 }).notNull(),
  productId: uuid("product_id").references(() => products.id, {
    onDelete: "cascade",
  }),
  categoryId: uuid("category_id").references(() => categories.id, {
    onDelete: "cascade",
  }),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  isFlashSale: boolean("is_flash_sale").default(false).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
});

// Orders & Shipments
export const orders = pgTable("orders", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderNumber: varchar("order_number", { length: 64 }).notNull().unique(),
  userId: uuid("user_id")
    .references(() => users.id)
    .notNull(),
  status: orderStatusEnum("status").default("PENDING").notNull(),
  paymentMethod: paymentMethodEnum("payment_method").notNull(),
  paymentStatus: paymentStatusEnum("payment_status")
    .default("UNPAID")
    .notNull(),
  shippingAddress: text("shipping_address").notNull(),
  subtotal: numeric("subtotal", { precision: 10, scale: 2 }).notNull(),
  deliveryFee: numeric("delivery_fee", { precision: 10, scale: 2 }).notNull(),
  discountAmount: numeric("discount_amount", { precision: 10, scale: 2 })
    .default("0.00")
    .notNull(),
  total: numeric("total", { precision: 10, scale: 2 }).notNull(),
  courierProvider: varchar("courier_provider", { length: 64 }),
  trackingId: varchar("tracking_id", { length: 128 }),
  pdfInvoiceUrl: varchar("pdf_invoice_url", { length: 512 }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// Order Line Items & Batch Allocation Link
export const orderItems = pgTable("order_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderId: uuid("order_id")
    .references(() => orders.id, { onDelete: "cascade" })
    .notNull(),
  productId: uuid("product_id")
    .references(() => products.id)
    .notNull(),
  batchId: uuid("batch_id").references(() => productBatches.id),
  quantity: integer("quantity").notNull(),
  unitPrice: numeric("unit_price", { precision: 10, scale: 2 }).notNull(),
  totalPrice: numeric("total_price", { precision: 10, scale: 2 }).notNull(),
});

// Invoices Master (Persistent DB storage, zero-disk)
export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    invoiceNumber: varchar("invoice_number", { length: 64 }).notNull().unique(),
    orderId: uuid("order_id")
      .references(() => orders.id, { onDelete: "cascade" })
      .notNull()
      .unique(),
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    customerName: varchar("customer_name", { length: 255 }).notNull(),
    customerPhone: varchar("customer_phone", { length: 32 }).notNull(),
    customerAddress: text("customer_address").notNull(),
    paymentMethod: varchar("payment_method", { length: 32 })
      .default("CASH_ON_DELIVERY")
      .notNull(),
    paymentStatus: varchar("payment_status", { length: 32 })
      .default("PENDING")
      .notNull(),
    subtotal: numeric("subtotal", { precision: 10, scale: 2 }).notNull(),
    discountAmount: numeric("discount_amount", { precision: 10, scale: 2 })
      .default("0.00")
      .notNull(),
    deliveryFee: numeric("delivery_fee", { precision: 10, scale: 2 })
      .default("0.00")
      .notNull(),
    totalAmount: numeric("total_amount", { precision: 10, scale: 2 }).notNull(),
    itemsSnapshot: jsonb("items_snapshot").notNull(),
    pdfBase64: text("pdf_base64"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("invoices_order_idx").on(table.orderId),
    index("invoices_user_idx").on(table.userId),
    index("invoices_customer_phone_idx").on(table.customerPhone),
    index("invoices_created_at_idx").on(table.createdAt),
  ],
);

// Relations
export const categoriesRelations = relations(categories, ({ one, many }) => ({
  parent: one(categories, {
    fields: [categories.parentId],
    references: [categories.id],
    relationName: "category_hierarchy",
  }),
  children: many(categories, {
    relationName: "category_hierarchy",
  }),
  products: many(products),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  category: one(categories, {
    fields: [products.categoryId],
    references: [categories.id],
  }),
  batches: many(productBatches),
  stockHistoryLogs: many(stockHistoryLogs),
  orderItems: many(orderItems),
}));

export const productBatchesRelations = relations(productBatches, ({ one, many }) => ({
  product: one(products, {
    fields: [productBatches.productId],
    references: [products.id],
  }),
  stockHistoryLogs: many(stockHistoryLogs),
  orderItems: many(orderItems),
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
  performedBy: one(users, {
    fields: [stockHistoryLogs.performedByUserId],
    references: [users.id],
  }),
}));

export const usersRelations = relations(users, ({ many }) => ({
  orders: many(orders),
  stockHistoryLogs: many(stockHistoryLogs),
  invoices: many(invoices),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  user: one(users, {
    fields: [orders.userId],
    references: [users.id],
  }),
  items: many(orderItems),
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
