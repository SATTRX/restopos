CREATE TABLE "product_ingredient" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"inventory_item_id" text NOT NULL,
	"quantity_per_unit" integer DEFAULT 1 NOT NULL,
	"is_optional" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sale" ADD COLUMN "is_takeout" boolean DEFAULT false NOT NULL;