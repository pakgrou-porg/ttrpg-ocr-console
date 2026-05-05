-- ─── TTRPG OCR Console — Initial Postgres Schema ─────────────────────────────
--
-- Targeting: supabase/postgres:15.8.1 (Postgres 15)
-- Extensions: pgvector is enabled but no vector columns yet — reserved for
--             the embedding generation phase.
-- Triggers:   update_updated_at() fires BEFORE UPDATE on every table that has
--             an updated_at column, keeping it in sync without app-layer overhead.
-- ─────────────────────────────────────────────────────────────────────────────

--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS vector;

--> statement-breakpoint
-- Shared trigger function: sets updated_at = NOW() on every update
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─── Users ────────────────────────────────────────────────────────────────────

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
  "id"              serial PRIMARY KEY,
  "open_id"         varchar(64)  NOT NULL UNIQUE,
  "name"            text,
  "email"           varchar(320),
  "login_method"    varchar(64),
  "role"            varchar(16)  NOT NULL DEFAULT 'user',
  "created_at"      timestamp    NOT NULL DEFAULT now(),
  "updated_at"      timestamp    NOT NULL DEFAULT now(),
  "last_signed_in"  timestamp    NOT NULL DEFAULT now()
);

--> statement-breakpoint
CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON "users"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_profiles" (
  "id"                serial PRIMARY KEY,
  "user_id"           integer      NOT NULL UNIQUE,
  "display_name"      varchar(128),
  "preferred_game"    varchar(128),
  "preferred_version" varchar(64),
  "avatar_url"        varchar(512),
  "saved_entries"     jsonb        DEFAULT '[]'::jsonb,
  "saved_groups"      jsonb        DEFAULT '[]'::jsonb,
  "created_at"        timestamp    NOT NULL DEFAULT now(),
  "updated_at"        timestamp    NOT NULL DEFAULT now()
);

--> statement-breakpoint
CREATE TRIGGER trg_user_profiles_updated_at
  BEFORE UPDATE ON "user_profiles"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_permissions" (
  "id"                 serial PRIMARY KEY,
  "user_id"            integer     NOT NULL,
  "feature_area"       varchar(64) NOT NULL,
  "granted"            boolean     NOT NULL DEFAULT true,
  "restricted_game"    varchar(128),
  "restricted_version" varchar(64),
  "granted_by"         integer,
  "created_at"         timestamp   NOT NULL DEFAULT now(),
  "updated_at"         timestamp   NOT NULL DEFAULT now()
);

--> statement-breakpoint
CREATE TRIGGER trg_user_permissions_updated_at
  BEFORE UPDATE ON "user_permissions"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_invitations" (
  "id"                   serial PRIMARY KEY,
  "email"                varchar(320) NOT NULL,
  "display_name"         varchar(128),
  "role"                 varchar(16)  NOT NULL DEFAULT 'user',
  "token"                varchar(128) NOT NULL UNIQUE,
  "accepted"             boolean      NOT NULL DEFAULT false,
  "accepted_by_user_id"  integer,
  "created_by"           integer      NOT NULL,
  "expires_at"           timestamp    NOT NULL,
  "created_at"           timestamp    NOT NULL DEFAULT now(),
  "updated_at"           timestamp    NOT NULL DEFAULT now()
);

--> statement-breakpoint
CREATE TRIGGER trg_user_invitations_updated_at
  BEFORE UPDATE ON "user_invitations"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Prompts & Config ─────────────────────────────────────────────────────────

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "system_prompts" (
  "id"          serial PRIMARY KEY,
  "name"        varchar(128) NOT NULL UNIQUE,
  "category"    varchar(32)  NOT NULL,
  "description" text,
  "prompt_text" text         NOT NULL,
  "version"     integer      NOT NULL DEFAULT 1,
  "created_at"  timestamp    NOT NULL DEFAULT now(),
  "updated_at"  timestamp    NOT NULL DEFAULT now()
);

--> statement-breakpoint
CREATE TRIGGER trg_system_prompts_updated_at
  BEFORE UPDATE ON "system_prompts"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "prompt_versions" (
  "id"          serial PRIMARY KEY,
  "prompt_name" varchar(128) NOT NULL,
  "prompt_text" text         NOT NULL,
  "version"     integer      NOT NULL,
  "saved_by"    integer,
  "created_at"  timestamp    NOT NULL DEFAULT now(),
  CONSTRAINT "prompt_versions_name_version_idx" UNIQUE ("prompt_name", "version")
);

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "system_config" (
  "id"          serial PRIMARY KEY,
  "key"         varchar(128) NOT NULL UNIQUE,
  "value"       text         NOT NULL,
  "category"    varchar(64)  NOT NULL,
  "updated_by"  integer,
  "created_at"  timestamp    NOT NULL DEFAULT now(),
  "updated_at"  timestamp    NOT NULL DEFAULT now()
);

