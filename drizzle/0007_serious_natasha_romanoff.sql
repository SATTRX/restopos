ALTER TABLE "cash_shift" ADD COLUMN "shift_number" integer;--> statement-breakpoint
ALTER TABLE "sale" ADD COLUMN "tendered_cents" integer;--> statement-breakpoint
ALTER TABLE "sale" ADD COLUMN "change_cents" integer;