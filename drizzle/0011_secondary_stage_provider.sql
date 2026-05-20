ALTER TABLE "stage_inscriptions"
  ADD COLUMN IF NOT EXISTS "secondary_provider_id" integer;

CREATE INDEX IF NOT EXISTS "stage_inscriptions_secondary_idx"
  ON "stage_inscriptions" ("secondary_provider_id");
