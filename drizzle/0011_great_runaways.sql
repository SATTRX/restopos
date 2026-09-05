CREATE TABLE "restaurant_stats" (
	"restaurant_id" text PRIMARY KEY NOT NULL,
	"next_folio" integer DEFAULT 1 NOT NULL,
	"total_shifts_opened" integer DEFAULT 0 NOT NULL,
	"total_shifts_closed" integer DEFAULT 0 NOT NULL,
	"lifetime_sales_cents" integer DEFAULT 0 NOT NULL,
	"lifetime_cash_sales_cents" integer DEFAULT 0 NOT NULL,
	"lifetime_card_sales_cents" integer DEFAULT 0 NOT NULL,
	"lifetime_transfer_sales_cents" integer DEFAULT 0 NOT NULL,
	"lifetime_expenses_cents" integer DEFAULT 0 NOT NULL,
	"lifetime_sales_count" integer DEFAULT 0 NOT NULL,
	"last_closed_at" timestamp,
	"last_closed_total_cents" integer,
	"last_closed_orders" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inventory_item" ADD COLUMN "previous_cost_cents" integer;--> statement-breakpoint
ALTER TABLE "inventory_item" ADD COLUMN "previous_cost_at" timestamp;--> statement-breakpoint
ALTER TABLE "inventory_item" ADD COLUMN "cost_updated_at" timestamp;--> statement-breakpoint
ALTER TABLE "cash_shift" DROP COLUMN "closed_by_user_id";--> statement-breakpoint
ALTER TABLE "cash_shift" DROP COLUMN "closed_by_name";--> statement-breakpoint
ALTER TABLE "cash_shift" DROP COLUMN "closing_cash_cents";--> statement-breakpoint
ALTER TABLE "cash_shift" DROP COLUMN "cash_sales_cents";--> statement-breakpoint
ALTER TABLE "cash_shift" DROP COLUMN "card_sales_cents";--> statement-breakpoint
ALTER TABLE "cash_shift" DROP COLUMN "transfer_sales_cents";--> statement-breakpoint
ALTER TABLE "cash_shift" DROP COLUMN "expenses_cents";--> statement-breakpoint
ALTER TABLE "cash_shift" DROP COLUMN "sales_count";--> statement-breakpoint
ALTER TABLE "cash_shift" DROP COLUMN "expected_cash_cents";--> statement-breakpoint
ALTER TABLE "cash_shift" DROP COLUMN "difference_cents";--> statement-breakpoint
ALTER TABLE "cash_shift" DROP COLUMN "closed_at";--> statement-breakpoint
ALTER TABLE "cash_shift" DROP COLUMN "status";