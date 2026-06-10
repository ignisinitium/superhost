-- Migration 032: generic "migrate a website over SSH" jobs (Node.js, static,
-- or PHP) from any server reachable by SSH key/password. SSH secrets are NOT
-- stored here — they travel only in the (scrubbed) task payload.
-- Apply after 031_filter_purchase.sql.

CREATE TABLE IF NOT EXISTS site_migrations (
  id             BIGSERIAL    PRIMARY KEY,
  source_host    VARCHAR(255) NOT NULL,
  source_port    INTEGER      NOT NULL DEFAULT 22,
  ssh_user       VARCHAR(64)  NOT NULL,
  remote_path    TEXT         NOT NULL,
  target_user_id INTEGER      REFERENCES users(id) ON DELETE SET NULL,
  domain_name    VARCHAR(255) NOT NULL,
  stack          VARCHAR(20)  NOT NULL DEFAULT 'static',   -- node | python | static | php
  app_port       INTEGER,
  install_command TEXT,
  build_command   TEXT,
  start_command   TEXT,
  status         VARCHAR(20)  NOT NULL DEFAULT 'pending',  -- pending | running | completed | failed
  log            TEXT         NOT NULL DEFAULT '',
  error_message  TEXT,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  completed_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_site_migrations_created ON site_migrations(created_at DESC);
