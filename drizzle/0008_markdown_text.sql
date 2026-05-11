-- Add markdown_text column to ocr_results for layout-preserving Markdown output
ALTER TABLE "ocr_results" ADD COLUMN IF NOT EXISTS "markdown_text" text;
