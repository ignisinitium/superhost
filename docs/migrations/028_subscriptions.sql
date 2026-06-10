-- Migration 028: subscription lifecycle tracking on user accounts.
-- Lets us react to Stripe subscription events (renew/fail/cancel) and open the
-- Stripe billing portal for self-service management. Apply after 027.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS status                 VARCHAR(20)  NOT NULL DEFAULT 'active',  -- active | suspended | canceled
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS subscription_status    VARCHAR(30),   -- Stripe sub status: active, past_due, canceled, ...
  ADD COLUMN IF NOT EXISTS current_period_end     TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_stripe_customer ON users(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_users_stripe_sub      ON users(stripe_subscription_id);
