-- Migration 034: remote-server scans for the "migrate an account" flow.
-- An admin SSHes into a remote server, we discover the websites hosted there
-- (nginx + apache vhosts → domain/docroot/stack), and they pick which to pull
-- into a freshly-created (or existing) local user.
-- SSH secrets are NOT stored here — they ride only in the (scrubbed) task payload.
-- Apply after 033_site_migration_direction.sql.

CREATE TABLE IF NOT EXISTS server_scans (
  id            BIGSERIAL    PRIMARY KEY,
  source_host   VARCHAR(255) NOT NULL,
  source_port   INTEGER      NOT NULL DEFAULT 22,
  ssh_user      VARCHAR(64)  NOT NULL,
  status        VARCHAR(20)  NOT NULL DEFAULT 'pending',  -- pending | running | completed | failed
  sites         JSONB        NOT NULL DEFAULT '[]',       -- [{domain, remotePath, stack}]
  error_message TEXT,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_server_scans_created ON server_scans(created_at DESC);
