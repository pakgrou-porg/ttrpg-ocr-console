-- Migration 0007: structural breaks per page + content summaries hierarchy
-- Adds:
--   document_pages.structural_breaks  — JSON array of break detections per page
--   content_summaries                 — chapter/section/subsection/page summary records

ALTER TABLE "document_pages"
  ADD COLUMN IF NOT EXISTS "structural_breaks" jsonb;

CREATE TABLE IF NOT EXISTS "content_summaries" (
  "id"                serial      PRIMARY KEY NOT NULL,
  "document_id"       integer     NOT NULL,
  "level_type"        varchar(32) NOT NULL,
  "heading_text"      varchar(512),
  "start_page_id"     integer     NOT NULL,
  "end_page_id"       integer,
  "start_page_number" integer     NOT NULL,
  "end_page_number"   integer,
  "short_summary"     text,
  "long_summary"      text,
  "key_terms"         jsonb       DEFAULT '[]'::jsonb,
  "key_entities"      jsonb       DEFAULT '[]'::jsonb,
  "parent_id"         integer,
  "summary_status"    varchar(32) DEFAULT 'pending' NOT NULL,
  "embedding_status"  varchar(32) DEFAULT 'pending' NOT NULL,
  "created_at"        timestamp   DEFAULT now()     NOT NULL,
  "updated_at"        timestamp   DEFAULT now()     NOT NULL
);

CREATE INDEX IF NOT EXISTS "content_summaries_document_id_idx"
  ON "content_summaries" ("document_id");

CREATE INDEX IF NOT EXISTS "content_summaries_level_type_idx"
  ON "content_summaries" ("document_id", "level_type");

CREATE INDEX IF NOT EXISTS "content_summaries_start_page_idx"
  ON "content_summaries" ("start_page_id");

CREATE INDEX IF NOT EXISTS "content_summaries_parent_idx"
  ON "content_summaries" ("parent_id");

CREATE INDEX IF NOT EXISTS "content_summaries_status_idx"
  ON "content_summaries" ("summary_status");
