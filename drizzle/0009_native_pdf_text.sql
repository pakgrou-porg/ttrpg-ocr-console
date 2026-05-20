ALTER TABLE "document_pages" ADD COLUMN IF NOT EXISTS "has_embedded_text" boolean NOT NULL DEFAULT false;
ALTER TABLE "document_pages" ADD COLUMN IF NOT EXISTS "native_text" text;
ALTER TABLE "ocr_results" ADD COLUMN IF NOT EXISTS "native_similarity" real;
