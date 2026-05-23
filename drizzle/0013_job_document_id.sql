ALTER TABLE "ingestion_jobs"
  ADD COLUMN IF NOT EXISTS "document_id" integer;
