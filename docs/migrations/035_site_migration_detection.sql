-- Migration 035: record what kind of app each migrated site is, and whether we
-- brought its database across. Lets the UI show "WordPress + DB migrated" etc.
-- Apply after 034_server_scans.sql.

ALTER TABLE site_migrations
  ADD COLUMN IF NOT EXISTS detected_type VARCHAR(40),
  ADD COLUMN IF NOT EXISTS migrated_db   BOOLEAN NOT NULL DEFAULT false;
