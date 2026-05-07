-- ─── Infinite Kodex — Google Drive Integration ────────────────────────────────
--
-- Adds Google OAuth token storage and Drive-aware fields on ingestion_jobs.
-- ─────────────────────────────────────────────────────────────────────────────

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "google_oauth_tokens" (
  "id" serial PRIMARY KEY NOT NULL,
  "encrypted_access_token" text,
  "access_token_iv" varchar(64),
  "access_token_auth_tag" varchar(64),
  "encrypted_refresh_token" text,
  "refresh_token_iv" varchar(64),
  "refresh_token_auth_tag" varchar(64),
  "expires_at" timestamp,
  "scope" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE trigger_name = 'update_google_oauth_tokens_updated_at'
  ) THEN
    CREATE TRIGGER update_google_oauth_tokens_updated_at
      BEFORE UPDATE ON "google_oauth_tokens"
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;

--> statement-breakpoint
ALTER TABLE "ingestion_jobs"
  ADD COLUMN IF NOT EXISTS "storage_provider" varchar(32) DEFAULT 'local' NOT NULL;

--> statement-breakpoint
ALTER TABLE "ingestion_jobs"
  ADD COLUMN IF NOT EXISTS "drive_file_id" varchar(512);
