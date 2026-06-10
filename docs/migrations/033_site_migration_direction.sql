-- Migration 033: site migrations can now run in both directions.
--   pull (default) — bring a remote site down and provision it here
--   push           — send a locally-hosted site up to a remote SSH server
-- Apply after 032_site_migrations.sql.

ALTER TABLE site_migrations
  ADD COLUMN IF NOT EXISTS direction VARCHAR(10) NOT NULL DEFAULT 'pull';
