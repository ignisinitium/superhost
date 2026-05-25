-- Migration 009: Security hardening additions
-- Adds: FIDO2 challenge persistence, token blocklist

-- ── FIDO2 challenges stored in DB (replaces in-memory Map) ──────────────────
CREATE TABLE IF NOT EXISTS fido2_challenges (
  admin_id     INTEGER      NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  challenge    TEXT         NOT NULL,
  expires_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW() + INTERVAL '5 minutes',
  PRIMARY KEY (admin_id)
);

CREATE INDEX IF NOT EXISTS idx_fido2_challenges_expires ON fido2_challenges(expires_at);

-- ── JWT token blocklist (for logout / token revocation) ─────────────────────
-- jti (JWT ID) is stored here on logout; tokens are checked against this list.
-- Expired entries are safe to delete (the token would be invalid by expiry anyway).
CREATE TABLE IF NOT EXISTS token_blocklist (
  id          BIGSERIAL    PRIMARY KEY,
  jti         TEXT         NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ  NOT NULL,
  blocked_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_token_blocklist_jti ON token_blocklist(jti);
CREATE INDEX IF NOT EXISTS idx_token_blocklist_expires ON token_blocklist(expires_at);

-- ── Add jti claim support: ensure admins and users tables have needed fields ─
-- (No schema change needed — jti is embedded in the JWT payload itself)

-- ── Cleanup job comment ──────────────────────────────────────────────────────
-- Add a cron job (via pg_cron or external scheduler) to clean expired rows:
-- DELETE FROM token_blocklist WHERE expires_at < NOW();
-- DELETE FROM fido2_challenges WHERE expires_at < NOW();
