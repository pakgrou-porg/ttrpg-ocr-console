CREATE TABLE "content_summaries" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" integer NOT NULL,
	"level_type" varchar(32) NOT NULL,
	"heading_text" varchar(512),
	"start_page_id" integer NOT NULL,
	"end_page_id" integer,
	"start_page_number" integer NOT NULL,
	"end_page_number" integer,
	"short_summary" text,
	"long_summary" text,
	"key_terms" jsonb DEFAULT '[]'::jsonb,
	"key_entities" jsonb DEFAULT '[]'::jsonb,
	"parent_id" integer,
	"summary_status" varchar(32) DEFAULT 'pending' NOT NULL,
	"embedding_status" varchar(32) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_systems" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(128) NOT NULL,
	"abbreviation" varchar(32),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "google_oauth_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"encrypted_access_token" text,
	"access_token_iv" varchar(64),
	"access_token_auth_tag" varchar(64),
	"encrypted_refresh_token" text,
	"refresh_token_iv" varchar(64),
	"refresh_token_auth_tag" varchar(64),
	"expires_at" timestamp,
	"scope" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hitl_retry_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"hitl_item_id" integer,
	"page_id" integer NOT NULL,
	"requested_stages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"saved_correction_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"used_reviewed_layout" boolean DEFAULT false NOT NULL,
	"used_reviewed_regions" boolean DEFAULT false NOT NULL,
	"used_reviewed_structure" boolean DEFAULT false NOT NULL,
	"status" varchar(32) DEFAULT 'running' NOT NULL,
	"confidence" integer,
	"stages_failed" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"stage_errors" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"model_trace" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ocr_result_id" integer,
	"created_by" integer,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"duration_ms" integer,
	"previous_confidence" integer,
	"confidence_delta" integer,
	"previous_region_count" integer,
	"regions_before" jsonb,
	"previous_layout_type" varchar(64)
);
--> statement-breakpoint
CREATE TABLE "llm_timing_metrics" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_id" integer,
	"page_id" integer,
	"stage" varchar(64) NOT NULL,
	"provider_id" integer,
	"provider_name" varchar(128),
	"model" varchar(256),
	"duration_ms" integer NOT NULL,
	"tokens_used" integer DEFAULT 0 NOT NULL,
	"is_fallback" boolean DEFAULT false NOT NULL,
	"success" boolean DEFAULT true NOT NULL,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_exchange_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider_id" integer NOT NULL,
	"provider_name" varchar(128) NOT NULL,
	"stage" varchar(64) NOT NULL,
	"job_id" integer,
	"page_id" integer,
	"model" varchar(256),
	"request_messages" jsonb,
	"request_meta" jsonb,
	"response_raw" text,
	"duration_ms" integer NOT NULL,
	"tokens_used" integer DEFAULT 0 NOT NULL,
	"success" boolean DEFAULT true NOT NULL,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document_pages" ADD COLUMN "structural_breaks" jsonb;--> statement-breakpoint
ALTER TABLE "document_pages" ADD COLUMN "printed_page_label" varchar(32);--> statement-breakpoint
ALTER TABLE "document_pages" ADD COLUMN "native_text" text;--> statement-breakpoint
ALTER TABLE "document_pages" ADD COLUMN "has_embedded_text" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ingestion_jobs" ADD COLUMN "storage_provider" varchar(32) DEFAULT 'local' NOT NULL;--> statement-breakpoint
ALTER TABLE "ingestion_jobs" ADD COLUMN "drive_file_id" varchar(512);--> statement-breakpoint
ALTER TABLE "ingestion_jobs" ADD COLUMN "document_id" integer;--> statement-breakpoint
ALTER TABLE "ingestion_jobs" ADD COLUMN "page_offset" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ingestion_jobs" ADD COLUMN "block_size" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "stage_inscriptions" ADD COLUMN "secondary_provider_id" integer;--> statement-breakpoint
ALTER TABLE "ocr_results" ADD COLUMN "markdown_text" text;--> statement-breakpoint
ALTER TABLE "ocr_results" ADD COLUMN "normalised_text" text;--> statement-breakpoint
ALTER TABLE "ocr_results" ADD COLUMN "native_similarity" real;--> statement-breakpoint
CREATE INDEX "content_summaries_document_id_idx" ON "content_summaries" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "content_summaries_level_type_idx" ON "content_summaries" USING btree ("document_id","level_type");--> statement-breakpoint
CREATE INDEX "content_summaries_start_page_idx" ON "content_summaries" USING btree ("start_page_id");--> statement-breakpoint
CREATE INDEX "content_summaries_parent_idx" ON "content_summaries" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "content_summaries_status_idx" ON "content_summaries" USING btree ("summary_status");--> statement-breakpoint
CREATE INDEX "hitl_retry_attempts_page_id_idx" ON "hitl_retry_attempts" USING btree ("page_id");--> statement-breakpoint
CREATE INDEX "hitl_retry_attempts_hitl_item_id_idx" ON "hitl_retry_attempts" USING btree ("hitl_item_id");--> statement-breakpoint
CREATE INDEX "hitl_retry_attempts_status_idx" ON "hitl_retry_attempts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "hitl_retry_attempts_started_at_idx" ON "hitl_retry_attempts" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "llm_timing_job_id_idx" ON "llm_timing_metrics" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "llm_timing_page_id_idx" ON "llm_timing_metrics" USING btree ("page_id");--> statement-breakpoint
CREATE INDEX "llm_timing_provider_id_idx" ON "llm_timing_metrics" USING btree ("provider_id");--> statement-breakpoint
CREATE INDEX "llm_timing_stage_idx" ON "llm_timing_metrics" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "llm_timing_created_at_idx" ON "llm_timing_metrics" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "pex_provider_id_idx" ON "provider_exchange_logs" USING btree ("provider_id");--> statement-breakpoint
CREATE INDEX "pex_stage_idx" ON "provider_exchange_logs" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "pex_created_at_idx" ON "provider_exchange_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "stage_inscriptions_secondary_idx" ON "stage_inscriptions" USING btree ("secondary_provider_id");