CREATE TABLE IF NOT EXISTS "hitl_retry_attempts" (
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
  "duration_ms" integer
);

CREATE INDEX IF NOT EXISTS "hitl_retry_attempts_page_id_idx"
  ON "hitl_retry_attempts" ("page_id");

CREATE INDEX IF NOT EXISTS "hitl_retry_attempts_hitl_item_id_idx"
  ON "hitl_retry_attempts" ("hitl_item_id");

CREATE INDEX IF NOT EXISTS "hitl_retry_attempts_status_idx"
  ON "hitl_retry_attempts" ("status");

CREATE INDEX IF NOT EXISTS "hitl_retry_attempts_started_at_idx"
  ON "hitl_retry_attempts" ("started_at");
