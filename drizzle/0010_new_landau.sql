CREATE TABLE "restaurant_zone" (
	"id" text PRIMARY KEY NOT NULL,
	"restaurant_id" text NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cash_shift" ADD COLUMN "sales_count" integer;--> statement-breakpoint
ALTER TABLE "restaurant_table" ADD COLUMN "zone_id" text;