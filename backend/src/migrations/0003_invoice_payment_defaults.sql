ALTER TABLE "invoices" ALTER COLUMN "payment_method" SET DEFAULT 'COD';--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "payment_status" SET DEFAULT 'UNPAID';