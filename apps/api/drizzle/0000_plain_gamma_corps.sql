CREATE TABLE "staff" (
	"id" text PRIMARY KEY NOT NULL,
	"legal_name" text NOT NULL,
	"role" text NOT NULL,
	"aliases" text[] DEFAULT '{}' NOT NULL,
	"client_ids" text[] DEFAULT '{}' NOT NULL,
	"region" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
