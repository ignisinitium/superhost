-- Migration 031: per-mailbox purchase flow for the Email Spam Filter.
-- Adds a billing_unit marker (so the storefront knows to use the per-mailbox
-- flow), extends pending_signups for filter signups, and activates the product.
-- Apply after 030_relay_quarantine.sql.

-- Products: how a plan is metered. 'account' = one flat price (hosting/services);
-- 'mailbox' = quantity-based (price per protected mailbox).
ALTER TABLE products ADD COLUMN IF NOT EXISTS billing_unit VARCHAR(20) NOT NULL DEFAULT 'account';

-- pending_signups: support filter signups alongside hosting signups.
ALTER TABLE pending_signups
  ADD COLUMN IF NOT EXISTS signup_type       VARCHAR(20) NOT NULL DEFAULT 'hosting',  -- hosting | filter
  ADD COLUMN IF NOT EXISTS destination_host  VARCHAR(255),
  ADD COLUMN IF NOT EXISTS destination_port  INTEGER DEFAULT 25,
  ADD COLUMN IF NOT EXISTS mailbox_addresses TEXT,    -- comma-separated protected addresses
  ADD COLUMN IF NOT EXISTS quantity          INTEGER NOT NULL DEFAULT 1;

-- Mark the spam filter as per-mailbox and put it on sale.
UPDATE products SET billing_unit = 'mailbox', is_active = TRUE WHERE id = 106;
