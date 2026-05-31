-- 016_spam_enhancements.sql: Next-generation spam filter enhancements

-- Per-mailbox spam configuration
ALTER TABLE mail_users
  ADD COLUMN IF NOT EXISTS spam_score_threshold REAL NOT NULL DEFAULT 5.0,
  ADD COLUMN IF NOT EXISTS spam_action TEXT NOT NULL DEFAULT 'quarantine';
  -- spam_action: 'quarantine' | 'tag' | 'deliver'

-- Quarantine: false-positive tracking and automatic 30-day retention
ALTER TABLE mail_quarantine
  ADD COLUMN IF NOT EXISTS released_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '30 days');

-- Backfill expires_at for existing quarantine records
UPDATE mail_quarantine
  SET expires_at = created_at + INTERVAL '30 days'
  WHERE expires_at IS NULL;

-- Global server-wide allow/block rules (admin-managed, apply to all mailboxes)
CREATE TABLE IF NOT EXISTS mail_global_rules (
  id SERIAL PRIMARY KEY,
  sender_pattern VARCHAR(255) NOT NULL UNIQUE,
  access_type mail_access_type NOT NULL,
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_mail_quarantine_created  ON mail_quarantine(created_at);
CREATE INDEX IF NOT EXISTS idx_mail_quarantine_expires  ON mail_quarantine(expires_at);
CREATE INDEX IF NOT EXISTS idx_mail_quarantine_released ON mail_quarantine(released_at) WHERE released_at IS NOT NULL;
