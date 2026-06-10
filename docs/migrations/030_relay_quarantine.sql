-- Migration 030: quarantine store for the mail-relay (spam filter) gateway.
-- The Postfix pipe filter drops spam to disk; a worker scan indexes it here;
-- release re-delivers to the customer's destination server. Apply after 029.

CREATE TABLE IF NOT EXISTS mail_relay_quarantine (
  id              BIGSERIAL    PRIMARY KEY,
  relay_domain_id BIGINT       REFERENCES mail_relay_domains(id) ON DELETE CASCADE,
  recipient       VARCHAR(320) NOT NULL,
  sender          VARCHAR(320),
  subject         TEXT,
  spam_score      NUMERIC(6,1),
  file_path       TEXT         NOT NULL UNIQUE,
  status          VARCHAR(20)  NOT NULL DEFAULT 'held',   -- held | released
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  released_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_relay_quar_domain ON mail_relay_quarantine(relay_domain_id);
CREATE INDEX IF NOT EXISTS idx_relay_quar_status ON mail_relay_quarantine(status);
