-- Migration 029: inbound mail-filtering gateway (spam filter / relay) for
-- customers who host email elsewhere. They point MX at us; we scan with
-- SpamAssassin + ClamAV, quarantine spam, and relay clean mail to their real
-- server. Schema + product only — Postfix relay/quarantine wiring is applied
-- separately (and tested) before the product is activated.
-- Apply after 028_subscriptions.sql.

CREATE TABLE IF NOT EXISTS mail_relay_domains (
  id               BIGSERIAL    PRIMARY KEY,
  user_id          INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  domain_name      VARCHAR(255) NOT NULL UNIQUE,
  destination_host VARCHAR(255) NOT NULL,            -- the customer's real mail server
  destination_port INTEGER      NOT NULL DEFAULT 25,
  spam_threshold   NUMERIC(4,1) NOT NULL DEFAULT 5.0,
  spam_action      VARCHAR(20)  NOT NULL DEFAULT 'quarantine',  -- quarantine | tag | reject
  enabled          BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mail_relay_domains_user ON mail_relay_domains(user_id);

-- Protected addresses (per-mailbox billing + relay_recipient_maps so we only
-- accept the customer's real recipients and never create backscatter).
CREATE TABLE IF NOT EXISTS mail_relay_recipients (
  id              BIGSERIAL    PRIMARY KEY,
  relay_domain_id BIGINT       NOT NULL REFERENCES mail_relay_domains(id) ON DELETE CASCADE,
  address         VARCHAR(320) NOT NULL,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (relay_domain_id, address)
);
CREATE INDEX IF NOT EXISTS idx_mail_relay_recipients_domain ON mail_relay_recipients(relay_domain_id);

-- Storefront product — priced per mailbox/address, staged INACTIVE until the
-- relay + quarantine flow is built and tested end-to-end.
INSERT INTO products (
  id, name, description, price_cents, annual_price_cents, billing_cycle, type, is_active, is_custom, sort_order,
  disk_quota_mb, bandwidth_gb, domains_allowed, email_accounts, databases_allowed
) VALUES
  (106, 'Email Spam Filter',
   'Protect email you host anywhere. Point your MX to us and we scan every message for malware and spam, quarantine the junk, and deliver clean mail to your server. Priced per protected mailbox.',
   150, 1500, 'monthly', 'service', FALSE, FALSE, 6,
   0, 0, 0, 0, 0)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description,
  price_cents = EXCLUDED.price_cents, annual_price_cents = EXCLUDED.annual_price_cents,
  type = EXCLUDED.type, is_custom = EXCLUDED.is_custom, sort_order = EXCLUDED.sort_order, updated_at = NOW();

SELECT setval('products_id_seq', (SELECT MAX(id) FROM products));
