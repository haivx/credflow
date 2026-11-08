ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "google_sub" text;--> statement-breakpoint
CREATE UNIQUE INDEX "users_google_sub_unique" ON "users" USING btree ("google_sub");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_login_method_check" CHECK ("users"."password_hash" IS NOT NULL OR "users"."google_sub" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_google_staff_check" CHECK ("users"."google_sub" IS NULL OR "users"."role" = 'staff');