--> statement-breakpoint
CREATE TRIGGER trg_system_config_updated_at
  BEFORE UPDATE ON "system_config"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Ingestion & Telemetry ────────────────────────────────────────────────────

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ingestion_jobs" (
  "id"              serial PRIMARY KEY,
  "source_file"     varchar(512) NOT NULL,
  "game_system"     varchar(128),
  "status"          varchar(32)  NOT NULL DEFAULT 'queued',
  "current_phase"   integer      DEFAULT 1,
  "current_stage"   varchar(64),
  "total_pages"     integer      NOT NULL DEFAULT 0,
  "processed_pages" integer      NOT NULL DEFAULT 0,
  "flagged_pages"   integer      NOT NULL DEFAULT 0,
  "avg_confidence"  integer      DEFAULT 0,
  "error_message"   text,
  "started_at"      timestamp,
  "completed_at"    timestamp,
  "created_at"      timestamp    NOT NULL DEFAULT now(),
  "updated_at"      timestamp    NOT NULL DEFAULT now()
);

--> statement-breakpoint
CREATE TRIGGER trg_ingestion_jobs_updated_at
  BEFORE UPDATE ON "ingestion_jobs"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "telemetry_events" (
  "id"           serial PRIMARY KEY,
  "event_type"   varchar(64)  NOT NULL,
  "source"       varchar(128) NOT NULL,
  "metric_value" integer,
  "cost_micros"  integer      DEFAULT 0,
  "metadata"     jsonb,
  "created_at"   timestamp    NOT NULL DEFAULT now()
);

-- ─── LLM Providers ───────────────────────────────────────────────────────────

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "llm_providers" (
  "id"                   serial PRIMARY KEY,
  "display_name"         varchar(256) NOT NULL,
  "name"                 varchar(128) NOT NULL UNIQUE,
  "provider_type"        varchar(64)  NOT NULL,
  "base_url"             varchar(512) NOT NULL,
  "port"                 integer,
  "model_id"             varchar(256),
  "context_length"       integer,
  "max_tokens"           integer,
  "default_temperature"  real         DEFAULT 0.2,
  "api_prefix"           varchar(64)  DEFAULT '/v1',
  "supports_chat"        boolean      NOT NULL DEFAULT true,
  "supports_vision"      boolean      NOT NULL DEFAULT false,
  "supports_embedding"   boolean      NOT NULL DEFAULT false,
  "supports_reasoning"   boolean      NOT NULL DEFAULT false,
  "is_default"           boolean      NOT NULL DEFAULT false,
  "encrypted_api_key"    text,
  "key_iv"               varchar(64),
  "key_auth_tag"         varchar(64),
  "key_prefix"           varchar(8),
  "key_suffix"           varchar(8),
  "key_length"           integer,
  "is_active"            boolean      NOT NULL DEFAULT true,
  "notes"                text,
  "available_models"     jsonb        DEFAULT '[]'::jsonb,
  "created_at"           timestamp    NOT NULL DEFAULT now(),
  "updated_at"           timestamp    NOT NULL DEFAULT now()
);

--> statement-breakpoint
CREATE TRIGGER trg_llm_providers_updated_at
  BEFORE UPDATE ON "llm_providers"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Stage Inscriptions ───────────────────────────────────────────────────────

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stage_inscriptions" (
  "id"                   serial PRIMARY KEY,
  "stage"                varchar(64)  NOT NULL UNIQUE,
  "primary_provider_id"  integer,
  "fallback_provider_id" integer,
  "prompt_name"          varchar(128),
  "prompt_version"       integer,
  "temperature"          real,
  "max_tokens"           integer,
  "llm_settings"         jsonb,
  "is_active"            boolean      NOT NULL DEFAULT true,
  "created_at"           timestamp    NOT NULL DEFAULT now(),
  "updated_at"           timestamp    NOT NULL DEFAULT now()
);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "stage_inscriptions_stage_idx"   ON "stage_inscriptions" ("stage");
CREATE INDEX IF NOT EXISTS "stage_inscriptions_primary_idx" ON "stage_inscriptions" ("primary_provider_id");
CREATE INDEX IF NOT EXISTS "stage_inscriptions_fallback_idx" ON "stage_inscriptions" ("fallback_provider_id");

