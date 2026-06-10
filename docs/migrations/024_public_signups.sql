-- Migration 024: public self-service signups (storefront → pay → provision).
-- An order is recorded here at checkout time but the hosting account is NOT
-- created until Stripe confirms payment (checkout.session.completed), so no one
-- gets free hosting. Apply after 023_pricing_refresh.sql.

CREATE TABLE IF NOT EXISTS pending_signups (
  id                  BIGSERIAL    PRIMARY KEY,
  session_token       TEXT         NOT NULL UNIQUE,   -- our correlation token (also in Stripe metadata)
  stripe_session_id   TEXT,                            -- Stripe Checkout session id
  username            VARCHAR(50)  NOT NULL,
  email               VARCHAR(120) NOT NULL,
  password_hash       TEXT         NOT NULL,           -- bcrypt of the chosen password (never plaintext)
  primary_domain      VARCHAR(255),
  product_id          INTEGER      NOT NULL REFERENCES products(id),
  billing_cycle       VARCHAR(10)  NOT NULL DEFAULT 'monthly',  -- monthly | annual
  amount_cents        INTEGER      NOT NULL DEFAULT 0,
  status              VARCHAR(20)  NOT NULL DEFAULT 'pending',   -- pending | provisioned | failed
  provisioned_user_id INTEGER      REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  provisioned_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_pending_signups_token  ON pending_signups(session_token);
CREATE INDEX IF NOT EXISTS idx_pending_signups_stripe ON pending_signups(stripe_session_id);
