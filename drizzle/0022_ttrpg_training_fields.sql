-- Ground-truth annotation tracking for model training data management.
--
-- annotated_for_training: page has been human-reviewed and is suitable as a
--                         ground-truth sample for layout / bbox model training.
-- dataset_split         : train / val / test assignment for Orchestra to use
--                         when exporting COCO JSON datasets.

ALTER TABLE "document_pages"
  ADD COLUMN "annotated_for_training" boolean NOT NULL DEFAULT false,
  ADD COLUMN "dataset_split"          varchar(8);
