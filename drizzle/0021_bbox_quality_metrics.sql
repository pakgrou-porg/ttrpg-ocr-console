-- Bounding-box and image-based quality signals for OCR results.
--
-- bbox_overlap_ratio   : fraction of total bbox area that overlaps another bbox.
--                        Increases → region detection likely produced duplicates/misaligned boxes.
-- page_whitespace_ratio: fraction of page pixels above the whitespace brightness threshold.
--                        High values → mostly-blank page (cover, chapter divider, etc.).
-- bbox_coverage_ratio  : fraction of non-whitespace pixels that fall inside a bbox.
--                        Low values → region detection missed significant page content.

ALTER TABLE "ocr_results"
  ADD COLUMN "bbox_overlap_ratio"    real,
  ADD COLUMN "page_whitespace_ratio" real,
  ADD COLUMN "bbox_coverage_ratio"   real;
