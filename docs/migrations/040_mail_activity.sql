-- Migration: per-message mail activity log
--
-- Records the disposition of each inbound message — delivered, quarantined,
-- blocked (rejected at SMTP time), virus, etc. — by parsing /var/log/mail.log
-- in the worker (REFRESH_MAIL_ACTIVITY). Powers the "Activity" view in the
-- admin spam dashboard and the per-client spam panel.
--
-- Rows are pruned to a rolling 30-day window by the worker.

CREATE TABLE IF NOT EXISTS mail_activity (
    id           BIGSERIAL PRIMARY KEY,
    -- Stable natural key derived per log event so re-parsing overlapping log
    -- windows is idempotent (INSERT ... ON CONFLICT DO NOTHING).
    event_key    TEXT NOT NULL UNIQUE,
    occurred_at  TIMESTAMPTZ NOT NULL,
    disposition  TEXT NOT NULL,         -- delivered | quarantined | blocked | virus | spam | deferred
    sender       TEXT,
    recipient    TEXT,
    subject      TEXT,
    message_id   TEXT,
    spam_score   REAL,
    virus_name   TEXT,
    reason       TEXT,                  -- reject reason / target mailbox / detail
    mail_user_id INTEGER REFERENCES mail_users(id)   ON DELETE SET NULL,
    domain_id    INTEGER REFERENCES mail_domains(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mail_activity_occurred  ON mail_activity (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_mail_activity_disp       ON mail_activity (disposition);
CREATE INDEX IF NOT EXISTS idx_mail_activity_mailuser    ON mail_activity (mail_user_id);
CREATE INDEX IF NOT EXISTS idx_mail_activity_domain      ON mail_activity (domain_id);
CREATE INDEX IF NOT EXISTS idx_mail_activity_recipient   ON mail_activity (recipient);
