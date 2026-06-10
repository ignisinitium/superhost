-- Migration 021: full-featured expansion
--   * client-side TOTP 2FA
--   * audit log of admin/client actions
--   * per-domain spam allow/block rules
--   * sa-learn (Bayes) training idempotency log
--   * subdomain tracking + SSL expiry tracking on domains
--   * server_settings seeds for greylisting / RBL / attachment blocking
-- Apply after 020_ssh_access.sql.

-- ── Client 2FA ───────────────────────────────────────────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS totp_secret  TEXT,
  ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- ── Subdomains + SSL expiry tracking ─────────────────────────────────────────
ALTER TABLE domains
  ADD COLUMN IF NOT EXISTS parent_domain_id INTEGER REFERENCES domains(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS is_subdomain     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ssl_expires_at   TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_domains_parent ON domains(parent_domain_id);

-- ── Audit log ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id          BIGSERIAL    PRIMARY KEY,
  actor_id    INTEGER,
  actor_role  VARCHAR(20)  NOT NULL,         -- admin | client | system
  actor_name  VARCHAR(100),
  action      VARCHAR(80)  NOT NULL,         -- e.g. user.delete, ssl.install
  target_type VARCHAR(60),
  target_id   VARCHAR(120),
  ip_address  VARCHAR(64),
  metadata    JSONB        NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor   ON audit_log(actor_role, actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action  ON audit_log(action);

-- ── Per-domain spam rules (middle tier between per-mailbox and global) ────────
CREATE TABLE IF NOT EXISTS mail_domain_rules (
  id             SERIAL PRIMARY KEY,
  domain_id      INTEGER NOT NULL REFERENCES mail_domains(id) ON DELETE CASCADE,
  sender_pattern VARCHAR(255) NOT NULL,
  access_type    mail_access_type NOT NULL,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (domain_id, sender_pattern)
);

CREATE INDEX IF NOT EXISTS idx_mail_domain_rules_domain ON mail_domain_rules(domain_id);

-- ── sa-learn idempotency (never learn the same message twice) ────────────────
CREATE TABLE IF NOT EXISTS mail_learn_log (
  id         BIGSERIAL    PRIMARY KEY,
  learn_type VARCHAR(8)   NOT NULL,          -- ham | spam
  file_path  TEXT         NOT NULL UNIQUE,
  learned_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── Spam infrastructure toggles (server-wide) ────────────────────────────────
INSERT INTO server_settings (key, value) VALUES
  ('greylisting_enabled',          'false'),
  ('mail_rbls',                    'zen.spamhaus.org,bl.spamcop.net'),
  ('rbl_enabled',                  'false'),
  ('blocked_attachment_extensions','exe,scr,vbs,js,jar,pif,bat,cmd,com,msi'),
  ('attachment_blocking_enabled',  'false')
ON CONFLICT (key) DO NOTHING;
