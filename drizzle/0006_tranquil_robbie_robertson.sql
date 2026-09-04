CREATE TABLE "shift_movement" (
	"id" text PRIMARY KEY NOT NULL,
	"shift_id" text NOT NULL,
	"restaurant_id" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"description" text NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_by_name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cash_shift" ADD COLUMN "cash_sales_cents" integer;--> statement-breakpoint
ALTER TABLE "cash_shift" ADD COLUMN "card_sales_cents" integer;--> statement-breakpoint
ALTER TABLE "cash_shift" ADD COLUMN "transfer_sales_cents" integer;--> statement-breakpoint
ALTER TABLE "cash_shift" ADD COLUMN "expenses_cents" integer;