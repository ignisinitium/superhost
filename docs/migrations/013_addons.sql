-- 013: Add-ons system

-- Static IP flag on products (used by addon type products)
ALTER TABLE products ADD COLUMN IF NOT EXISTS static_ip BOOLEAN NOT NULL DEFAULT FALSE;

-- User add-on assignments
CREATE TABLE IF NOT EXISTS user_addons (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id   INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity     INTEGER NOT NULL DEFAULT 1,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_user_addons_user ON user_addons(user_id);
