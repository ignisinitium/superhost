-- Migration: Add FTP Accounts table

CREATE TABLE IF NOT EXISTS ftp_accounts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    ftp_username VARCHAR(100) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    homedir TEXT NOT NULL, -- Full path on the system
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for faster lookups by user
CREATE INDEX IF NOT EXISTS idx_ftp_accounts_user_id ON ftp_accounts(user_id);
