-- Add provider_mode to stage_inscriptions.
-- 'failover'      (default) — secondary is tried only when primary fails
-- 'load_balance'             — calls alternate between primary and secondary (round-robin)
ALTER TABLE "stage_inscriptions" ADD COLUMN IF NOT EXISTS "provider_mode" varchar(16) DEFAULT 'failover' NOT NULL;
