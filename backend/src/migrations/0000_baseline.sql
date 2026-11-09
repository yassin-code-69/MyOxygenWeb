CREATE TYPE "public"."discount_type" AS ENUM('PERCENTAGE', 'FIXED_AMOUNT');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('COD', 'ONLINE_GATEWAY');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('UNPAID', 'PAID', 'REFUNDED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."stock_history_reason" AS ENUM('IMPORT', 'PURCHASE', 'RETURN', 'MANUAL_ADJUSTMENT', 'EXPIRED_SCRAP');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('SUPER_ADMIN', 'INVENTORY_MANAGER', 'ORDER_MANAGER', 'MARKETING_MANAGER', 'SUPPORT_STAFF', 'CUSTOMER');--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"icon_url" varchar(512),
	"parent_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_slug_unique" UNIQUE("slug"),
	CONSTRAINT "categories_not_own_parent_chk" CHECK ("categories"."parent_id" IS NULL OR "categories"."parent_id" <> "categories"."id")
);
--> statement-breakpoint
CREATE TABLE "discounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(64),
	"name" varchar(160),
	"type" "discount_type" NOT NULL,
	"value" numeric(10, 2) NOT NULL,
	"product_id" uuid,
	"category_id" uuid,
	"min_order_amount" numeric(10, 2),
	"max_discount_amount" numeric(10, 2),
	"usage_limit" integer,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"per_customer_limit" integer,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"is_flash_sale" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discounts_value_positive_chk" CHECK ("discounts"."value" > 0),
	CONSTRAINT "discounts_percentage_max_chk" CHECK ("discounts"."type" <> 'PERCENTAGE' OR "discounts"."value" <= 100),
	CONSTRAINT "discounts_window_chk" CHECK ("discounts"."ends_at" > "discounts"."starts_at"),
	CONSTRAINT "discounts_usage_count_nonneg_chk" CHECK ("discounts"."usage_count" >= 0),
	CONSTRAINT "discounts_usage_limit_positive_chk" CHECK ("discounts"."usage_limit" IS NULL OR "discounts"."usage_limit" > 0),
	CONSTRAINT "discounts_per_customer_limit_positive_chk" CHECK ("discounts"."per_customer_limit" IS NULL OR "discounts"."per_customer_limit" > 0),
	CONSTRAINT "discounts_min_order_nonneg_chk" CHECK ("discounts"."min_order_amount" IS NULL OR "discounts"."min_order_amount" >= 0),
	CONSTRAINT "discounts_max_discount_positive_chk" CHECK ("discounts"."max_discount_amount" IS NULL OR "discounts"."max_discount_amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_number" varchar(64) NOT NULL,
	"order_id" uuid NOT NULL,
	"user_id" uuid,
	"customer_name" varchar(255) NOT NULL,
	"customer_phone" varchar(32) NOT NULL,
	"customer_address" text NOT NULL,
	"payment_method" varchar(32) DEFAULT 'CASH_ON_DELIVERY' NOT NULL,
	"payment_status" varchar(32) DEFAULT 'PENDING' NOT NULL,
	"subtotal" numeric(10, 2) NOT NULL,
	"discount_amount" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"delivery_fee" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"total_amount" numeric(10, 2) NOT NULL,
	"items_snapshot" jsonb NOT NULL,
	"pdf_base64" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_invoice_number_unique" UNIQUE("invoice_number"),
	CONSTRAINT "invoices_order_id_unique" UNIQUE("order_id"),
	CONSTRAINT "invoices_subtotal_nonneg_chk" CHECK ("invoices"."subtotal" >= 0),
	CONSTRAINT "invoices_discount_amount_nonneg_chk" CHECK ("invoices"."discount_amount" >= 0),
	CONSTRAINT "invoices_delivery_fee_nonneg_chk" CHECK ("invoices"."delivery_fee" >= 0),
	CONSTRAINT "invoices_total_amount_nonneg_chk" CHECK ("invoices"."total_amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"batch_id" uuid,
	"quantity" integer NOT NULL,
	"unit_price" numeric(10, 2) NOT NULL,
	"total_price" numeric(10, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_items_quantity_positive_chk" CHECK ("order_items"."quantity" > 0),
	CONSTRAINT "order_items_unit_price_nonneg_chk" CHECK ("order_items"."unit_price" >= 0),
	CONSTRAINT "order_items_total_price_nonneg_chk" CHECK ("order_items"."total_price" >= 0)
);
--> statement-breakpoint
CREATE TABLE "order_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"from_status" "order_status",
	"to_status" "order_status" NOT NULL,
	"changed_by" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_number" varchar(64) NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "order_status" DEFAULT 'PENDING' NOT NULL,
	"payment_method" "payment_method" NOT NULL,
	"payment_status" "payment_status" DEFAULT 'UNPAID' NOT NULL,
	"shipping_address" jsonb NOT NULL,
	"discount_id" uuid,
	"subtotal" numeric(10, 2) NOT NULL,
	"delivery_fee" numeric(10, 2) NOT NULL,
	"discount_amount" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"total" numeric(10, 2) NOT NULL,
	"courier_provider" varchar(64),
	"tracking_id" varchar(128),
	"pdf_invoice_url" varchar(512),
	"shipped_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_order_number_unique" UNIQUE("order_number"),
	CONSTRAINT "orders_subtotal_nonneg_chk" CHECK ("orders"."subtotal" >= 0),
	CONSTRAINT "orders_delivery_fee_nonneg_chk" CHECK ("orders"."delivery_fee" >= 0),
	CONSTRAINT "orders_discount_amount_nonneg_chk" CHECK ("orders"."discount_amount" >= 0),
	CONSTRAINT "orders_total_nonneg_chk" CHECK ("orders"."total" >= 0)
);
--> statement-breakpoint
CREATE TABLE "product_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"batch_number" varchar(64) NOT NULL,
	"manufacture_date" date,
	"expiry_date" date NOT NULL,
	"initial_quantity" integer NOT NULL,
	"available_quantity" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "batch_available_nonneg_chk" CHECK ("product_batches"."available_quantity" >= 0),
	CONSTRAINT "batch_initial_positive_chk" CHECK ("product_batches"."initial_quantity" > 0),
	CONSTRAINT "batch_dates_chk" CHECK ("product_batches"."manufacture_date" IS NULL OR "product_batches"."manufacture_date" < "product_batches"."expiry_date")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid NOT NULL,
	"title" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"sku" varchar(64) NOT NULL,
	"brand" varchar(120),
	"description" text NOT NULL,
	"base_price" numeric(10, 2) NOT NULL,
	"cost_price" numeric(10, 2) NOT NULL,
	"images" text[] DEFAULT '{}'::text[] NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"requires_batch_tracking" boolean DEFAULT false NOT NULL,
	"low_stock_threshold" integer DEFAULT 5 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_slug_unique" UNIQUE("slug"),
	CONSTRAINT "products_sku_unique" UNIQUE("sku"),
	CONSTRAINT "products_base_price_nonneg_chk" CHECK ("products"."base_price" >= 0),
	CONSTRAINT "products_cost_price_nonneg_chk" CHECK ("products"."cost_price" >= 0),
	CONSTRAINT "products_low_stock_threshold_nonneg_chk" CHECK ("products"."low_stock_threshold" >= 0)
);
--> statement-breakpoint
CREATE TABLE "stock_history_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"batch_id" uuid,
	"order_id" uuid,
	"change_delta" integer NOT NULL,
	"balance_after" integer NOT NULL,
	"reason" "stock_history_reason" NOT NULL,
	"note" text,
	"performed_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_logs_balance_nonneg_chk" CHECK ("stock_history_logs"."balance_after" >= 0)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role" "user_role" DEFAULT 'CUSTOMER' NOT NULL,
	"full_name" varchar(255) NOT NULL,
	"email" varchar(255),
	"phone" varchar(32) NOT NULL,
	"password_hash" varchar(255),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_phone_unique" UNIQUE("phone"),
	CONSTRAINT "users_email_lowercase_chk" CHECK ("users"."email" IS NULL OR "users"."email" = lower("users"."email"))
);
--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_batch_id_product_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."product_batches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_discount_id_discounts_id_fk" FOREIGN KEY ("discount_id") REFERENCES "public"."discounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_batches" ADD CONSTRAINT "product_batches_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_history_logs" ADD CONSTRAINT "stock_history_logs_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_history_logs" ADD CONSTRAINT "stock_history_logs_batch_id_product_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."product_batches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_history_logs" ADD CONSTRAINT "stock_history_logs_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_history_logs" ADD CONSTRAINT "stock_history_logs_performed_by_user_id_users_id_fk" FOREIGN KEY ("performed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "categories_parent_idx" ON "categories" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "categories_active_sort_idx" ON "categories" USING btree ("is_active","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "discounts_code_lower_unique" ON "discounts" USING btree (lower("code")) WHERE "discounts"."code" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "discounts_active_window_idx" ON "discounts" USING btree ("is_active","starts_at","ends_at");--> statement-breakpoint
CREATE INDEX "discounts_product_idx" ON "discounts" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "discounts_category_idx" ON "discounts" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "invoices_user_idx" ON "invoices" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "invoices_customer_phone_idx" ON "invoices" USING btree ("customer_phone");--> statement-breakpoint
CREATE INDEX "invoices_created_at_idx" ON "invoices" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "order_items_order_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_items_product_idx" ON "order_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "order_items_batch_idx" ON "order_items" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "order_status_history_order_created_idx" ON "order_status_history" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE INDEX "order_status_history_changed_by_idx" ON "order_status_history" USING btree ("changed_by");--> statement-breakpoint
CREATE INDEX "orders_user_created_idx" ON "orders" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "orders_status_created_idx" ON "orders" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "orders_created_at_idx" ON "orders" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "orders_discount_idx" ON "orders" USING btree ("discount_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_batch_unique" ON "product_batches" USING btree ("product_id","batch_number");--> statement-breakpoint
CREATE INDEX "batch_product_expiry_idx" ON "product_batches" USING btree ("product_id","expiry_date");--> statement-breakpoint
CREATE INDEX "batch_expiry_in_stock_idx" ON "product_batches" USING btree ("expiry_date") WHERE "product_batches"."available_quantity" > 0;--> statement-breakpoint
CREATE INDEX "products_category_idx" ON "products" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "products_brand_idx" ON "products" USING btree ("brand");--> statement-breakpoint
CREATE INDEX "products_active_created_idx" ON "products" USING btree ("is_active","created_at");--> statement-breakpoint
CREATE INDEX "stock_logs_product_created_idx" ON "stock_history_logs" USING btree ("product_id","created_at");--> statement-breakpoint
CREATE INDEX "stock_logs_batch_idx" ON "stock_history_logs" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "stock_logs_order_idx" ON "stock_history_logs" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "stock_logs_performed_by_idx" ON "stock_history_logs" USING btree ("performed_by_user_id");--> statement-breakpoint
CREATE INDEX "stock_logs_created_at_idx" ON "stock_history_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" USING btree ("role");