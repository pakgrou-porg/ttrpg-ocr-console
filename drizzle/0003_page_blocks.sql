ALTER TABLE "ingestion_jobs" ADD COLUMN IF NOT EXISTS "page_offset" integer DEFAULT 0 NOT NULL;
ALTER TABLE "ingestion_jobs" ADD COLUMN IF NOT EXISTS "block_size" integer DEFAULT 10 NOT NULL;
