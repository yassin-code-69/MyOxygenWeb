-- 0001_search_and_security
--
-- 1. Fuzzy catalog search: pg_trgm lives in the dedicated `extensions` schema
--    (Supabase convention; keeps extension objects out of `public`).
--    Call its functions/operators schema-qualified, e.g.
--      extensions.similarity(title, $1)
--      title OPERATOR(extensions.%) $1
--    The GIN indexes below accelerate ILIKE '%term%' and the % / <% operators
--    (plain similarity() calls in ORDER BY are evaluated per row).
--
-- 2. Row Level Security on every public table, with NO policies.
--    The API connects as the table owner, which bypasses RLS, so the app is
--    unaffected. Supabase's PostgREST roles (anon / authenticated) therefore
--    see nothing. Any table added later must also `ENABLE ROW LEVEL SECURITY`.

CREATE SCHEMA IF NOT EXISTS extensions;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "products_title_trgm_idx"
  ON "products" USING gin ("title" extensions.gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "products_description_trgm_idx"
  ON "products" USING gin ("description" extensions.gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "products_search_text_trgm_idx"
  ON "products" USING gin (("title" || ' ' || coalesce("description", '')) extensions.gin_trgm_ops);
--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "categories" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "products" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "product_batches" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "discounts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "orders" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "order_items" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "order_status_history" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "stock_history_logs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "invoices" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
-- Defense in depth on Supabase: the Data API roles get no table privileges
-- at all. The roles do not exist on a plain Postgres (local tests), so this
-- is a no-op there.
DO $$
DECLARE
  api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format(
        'REVOKE ALL ON TABLE public.users, public.categories, public.products, public.product_batches, '
        'public.discounts, public.orders, public.order_items, public.order_status_history, '
        'public.stock_history_logs, public.invoices FROM %I',
        api_role
      );
    END IF;
  END LOOP;
END
$$;
