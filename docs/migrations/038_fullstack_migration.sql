-- Migration 038: full-stack migrations — store the source's nginx server block,
-- the resolved backends, and every local database we created (so resume can
-- rebuild the job and cleanup can drop each DB across MySQL *and* PostgreSQL).
-- Apply after 037_scrub_task_secrets.sql.

ALTER TABLE site_migrations
  ADD COLUMN IF NOT EXISTS server_block  TEXT,
  ADD COLUMN IF NOT EXISTS frontend_root TEXT,
  ADD COLUMN IF NOT EXISTS backends      JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS migrated_dbs  JSONB NOT NULL DEFAULT '[]';