--> statement-breakpoint
CREATE TRIGGER trg_stage_inscriptions_updated_at
  BEFORE UPDATE ON "stage_inscriptions"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Supabase Instance Registry ───────────────────────────────────────────────

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "supabase_instances" (
  "id"                    serial PRIMARY KEY,
  "name"                  varchar(128) NOT NULL UNIQUE,
  "connection_type"       varchar(32)  NOT NULL,
  "host"                  varchar(256) NOT NULL,
  "port"                  integer      NOT NULL DEFAULT 5432,
  "database_name"         varchar(128) NOT NULL,
  -- Postgres password (AES-256-GCM encrypted)
  "encrypted_password"    text,
  "password_iv"           varchar(64),
  "password_auth_tag"     varchar(64),
  -- Supabase service role key (AES-256-GCM encrypted)
  "encrypted_service_key" text,
  "service_key_iv"        varchar(64),
  "service_key_auth_tag"  varchar(64),
  "service_key_prefix"    varchar(8),
  "service_key_suffix"    varchar(8),
  "service_key_length"    integer,
  -- Supabase public anon key (stored plaintext — it is public)
  "anon_key"              text,
  -- Kong/REST gateway URL
  "supabase_url"          varchar(512),
  -- Role and sync configuration
  "role"                  varchar(32)  NOT NULL DEFAULT 'primary',
  "sync_mode"             varchar(32)  NOT NULL DEFAULT 'primary_only',
  "is_active"             boolean      NOT NULL DEFAULT true,
  "use_ssl"               boolean      NOT NULL DEFAULT false,
  -- Bootstrap tracks schema initialisation state on this instance
  "bootstrap_status"      varchar(32)  NOT NULL DEFAULT 'pending',
  "bootstrap_completed_at" timestamp,
  -- Connectivity test tracking
  "last_tested_at"        timestamp,
  "last_test_status"      varchar(32)  NOT NULL DEFAULT 'untested',
  "notes"                 text,
  "created_at"            timestamp    NOT NULL DEFAULT now(),
  "updated_at"            timestamp    NOT NULL DEFAULT now()
);

--> statement-breakpoint
CREATE TRIGGER trg_supabase_instances_updated_at
  BEFORE UPDATE ON "supabase_instances"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Documents ────────────────────────────────────────────────────────────────

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "documents" (
  "id"                   serial PRIMARY KEY,
  "filename"             varchar(512) NOT NULL,
  "game_system"          varchar(128),
  "edition"              varchar(64),
  "title"                varchar(512),
  "scanned_name"         varchar(512),
  "document_summary"     text,
  "document_type"        varchar(64),
  "publisher"            varchar(256),
  "total_pages"          integer      NOT NULL DEFAULT 0,
  "processed_pages"      integer      NOT NULL DEFAULT 0,
  "flagged_pages"        integer      NOT NULL DEFAULT 0,
  "avg_confidence"       integer      DEFAULT 0,
  "status"               varchar(32)  NOT NULL DEFAULT 'pending',
  "pdf_url"              varchar(1024),
  "cover_thumbnail_url"  varchar(1024),
  "ingestion_job_id"     integer,
  "metadata"             jsonb,
  "owner_user_id"        integer,
  "created_by_user_id"   integer,
  "visibility"           varchar(16)  NOT NULL DEFAULT 'private',
  "created_at"           timestamp    NOT NULL DEFAULT now(),
  "updated_at"           timestamp    NOT NULL DEFAULT now()
);

--> statement-breakpoint
CREATE TRIGGER trg_documents_updated_at
  BEFORE UPDATE ON "documents"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Document Pages ───────────────────────────────────────────────────────────

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "document_pages" (
  "id"                     serial PRIMARY KEY,
  "document_id"            integer      NOT NULL,
  "page_number"            integer      NOT NULL,
  "raw_png_url"            varchar(1024),
  "preprocessed_png_url"   varchar(1024),
  "thumbnail_url"          varchar(1024),
  "phash"                  varchar(64),
  "was_preprocessed"       boolean      NOT NULL DEFAULT false,
  "preprocessing_applied"  varchar(128),
  "image_width"            integer,
  "image_height"           integer,
  "layout_type"            varchar(64),
  "content_regions"        jsonb,
  "continuity_flags"       jsonb,
  "page_json_output"       jsonb,
  "phase_status"           varchar(64),
  "is_flagged"             boolean      NOT NULL DEFAULT false,
  "ocr_completed"          boolean      NOT NULL DEFAULT false,
  "ocr_confidence"         integer,
  "created_at"             timestamp    NOT NULL DEFAULT now(),
  "updated_at"             timestamp    NOT NULL DEFAULT now()
);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_pages_document_id_idx" ON "document_pages" ("document_id");
CREATE INDEX IF NOT EXISTS "document_pages_phash_idx"       ON "document_pages" ("phash");
CREATE INDEX IF NOT EXISTS "document_pages_doc_page_idx"    ON "document_pages" ("document_id", "page_number");

