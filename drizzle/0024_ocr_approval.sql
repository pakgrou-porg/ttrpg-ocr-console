ALTER TABLE "ocr_results" ADD COLUMN "ocr_approved_at" timestamp;
ALTER TABLE "ocr_results" ADD COLUMN "ocr_approved_by" integer;
ALTER TABLE "ocr_results" ADD COLUMN "ocr_approval_scope" text[];
