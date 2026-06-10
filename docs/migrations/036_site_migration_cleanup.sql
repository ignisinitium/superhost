-- Migration 036: support cancelling/cleaning up and resuming site migrations.
-- Records the local DB that a migration created so cleanup can drop exactly it.
-- (status gains 'cancelling'/'cancelled' values — the column is a VARCHAR, no
-- enum change needed.)
-- Apply after 035_site_migration_detection.sql.

ALTER TABLE site_migrations
  ADD COLUMN IF NOT EXISTS migrated_db_name VARCHAR(64);
