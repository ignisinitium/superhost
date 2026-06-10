-- CWP (Control Web Panel) migration job tracking
CREATE TABLE IF NOT EXISTS cwp_migrations (
  id              SERIAL PRIMARY KEY,
  remote_host     TEXT NOT NULL,
  remote_port     INTEGER NOT NULL DEFAULT 22,
  remote_user     TEXT NOT NULL DEFAULT 'root',
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','discovering','ready','migrating','completed','failed')),
  discovery_data  JSONB,
  selected_users  TEXT[],
  progress        JSONB NOT NULL DEFAULT '{}',
  logs            JSONB NOT NULL DEFAULT '[]',
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ
);
