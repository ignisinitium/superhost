-- Migration: Add Spam Quarantine and Access Control (Whitelist/Blacklist)

-- Quarantine table
CREATE TABLE IF NOT EXISTS mail_quarantine (
    id SERIAL PRIMARY KEY,
    mail_user_id INTEGER REFERENCES mail_users(id) ON DELETE CASCADE,
    sender VARCHAR(255) NOT NULL,
    subject TEXT,
    spam_score REAL,
    file_path TEXT NOT NULL, -- Path to the quarantined message on disk
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Whitelist / Blacklist
CREATE TYPE mail_access_type AS ENUM ('allow', 'block');

CREATE TABLE IF NOT EXISTS mail_access_control (
    id SERIAL PRIMARY KEY,
    mail_user_id INTEGER REFERENCES mail_users(id) ON DELETE CASCADE,
    sender_pattern VARCHAR(255) NOT NULL, -- e.g. 'friend@gmail.com' or '@spam.com'
    access_type mail_access_type NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(mail_user_id, sender_pattern)
);

-- Settings for digest
ALTER TABLE mail_users ADD COLUMN IF NOT EXISTS spam_digest_enabled BOOLEAN DEFAULT TRUE;

-- Indexing
CREATE INDEX IF NOT EXISTS idx_mail_quarantine_user ON mail_quarantine(mail_user_id);
CREATE INDEX IF NOT EXISTS idx_mail_access_control_user ON mail_access_control(mail_user_id);
