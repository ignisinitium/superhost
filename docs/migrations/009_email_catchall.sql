-- 009_email_catchall.sql
-- Add catchall support to mailboxes: one catchall allowed per mail domain.

ALTER TABLE mail_users
  ADD COLUMN IF NOT EXISTS is_catchall BOOLEAN NOT NULL DEFAULT FALSE;

-- Partial unique index: at most one catchall row per domain
CREATE UNIQUE INDEX IF NOT EXISTS mail_users_catchall_per_domain
  ON mail_users (domain_id)
  WHERE is_catchall = TRUE;
