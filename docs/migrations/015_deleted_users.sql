-- Migration: Deleted user archive tracking

CREATE TABLE IF NOT EXISTS deleted_users (
    id               SERIAL PRIMARY KEY,
    username         VARCHAR(50) NOT NULL,
    email            VARCHAR(100),
    original_user_id INTEGER,                      -- original users.id, kept for reference
    archive_path     TEXT NOT NULL,                -- absolute path to .tar.gz
    archive_size_bytes BIGINT DEFAULT 0,
    deleted_at       TIMESTAMPTZ DEFAULT NOW(),
    metadata         JSONB DEFAULT '{}'            -- full snapshot: domains, dns, dbs, mail, apps
);

CREATE INDEX IF NOT EXISTS idx_deleted_users_username ON deleted_users(username);
CREATE INDEX IF NOT EXISTS idx_deleted_users_deleted_at ON deleted_users(deleted_at DESC);
