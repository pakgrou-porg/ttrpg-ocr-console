CREATE TABLE "document_pages" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" integer NOT NULL,
	"page_number" integer NOT NULL,
	"raw_png_url" varchar(1024),
	"preprocessed_png_url" varchar(1024),
	"thumbnail_url" varchar(1024),
	"phash" varchar(64),
	"was_preprocessed" boolean DEFAULT false NOT NULL,
	"preprocessing_applied" varchar(128),
	"image_width" integer,
	"image_height" integer,
	"layout_type" varchar(64),
	"content_regions" jsonb,
	"continuity_flags" jsonb,
	"page_json_output" jsonb,
	"phase_status" varchar(64),
	"is_flagged" boolean DEFAULT false NOT NULL,
	"ocr_completed" boolean DEFAULT false NOT NULL,
	"ocr_confidence" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"filename" varchar(512) NOT NULL,
	"game_system" varchar(128),
	"edition" varchar(64),
	"title" varchar(512),
	"scanned_name" varchar(512),
	"document_summary" text,
	"document_type" varchar(64),
	"publisher" varchar(256),
	"total_pages" integer DEFAULT 0 NOT NULL,
	"processed_pages" integer DEFAULT 0 NOT NULL,
	"flagged_pages" integer DEFAULT 0 NOT NULL,
	"avg_confidence" integer DEFAULT 0,
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"pdf_url" varchar(1024),
	"cover_thumbnail_url" varchar(1024),
	"ingestion_job_id" integer,
	"metadata" jsonb,
	"owner_user_id" integer,
	"created_by_user_id" integer,
	"visibility" varchar(16) DEFAULT 'private' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hitl_queue" (
	"id" serial PRIMARY KEY NOT NULL,
	"page_id" integer NOT NULL,
	"ocr_result_id" integer,
	"reason" text NOT NULL,
	"flag_category" varchar(64),
	"priority" varchar(16) DEFAULT 'medium' NOT NULL,
	"status" varchar(32) DEFAULT 'queued' NOT NULL,
	"assigned_to" integer,
	"resolution_notes" text,
	"resolved_by" integer,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingestion_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_file" varchar(512) NOT NULL,
	"game_system" varchar(128),
	"status" varchar(32) DEFAULT 'queued' NOT NULL,
	"current_phase" integer DEFAULT 1,
	"current_stage" varchar(64),
	"total_pages" integer DEFAULT 0 NOT NULL,
	"processed_pages" integer DEFAULT 0 NOT NULL,
	"flagged_pages" integer DEFAULT 0 NOT NULL,
	"avg_confidence" integer DEFAULT 0,
	"error_message" text,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "llm_providers" (
	"id" serial PRIMARY KEY NOT NULL,
	"display_name" varchar(256) NOT NULL,
	"name" varchar(128) NOT NULL,
	"provider_type" varchar(64) NOT NULL,
	"base_url" varchar(512) NOT NULL,
	"port" integer,
	"model_id" varchar(256),
	"context_length" integer,
	"max_tokens" integer,
	"default_temperature" real DEFAULT 0.2,
	"api_prefix" varchar(64) DEFAULT '/v1',
	"supports_chat" boolean DEFAULT true NOT NULL,
	"supports_vision" boolean DEFAULT false NOT NULL,
	"supports_embedding" boolean DEFAULT false NOT NULL,
	"supports_reasoning" boolean DEFAULT false NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"encrypted_api_key" text,
	"key_iv" varchar(64),
	"key_auth_tag" varchar(64),
	"key_prefix" varchar(8),
	"key_suffix" varchar(8),
	"key_length" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"available_models" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "llm_providers_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "stage_inscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"stage" varchar(64) NOT NULL,
	"primary_provider_id" integer,
	"fallback_provider_id" integer,
	"prompt_name" varchar(128),
	"prompt_version" integer,
	"temperature" real,
	"max_tokens" integer,
	"llm_settings" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "stage_inscriptions_stage_unique" UNIQUE("stage")
);
--> statement-breakpoint
CREATE TABLE "ocr_results" (
	"id" serial PRIMARY KEY NOT NULL,
	"page_id" integer NOT NULL,
	"raw_text" text,
	"structured_data" jsonb,
	"layout_metadata" jsonb,
	"confidence" integer DEFAULT 0,
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"pass1_model" varchar(256),
	"pass2_model" varchar(256),
	"pass3_model" varchar(256),
	"pass4_model" varchar(256),
	"quality_score" integer,
	"quality_notes" text,
	"audit_log" jsonb DEFAULT '[]'::jsonb,
	"corrected_text" text,
	"corrected_structured_data" jsonb,
	"corrected_by" integer,
	"corrected_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "page_processing_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"page_id" integer NOT NULL,
	"ocr_result_id" integer NOT NULL,
	"pass_number" integer NOT NULL,
	"model_used" varchar(256) NOT NULL,
	"provider_name" varchar(128),
	"is_cloud_pass" boolean DEFAULT false NOT NULL,
	"raw_text_output" text,
	"structured_output" jsonb,
	"score" integer,
	"comparison_notes" text,
	"was_accepted" boolean DEFAULT false NOT NULL,
	"processing_time_ms" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prompt_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"prompt_name" varchar(128) NOT NULL,
	"prompt_text" text NOT NULL,
	"version" integer NOT NULL,
	"saved_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "prompt_versions_name_version_idx" UNIQUE("prompt_name","version")
);
--> statement-breakpoint
CREATE TABLE "supabase_instances" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(128) NOT NULL,
	"connection_type" varchar(32) NOT NULL,
	"host" varchar(256) NOT NULL,
	"port" integer DEFAULT 5432 NOT NULL,
	"database_name" varchar(128) NOT NULL,
	"encrypted_password" text,
	"password_iv" varchar(64),
	"password_auth_tag" varchar(64),
	"encrypted_service_key" text,
	"service_key_iv" varchar(64),
	"service_key_auth_tag" varchar(64),
	"service_key_prefix" varchar(8),
	"service_key_suffix" varchar(8),
	"service_key_length" integer,
	"anon_key" text,
	"supabase_url" varchar(512),
	"role" varchar(32) DEFAULT 'primary' NOT NULL,
	"sync_mode" varchar(32) DEFAULT 'primary_only' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"use_ssl" boolean DEFAULT false NOT NULL,
	"bootstrap_status" varchar(32) DEFAULT 'pending' NOT NULL,
	"bootstrap_completed_at" timestamp,
	"last_tested_at" timestamp,
	"last_test_status" varchar(32) DEFAULT 'untested' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "supabase_instances_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "system_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" varchar(128) NOT NULL,
	"value" text NOT NULL,
	"category" varchar(64) NOT NULL,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "system_config_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "system_prompts" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(128) NOT NULL,
	"category" varchar(32) NOT NULL,
	"description" text,
	"prompt_text" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "system_prompts_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "telemetry_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_type" varchar(64) NOT NULL,
	"source" varchar(128) NOT NULL,
	"metric_value" integer,
	"cost_micros" integer DEFAULT 0,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_invitations" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar(320) NOT NULL,
	"display_name" varchar(128),
	"role" varchar(16) DEFAULT 'user' NOT NULL,
	"token" varchar(128) NOT NULL,
	"accepted" boolean DEFAULT false NOT NULL,
	"accepted_by_user_id" integer,
	"created_by" integer NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_invitations_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user_permissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"feature_area" varchar(64) NOT NULL,
	"granted" boolean DEFAULT true NOT NULL,
	"restricted_game" varchar(128),
	"restricted_version" varchar(64),
	"granted_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"display_name" varchar(128),
	"preferred_game" varchar(128),
	"preferred_version" varchar(64),
	"avatar_url" varchar(512),
	"saved_entries" jsonb DEFAULT '[]'::jsonb,
	"saved_groups" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"open_id" varchar(64) NOT NULL,
	"name" text,
	"email" varchar(320),
	"login_method" varchar(64),
	"role" varchar(16) DEFAULT 'user' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"last_signed_in" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_open_id_unique" UNIQUE("open_id")
);
--> statement-breakpoint
CREATE INDEX "document_pages_document_id_idx" ON "document_pages" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "document_pages_phash_idx" ON "document_pages" USING btree ("phash");--> statement-breakpoint
CREATE INDEX "document_pages_doc_page_idx" ON "document_pages" USING btree ("document_id","page_number");--> statement-breakpoint
CREATE INDEX "hitl_queue_page_id_idx" ON "hitl_queue" USING btree ("page_id");--> statement-breakpoint
CREATE INDEX "hitl_queue_status_priority_idx" ON "hitl_queue" USING btree ("status","priority","created_at");--> statement-breakpoint
CREATE INDEX "hitl_queue_assigned_to_idx" ON "hitl_queue" USING btree ("assigned_to");--> statement-breakpoint
CREATE INDEX "stage_inscriptions_stage_idx" ON "stage_inscriptions" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "stage_inscriptions_primary_idx" ON "stage_inscriptions" USING btree ("primary_provider_id");--> statement-breakpoint
CREATE INDEX "stage_inscriptions_fallback_idx" ON "stage_inscriptions" USING btree ("fallback_provider_id");--> statement-breakpoint
CREATE INDEX "ocr_results_page_id_idx" ON "ocr_results" USING btree ("page_id");--> statement-breakpoint
CREATE INDEX "ocr_results_status_idx" ON "ocr_results" USING btree ("status");--> statement-breakpoint
CREATE INDEX "page_attempts_page_id_idx" ON "page_processing_attempts" USING btree ("page_id");--> statement-breakpoint
CREATE INDEX "page_attempts_ocr_result_id_idx" ON "page_processing_attempts" USING btree ("ocr_result_id");