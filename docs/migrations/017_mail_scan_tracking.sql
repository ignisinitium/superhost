-- 017_mail_scan_tracking.sql: Track total emails received/scanned by the mail server

-- Daily delivery stats (populated by worker REFRESH_MAIL_STATS task)
CREATE TABLE IF NOT EXISTS mail_server_stats (
  date DATE PRIMARY KEY,
  total_received INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for efficient aggregation in stats queries
CREATE INDEX IF NOT EXISTS idx_mail_quarantine_sender   ON mail_quarantine(sender);
CREATE INDEX IF NOT EXISTS idx_mail_quarantine_score_nn ON mail_quarantine(spam_score) WHERE spam_score IS NOT NULL;
