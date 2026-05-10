-- LLM Timing Metrics
-- Append-only log of every LLM provider call made by the pipeline.
-- Used to compute per-page, per-job, per-batch, and per-provider latency/token metrics.

CREATE TABLE IF NOT EXISTS "llm_timing_metrics" (
  "id"            serial PRIMARY KEY NOT NULL,
  "job_id"        integer,
  "page_id"       integer,
  "stage"         varchar(64)  NOT NULL,
  "provider_id"   integer,
  "provider_name" varchar(128),
  "model"         varchar(256),
  "duration_ms"   integer      NOT NULL,
  "tokens_used"   integer      DEFAULT 0  NOT NULL,
  "is_fallback"   boolean      DEFAULT false NOT NULL,
  "success"       boolean      DEFAULT true  NOT NULL,
  "error_message" text,
  "created_at"    timestamp    DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "llm_timing_job_id_idx"      ON "llm_timing_metrics" ("job_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "llm_timing_page_id_idx"     ON "llm_timing_metrics" ("page_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "llm_timing_provider_id_idx" ON "llm_timing_metrics" ("provider_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "llm_timing_stage_idx"       ON "llm_timing_metrics" ("stage");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "llm_timing_created_at_idx"  ON "llm_timing_metrics" ("created_at");
