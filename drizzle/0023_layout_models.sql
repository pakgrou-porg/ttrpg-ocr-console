-- Fine-tuned layout/bbox model registry for Orchestra-driven training.
--
-- layout_models       : one row per trained model checkpoint with metrics and config.
-- layout_model_id     : records which fine-tuned model produced bbox detection for
--                       a given page. NULL = processed by base LLM (no fine-tune).

CREATE TABLE "layout_models" (
  "id"               serial        PRIMARY KEY,
  "name"             varchar(128)  NOT NULL UNIQUE,
  "display_name"     varchar(256),
  "base_model"       varchar(256)  NOT NULL,
  "checkpoint_path"  text,
  "training_config"  jsonb,
  "metrics"          jsonb,
  "trained_at"       timestamp,
  "is_active"        boolean       NOT NULL DEFAULT false,
  "notes"            text,
  "created_at"       timestamp     NOT NULL DEFAULT now(),
  "updated_at"       timestamp     NOT NULL DEFAULT now()
);

ALTER TABLE "document_pages"
  ADD COLUMN "layout_model_id" integer REFERENCES "layout_models"("id") ON DELETE SET NULL;
