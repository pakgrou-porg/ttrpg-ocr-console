-- Provider Exchange Logs: DB-persistent ring buffer (21 entries per provider).
-- Captures every request+response exchange made by invokeStage, with image
-- data stripped from request messages.  Applied via db:push / manual migration.

CREATE TABLE IF NOT EXISTS provider_exchange_logs (
  id               SERIAL PRIMARY KEY,
  provider_id      INTEGER       NOT NULL,
  provider_name    VARCHAR(128)  NOT NULL,
  stage            VARCHAR(64)   NOT NULL,
  job_id           INTEGER,
  page_id          INTEGER,
  model            VARCHAR(256),
  request_messages JSONB,
  request_meta     JSONB,
  response_raw     TEXT,
  duration_ms      INTEGER       NOT NULL,
  tokens_used      INTEGER       NOT NULL DEFAULT 0,
  success          BOOLEAN       NOT NULL DEFAULT TRUE,
  error_message    TEXT,
  created_at       TIMESTAMP     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pex_provider_id_idx ON provider_exchange_logs (provider_id);
CREATE INDEX IF NOT EXISTS pex_stage_idx        ON provider_exchange_logs (stage);
CREATE INDEX IF NOT EXISTS pex_created_at_idx   ON provider_exchange_logs (created_at);
