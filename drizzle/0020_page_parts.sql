-- Page splitting: a single physical page can be split into multiple sub-images
-- when regions within it have different orientations (e.g. a rotated table on
-- an otherwise portrait page).  Each split produces a new document_pages row
-- with the same pageNumber but an incrementing partIndex.
--
-- partIndex  0 = original page (default for all existing rows)
--            1, 2, … = extracted sub-images, ordered by creation
--
-- parentPageId  references the original page row this part was cropped from
--               (null for originals; may point transitively to the root origin)
--
-- sourceRegionBbox  the bounding box (percentage coords 0–100) in the source
--                   page's coordinate space from which this part was cropped.
--                   Used to reassemble global reading order across all parts.

ALTER TABLE "document_pages"
  ADD COLUMN "part_index"         integer NOT NULL DEFAULT 0,
  ADD COLUMN "parent_page_id"     integer,
  ADD COLUMN "source_region_bbox" jsonb;
