### Phase 1 Context & Architecture Blueprint

Phase 1 establishes the operational core of the **My Oxygen** single-owner retail platform. It creates a unified codebase that coordinates the public customer storefront (`apps/web`), the back-office administrative portal (`apps/admin`), and the unified Hono.js REST backend (`apps/api`).

All business invariants are codified at the database and type-system level during this phase:

- **Single-Owner Invariant:** Zero multi-seller entities; every SKU maps to company-owned imported stock.

- **Perishable Tracking Engine:** Skincare and delicate products strictly model manufacturing dates, expiration dates, and distinct batch numbers.

- **Auditability:** Every stock adjustment (imports, sales, returns, expirations) produces an append-only transaction ledger.

- **Strict Type Sharing:** The Hono.js API and the Mantine web client share the same TypeScript interfaces and Zod validation schemas directly via local monorepo packages.

---

### Step 1: Turborepo Monorepo Initialization

Configure a PNPM workspace leveraging Turborepo for pipeline caching, linting, building, and running dev servers across all workspaces.

#### Directory Layout

```text
my-oxygen/
├── apps/
│   ├── api/                    # Hono.js TypeScript backend
│   ├── web/                    # Next.js / Vite + Mantine Storefront
│   └── admin/                  # Mantine Admin Management Portal
├── packages/
│   ├── database/               # Drizzle ORM schemas, migrations, seeders
│   ├── types/                  # Shared domain types, contracts & DTOs
│   ├── config-typescript/      # Shared tsconfig.json configurations
│   └── ui-tokens/              # Design tokens (My Oxygen pastel palette)
├── turbo.json
├── pnpm-workspace.yaml
├── package.json
└── .env.example

```

#### Monorepo Root Configurations

**`pnpm-workspace.yaml`**

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

**`package.json`**

```json
{
  "name": "my-oxygen-monorepo",
  "private": true,
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev",
    "lint": "turbo run lint",
    "format": "prettier --write \"**/*.{ts,tsx,md}\"",
    "db:generate": "pnpm --filter @my-oxygen/database db:generate",
    "db:migrate": "pnpm --filter @my-oxygen/database db:migrate",
    "db:seed": "pnpm --filter @my-oxygen/database db:seed"
  },
  "devDependencies": {
    "prettier": "^3.5.0",
    "turbo": "^2.4.0",
    "typescript": "^5.7.3"
  },
  "packageManager": "pnpm@9.15.4"
}
```

**`turbo.json`**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "!.next/cache/**", "dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "dependsOn": ["^build"]
    },
    "db:generate": {
      "cache": false
    },
    "db:migrate": {
      "cache": false
    }
  }
}
```

---

### Step 2: Shared UI Tokens & Domain Types

Set up `packages/ui-tokens` so that both `apps/web` and `apps/admin` inherit the exact My Oxygen design palette.

**`packages/ui-tokens/src/colors.ts`**

```typescript
export const myOxygenColors = {
  // Brand Core
  primaryPink: "#FF6B8B", // Buttons, highlights, primary CTAs[cite: 1]
  secondaryGreen: "#4CAF7D", // Trust badges, headers, icons[cite: 1]
  accentPurple: "#A78BFA", // Category accents, hover badges[cite: 1]

  // Canvas & Surfaces
  creamBackground: "#FFF8F6", // Global page canvas[cite: 1]
  surfaceWhite: "#FFFFFF", // Elevated cards & modals[cite: 1]

  // Typography
  darkText: "#1F2937", // Headings, titles, high contrast[cite: 1]
  textGray: "#6B7280", // Body text, placeholders[cite: 1]

  // Status & Feedback
  success: "#10B981", // Confirmations, active stock[cite: 1]
  warning: "#F59E0B", // Expiring alerts, low stock[cite: 1]
  error: "#EF4444", // Form errors, critical alerts[cite: 1]
} as const;

export const brandGradients = {
  primary: "linear-gradient(135deg, #FF6B8B 0%, #F472B6 100%)", //[cite: 1]
  secondary: "linear-gradient(135deg, #4CAF7D 0%, #A78BFA 100%)", //[cite: 1]
} as const;
```

---

### Step 3: PostgreSQL Schema Modeling (`packages/database`)

Install and configure **Drizzle ORM** with **PostgreSQL**. Drizzle provides end-to-end type safety, native SQL performance, and friction-free generation of Zod schemas via `drizzle-zod`.

#### `packages/database/src/schema/enums.ts`

```typescript
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
```

#### `packages/database/src/schema/tables.ts`

```typescript
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
  code: varchar("code", { length: 64 }).unique(), // Nullable for global flash sales
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
  batchId: uuid("batch_id").references(() => productBatches.id), // Tracks fulfilled batch
  quantity: integer("quantity").notNull(),
  unitPrice: numeric("unit_price", { precision: 10, scale: 2 }).notNull(),
  totalPrice: numeric("total_price", { precision: 10, scale: 2 }).notNull(),
});
```

---

### Step 4: Database Connection Pool & Seed Script

#### `packages/database/src/client.ts`

```typescript
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema/tables";
import * as enums from "./schema/enums";

const connectionString =
  process.env.DATABASE_URL ||
  "postgres://postgres:postgres@localhost:5432/my_oxygen";

