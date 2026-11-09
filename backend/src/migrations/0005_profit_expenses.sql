-- 0005_profit_expenses
--
-- 1. `expenses`: operating costs for the profit report (SUPER_ADMIN only).
--    Product cost is never entered here; it comes from order_items.unit_cost.
--    RLS is enabled with no policies and the Supabase Data API roles get no
--    privileges (same model as 0001_search_and_security).
-- 2. `products.cost_breakdown` (jsonb, nullable): optional itemisation of the
--    landed cost; product.service.ts keeps cost_price = sum of its components.
-- 3. `order_items.unit_cost`: cost price snapshot at checkout (COGS). Added as
--    nullable, backfilled with the products' CURRENT cost price (the best
--    information available for historical rows), then made NOT NULL.
-- 4. Indexes for the dashboard / activity feed (newest customers per role,
--    newest status changes).
CREATE TYPE "public"."expense_category" AS ENUM('SHIPPING', 'MARKETING', 'DELIVERY_SUBSIDY', 'PACKAGING', 'SALARIES', 'RENT', 'UTILITIES', 'OTHER');--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" "expense_category" NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"incurred_on" date NOT NULL,
	"vendor" varchar(120),
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expenses_amount_positive_chk" CHECK ("expenses"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "unit_cost" numeric(10, 2);--> statement-breakpoint
UPDATE "order_items" AS oi SET "unit_cost" = p."cost_price" FROM "products" AS p WHERE p."id" = oi."product_id";--> statement-breakpoint
ALTER TABLE "order_items" ALTER COLUMN "unit_cost" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "cost_breakdown" jsonb;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "expenses_incurred_on_idx" ON "expenses" USING btree ("incurred_on");--> statement-breakpoint
CREATE INDEX "expenses_category_idx" ON "expenses" USING btree ("category");--> statement-breakpoint
CREATE INDEX "expenses_created_by_idx" ON "expenses" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "order_status_history_created_at_idx" ON "order_status_history" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "users_role_created_idx" ON "users" USING btree ("role","created_at");--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_unit_cost_nonneg_chk" CHECK ("order_items"."unit_cost" >= 0);--> statement-breakpoint
ALTER TABLE "expenses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- Defense in depth on Supabase: no Data API privileges on the new table. The
-- roles do not exist on a plain Postgres (local tests, CI), so this is a no-op there.
DO $$
DECLARE
  api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.expenses FROM %I', api_role);
    END IF;
  END LOOP;
END
$$;