--> statement-breakpoint
CREATE TRIGGER trg_document_pages_updated_at
  BEFORE UPDATE ON "document_pages"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── OCR Results ──────────────────────────────────────────────────────────────

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ocr_results" (
  "id"                        serial PRIMARY KEY,
  "page_id"                   integer     NOT NULL,
  "raw_text"                  text,
  "structured_data"           jsonb,
  "layout_metadata"           jsonb,
  "confidence"                integer     DEFAULT 0,
  "status"                    varchar(32) NOT NULL DEFAULT 'pending',
  "pass1_model"               varchar(256),
  "pass2_model"               varchar(256),
  "pass3_model"               varchar(256),
  "pass4_model"               varchar(256),
  "quality_score"             integer,
  "quality_notes"             text,
  "audit_log"                 jsonb       DEFAULT '[]'::jsonb,
  "corrected_text"            text,
  "corrected_structured_data" jsonb,
  "corrected_by"              integer,
  "corrected_at"              timestamp,
  "created_at"                timestamp   NOT NULL DEFAULT now(),
  "updated_at"                timestamp   NOT NULL DEFAULT now()
);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ocr_results_page_id_idx" ON "ocr_results" ("page_id");
CREATE INDEX IF NOT EXISTS "ocr_results_status_idx"  ON "ocr_results" ("status");

--> statement-breakpoint
CREATE TRIGGER trg_ocr_results_updated_at
  BEFORE UPDATE ON "ocr_results"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Page Processing Attempts ─────────────────────────────────────────────────

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "page_processing_attempts" (
  "id"                serial PRIMARY KEY,
  "page_id"           integer      NOT NULL,
  "ocr_result_id"     integer      NOT NULL,
  "pass_number"       integer      NOT NULL,
  "model_used"        varchar(256) NOT NULL,
  "provider_name"     varchar(128),
  "is_cloud_pass"     boolean      NOT NULL DEFAULT false,
  "raw_text_output"   text,
  "structured_output" jsonb,
  "score"             integer,
  "comparison_notes"  text,
  "was_accepted"      boolean      NOT NULL DEFAULT false,
  "processing_time_ms" integer,
  "created_at"        timestamp    NOT NULL DEFAULT now()
);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "page_attempts_page_id_idx"      ON "page_processing_attempts" ("page_id");
CREATE INDEX IF NOT EXISTS "page_attempts_ocr_result_id_idx" ON "page_processing_attempts" ("ocr_result_id");

-- ─── HITL Queue ───────────────────────────────────────────────────────────────

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hitl_queue" (
  "id"               serial PRIMARY KEY,
  "page_id"          integer     NOT NULL,
  "ocr_result_id"    integer,
  "reason"           text        NOT NULL,
  "flag_category"    varchar(64),
  "priority"         varchar(16) NOT NULL DEFAULT 'medium',
  "status"           varchar(32) NOT NULL DEFAULT 'queued',
  "assigned_to"      integer,
  "resolution_notes" text,
  "resolved_by"      integer,
  "resolved_at"      timestamp,
  "created_at"       timestamp   NOT NULL DEFAULT now(),
  "updated_at"       timestamp   NOT NULL DEFAULT now()
);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hitl_queue_page_id_idx"        ON "hitl_queue" ("page_id");
CREATE INDEX IF NOT EXISTS "hitl_queue_status_priority_idx" ON "hitl_queue" ("status", "priority", "created_at");
CREATE INDEX IF NOT EXISTS "hitl_queue_assigned_to_idx"    ON "hitl_queue" ("assigned_to");

--> statement-breakpoint
CREATE TRIGGER trg_hitl_queue_updated_at
  BEFORE UPDATE ON "hitl_queue"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