export const pool = new Pool({
  connectionString,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

export const db = drizzle(pool, { schema: { ...schema, ...enums } });
export type DatabaseClient = typeof db;
```

#### `packages/database/src/seed.ts`

```typescript
import { db } from "./client";
import { categories, products, productBatches, users } from "./schema/tables";
import * as bcrypt from "bcrypt";

async function seed() {
  console.log("🌱 Seeding database...");

  // 1. Seed Core Categories
  const categoryData = [
    { name: "Newborn", slug: "newborn", iconUrl: "/icons/newborn.svg" }, //[cite: 1]
    {
      name: "Mother Care",
      slug: "mother-care",
      iconUrl: "/icons/mother-care.svg",
    }, //[cite: 1]
    { name: "Skin Care", slug: "skin-care", iconUrl: "/icons/skin-care.svg" }, //[cite: 1]
    {
      name: "Inner Wear",
      slug: "inner-wear",
      iconUrl: "/icons/inner-wear.svg",
    }, //[cite: 1]
  ];

  const insertedCategories = await db
    .insert(categories)
    .values(categoryData)
    .returning();

  // 2. Seed Super Admin
  const adminPasswordHash = await bcrypt.hash("Admin@MyOxygen2026", 10);
  await db.insert(users).values({
    fullName: "System Super Admin",
    email: "admin@myoxygen.com",
    phone: "+8801700000000",
    passwordHash: adminPasswordHash,
    role: "SUPER_ADMIN", //[cite: 3]
  });

  // 3. Seed Perishable Skincare Product with Batches
  const skinCareCat = insertedCategories.find((c) => c.slug === "skin-care")!;
  const [skinCareProduct] = await db
    .insert(products)
    .values({
      categoryId: skinCareCat.id,
      title: "Natural Hydrating Face Wash",
      slug: "natural-hydrating-face-wash",
      sku: "SKN-FW-001",
      description:
        "Gentle dermatologically tested organic face cleanser for mothers.",
      basePrice: "650.00", //[cite: 1]
      costPrice: "420.00",
      images: [
        "https://images.unsplash.com/photo-1556228720-195a672e8a03?w=800",
      ],
      requiresBatchTracking: true, //[cite: 3]
      lowStockThreshold: 10, //[cite: 3]
    })
    .returning();

  // Add 2 Batches (FEFO Test Setup)
  await db.insert(productBatches).values([
    {
      productId: skinCareProduct.id,
      batchNumber: "BATCH-2026-A",
      manufactureDate: "2026-01-10",
      expiryDate: "2026-08-30", // Expires earlier
      initialQuantity: 50,
      availableQuantity: 50,
    },
    {
      productId: skinCareProduct.id,
      batchNumber: "BATCH-2026-B",
      manufactureDate: "2026-02-15",
      expiryDate: "2027-02-15", // Expires later
      initialQuantity: 100,
      availableQuantity: 100,
    },
  ]);

  console.log("✅ Seeding completed successfully.");
  process.exit(0);
}

seed().catch((err) => {
  console.error("❌ Seeding failed:", err);
  process.exit(1);
});
```

---

### Step 5: Hono.js Foundation & Environment Configuration (`apps/api`)

Configure `apps/api` with Hono, TypeScript, structured CORS, request logging, standard error trapping, and an operational database readiness probe.

#### `apps/api/src/env.ts`

```typescript
import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  CORS_ORIGIN: z.string().default("*"),
});

export const env = envSchema.parse(process.env);
```

#### `apps/api/src/index.ts`

```typescript
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { prettyJSON } from "hono/pretty-json";
import { pool } from "@my-oxygen/database";
import { env } from "./env";

const app = new Hono();

// Global Middlewares
app.use("*", logger());
app.use("*", prettyJSON());
app.use(
  "*",
  cors({
    origin: env.CORS_ORIGIN.split(","),
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
    credentials: true,
  }),
);

// Centralized Healthcheck & DB Liveness Probe
app.get("/health", async (c) => {
  try {
    const dbRes = await pool.query("SELECT 1 AS alive");
    return c.json({
      status: "UP",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      database: dbRes.rows[0].alive === 1 ? "CONNECTED" : "DISCONNECTED",
    });
  } catch (error) {
    return c.json(
      {
        status: "DOWN",
        database: "ERROR",
        details: (error as Error).message,
      },
      503,
    );
  }
});

// Global Error Handler
app.onError((err, c) => {
  console.error("Unhandled Application Exception:", err);
  return c.json(
    {
      success: false,
      error: {
        message: err.message || "Internal Server Error",
        stack: env.NODE_ENV === "development" ? err.stack : undefined,
      },
    },
    500,
  );
});

// Boot Server
serve(
  {
    fetch: app.fetch,
    port: env.PORT,
  },
  (info) => {
    console.log(`🚀 My Oxygen API running on http://localhost:${info.port}`);
  },
);
```

---

### Step 6: Phase 1 Verification Checklist

Execute these validation commands sequentially before initiating Phase 2:

1. **Monorepo Build Integrity:**

```bash
pnpm install
pnpm build

```

_Expected outcome:_ All workspace packages compile without TypeScript definition mismatches. 2. **Database Migration Execution:**

```bash
pnpm db:generate
pnpm db:migrate

```

_Expected outcome:_ Tables (`users`, `categories`, `products`, `product_batches`, `stock_history_logs`, `discounts`, `orders`, `order_items`) generated in PostgreSQL. 3. **Deterministic Seeding:**

```bash
pnpm db:seed

```

_Expected outcome:_ Four core categories, Super Admin account, and test batches inserted.

4. **API Health Verification:**

```bash
pnpm --filter @my-oxygen/api dev
curl http://localhost:4000/health

```

_Expected outcome:_ Returns HTTP 200 with `status: "UP"` and `database: "CONNECTED"`.
