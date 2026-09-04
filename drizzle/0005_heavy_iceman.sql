CREATE TABLE "cash_shift" (
	"id" text PRIMARY KEY NOT NULL,
	"restaurant_id" text NOT NULL,
	"branch_id" text NOT NULL,
	"opened_by_user_id" text NOT NULL,
	"opened_by_name" text NOT NULL,
	"opening_cash_cents" integer DEFAULT 0 NOT NULL,
	"opened_at" timestamp DEFAULT now() NOT NULL,
	"closed_by_user_id" text,
	"closed_by_name" text,
	"closing_cash_cents" integer,
	"expected_cash_cents" integer,
	"difference_cents" integer,
	"closed_at" timestamp,
	"status" text DEFAULT 'open' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sale" ADD COLUMN "restaurant_id" text;--> statement-breakpoint
ALTER TABLE "sale" ADD COLUMN "shift_id" text;--> statement-breakpoint
ALTER TABLE "sale" ADD COLUMN "table_order_id" text;--> statement-breakpoint
ALTER TABLE "sale" ADD COLUMN "folio" integer;--> statement-breakpoint
ALTER TABLE "sale" ADD COLUMN "subtotal_cents" integer;--> statement-breakpoint
ALTER TABLE "sale" ADD COLUMN "tax_cents" integer;--> statement-breakpoint
ALTER TABLE "table_order_item" ADD COLUMN "sent_to_kitchen_at" timestamp;