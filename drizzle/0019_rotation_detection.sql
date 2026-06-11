ALTER TABLE "document_pages"
  ADD COLUMN "detected_rotation"  integer,
  ADD COLUMN "rotation_corrected" boolean DEFAULT false NOT NULL;
