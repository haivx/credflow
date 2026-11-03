CREATE TABLE "documents" (
	"id" text PRIMARY KEY NOT NULL,
	"staff_id" text NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"storage_key" text NOT NULL,
	"status" text DEFAULT 'uploaded' NOT NULL,
	"declared_doc_type" text,
	"checksum" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"classification" jsonb,
	"extraction" jsonb,
	"routing" jsonb,
	"versions" jsonb,
	"error" jsonb,
	"rule_results" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"timing_ms" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "documents_status_check" CHECK ("documents"."status" IN ('uploaded', 'processing', 'extracted', 'auto_approved', 'needs_review', 'approved', 'rejected', 'reupload_requested', 'failed')),
	CONSTRAINT "documents_declared_doc_type_check" CHECK ("documents"."declared_doc_type" IN ('cpr_card', 'professional_license', 'tb_test', 'background_check', 'vaccination_record', 'unknown')),
	CONSTRAINT "documents_size_bytes_check" CHECK ("documents"."size_bytes" > 0),
	CONSTRAINT "documents_checksum_check" CHECK ("documents"."checksum" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "review_actions" (
	"id" text PRIMARY KEY NOT NULL,
	"document_id" text NOT NULL,
	"reviewer_id" text NOT NULL,
	"action" text NOT NULL,
	"corrections" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_actions_action_check" CHECK ("review_actions"."action" IN ('approve', 'reject', 'request_reupload'))
);
--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_actions" ADD CONSTRAINT "review_actions_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "documents_checksum_unique" ON "documents" USING btree ("checksum");--> statement-breakpoint
CREATE INDEX "review_actions_document_id_idx" ON "review_actions" USING btree ("document_id");