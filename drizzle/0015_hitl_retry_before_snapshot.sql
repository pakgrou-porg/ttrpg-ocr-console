-- Capture the page state immediately before a HITL retry so we can measure
-- the qualitative improvement made by each human intervention.
ALTER TABLE "hitl_retry_attempts"
  ADD COLUMN IF NOT EXISTS "previous_confidence"   integer,
  ADD COLUMN IF NOT EXISTS "confidence_delta"       integer,
  ADD COLUMN IF NOT EXISTS "previous_region_count"  integer,
  ADD COLUMN IF NOT EXISTS "regions_before"         jsonb,
  ADD COLUMN IF NOT EXISTS "previous_layout_type"   varchar(64);
