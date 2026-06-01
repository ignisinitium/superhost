-- 018_clamav_scanning.sql: ClamAV antivirus scanning for quarantined mail

-- Store the virus name when clamdscan detects an infection in a quarantined file
ALTER TABLE mail_quarantine ADD COLUMN IF NOT EXISTS virus_name TEXT;

CREATE INDEX IF NOT EXISTS idx_mail_quarantine_virus
  ON mail_quarantine(virus_name) WHERE virus_name IS NOT NULL;
