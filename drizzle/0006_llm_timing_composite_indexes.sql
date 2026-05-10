-- Composite indexes for llm_timing_metrics to support GROUP BY queries in
-- getLlmMetricsJobSummary (groups by job_id + stage) and
-- getLlmMetricsPageSummary (groups by job_id + page_id).
CREATE INDEX IF NOT EXISTS "llm_timing_metrics_job_stage_idx" ON "llm_timing_metrics" ("job_id", "stage");
CREATE INDEX IF NOT EXISTS "llm_timing_metrics_job_page_idx"  ON "llm_timing_metrics" ("job_id", "page_id");
