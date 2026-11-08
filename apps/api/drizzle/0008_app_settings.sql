CREATE TABLE "app_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"llm_model" text NOT NULL,
	"api_key_ciphertext" text,
	"api_key_last4" text,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_settings_id_check" CHECK ("app_settings"."id" = 'llm'),
	CONSTRAINT "app_settings_key_pair_check" CHECK (("app_settings"."api_key_ciphertext" IS NULL) = ("app_settings"."api_key_last4" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;