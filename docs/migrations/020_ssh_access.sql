-- Add per-user SSH access toggle (independent of package-level ssh_access flag)
ALTER TABLE users ADD COLUMN IF NOT EXISTS ssh_enabled BOOLEAN NOT NULL DEFAULT FALSE;
