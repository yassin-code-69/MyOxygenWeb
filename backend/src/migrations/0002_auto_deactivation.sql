-- 0002_auto_deactivation
--
-- 1. products.auto_deactivated_at: set by the inventory engine when a
--    product's sellable stock reaches 0 and it is hidden automatically. Only
--    products carrying this marker are re-activated when stock returns; a
--    manual (admin) deactivation clears it.
--
-- 2. stock_history_logs.order_id FK becomes DEFERRABLE INITIALLY DEFERRED so a
--    checkout transaction can write PURCHASE ledger rows (linked to the order)
--    before the order row itself is inserted. The reference is still checked,
--    at COMMIT. Drizzle cannot express DEFERRABLE, so this statement is
--    hand-written; the snapshot does not track it (no drift on `db:generate`).
ALTER TABLE "products" ADD COLUMN "auto_deactivated_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "stock_history_logs" ALTER CONSTRAINT "stock_history_logs_order_id_orders_id_fk" DEFERRABLE INITIALLY DEFERRED;
