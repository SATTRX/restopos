CREATE TABLE "comanda" (
	"id" text PRIMARY KEY NOT NULL,
	"restaurant_id" text NOT NULL,
	"shift_id" text NOT NULL,
	"table_id" text NOT NULL,
	"comanda_number" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "table_order_item" ADD COLUMN "comanda_id" text;