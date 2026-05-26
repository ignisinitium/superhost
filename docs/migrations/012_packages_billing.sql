-- Migration 012: Full hosting packages and billing tables
-- Creates products table with comprehensive hosting plan limits, and invoices table.

-- Drop old products/invoices tables if they exist without the full schema
DROP TABLE IF EXISTS invoices;
DROP TABLE IF EXISTS products;

CREATE TABLE products (
  id                    SERIAL PRIMARY KEY,
  name                  VARCHAR(120)  NOT NULL,
  description           TEXT,
  price_cents           INTEGER       NOT NULL DEFAULT 0,
  setup_fee_cents       INTEGER       NOT NULL DEFAULT 0,
  billing_cycle         VARCHAR(20)   NOT NULL DEFAULT 'monthly'
                          CHECK (billing_cycle IN ('monthly','quarterly','annually','onetime')),
  type                  VARCHAR(30)   NOT NULL DEFAULT 'hosting'
                          CHECK (type IN ('hosting','addon','domain','vps','reseller')),
  is_active             BOOLEAN       NOT NULL DEFAULT TRUE,
  sort_order            INTEGER       NOT NULL DEFAULT 0,

  -- Storage & bandwidth
  disk_quota_mb         INTEGER       NOT NULL DEFAULT 5120,   -- -1 = unlimited
  bandwidth_gb          INTEGER       NOT NULL DEFAULT 100,    -- -1 = unlimited
  inodes_limit          INTEGER       NOT NULL DEFAULT 250000, -- -1 = unlimited

  -- Domains
  domains_allowed       INTEGER       NOT NULL DEFAULT 1,      -- -1 = unlimited
  subdomains_allowed    INTEGER       NOT NULL DEFAULT 10,     -- -1 = unlimited
  addon_domains         INTEGER       NOT NULL DEFAULT 0,      -- -1 = unlimited
  parked_domains        INTEGER       NOT NULL DEFAULT 5,      -- -1 = unlimited

  -- Email
  email_accounts        INTEGER       NOT NULL DEFAULT 10,     -- -1 = unlimited
  email_quota_mb        INTEGER       NOT NULL DEFAULT 500,    -- per account, -1 = unlimited
  email_forwarders      INTEGER       NOT NULL DEFAULT 10,     -- -1 = unlimited
  email_autoresponders  INTEGER       NOT NULL DEFAULT 5,      -- -1 = unlimited
  mailing_lists         INTEGER       NOT NULL DEFAULT 1,      -- -1 = unlimited
  spam_filter           BOOLEAN       NOT NULL DEFAULT TRUE,
  catchall_email        BOOLEAN       NOT NULL DEFAULT TRUE,

  -- Databases
  databases_allowed     INTEGER       NOT NULL DEFAULT 5,      -- -1 = unlimited
  database_users        INTEGER       NOT NULL DEFAULT 5,      -- -1 = unlimited

  -- FTP / SSH
  ftp_accounts          INTEGER       NOT NULL DEFAULT 3,      -- -1 = unlimited
  ssh_access            BOOLEAN       NOT NULL DEFAULT FALSE,
  sftp_access           BOOLEAN       NOT NULL DEFAULT TRUE,

  -- Web features
  ssl_included          BOOLEAN       NOT NULL DEFAULT TRUE,
  cron_jobs             INTEGER       NOT NULL DEFAULT 5,      -- -1 = unlimited
  php_versions          TEXT          NOT NULL DEFAULT '8.1,8.2,8.3',
  nodejs_support        BOOLEAN       NOT NULL DEFAULT FALSE,
  python_support        BOOLEAN       NOT NULL DEFAULT FALSE,
  ruby_support          BOOLEAN       NOT NULL DEFAULT FALSE,

  -- Performance & caching
  opcache_enabled       BOOLEAN       NOT NULL DEFAULT TRUE,
  redis_access          BOOLEAN       NOT NULL DEFAULT FALSE,
  memcached_access      BOOLEAN       NOT NULL DEFAULT FALSE,

  -- Backups
  daily_backups         BOOLEAN       NOT NULL DEFAULT FALSE,
  backup_retention_days INTEGER       NOT NULL DEFAULT 7,

  -- Reseller
  reseller_enabled      BOOLEAN       NOT NULL DEFAULT FALSE,
  reseller_accounts     INTEGER       NOT NULL DEFAULT 0,      -- -1 = unlimited

  -- Billing integration
  stripe_price_id       VARCHAR(120),

  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE invoices (
  id                    SERIAL PRIMARY KEY,
  user_id               INTEGER       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id            INTEGER       REFERENCES products(id) ON DELETE SET NULL,
  stripe_invoice_id     VARCHAR(120),
  amount_cents          INTEGER       NOT NULL DEFAULT 0,
  status                VARCHAR(20)   NOT NULL DEFAULT 'open'
                          CHECK (status IN ('open','paid','failed','void','draft')),
  due_date              DATE,
  paid_at               TIMESTAMPTZ,
  notes                 TEXT,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_invoices_user_id   ON invoices(user_id);
CREATE INDEX idx_invoices_status    ON invoices(status);
CREATE INDEX idx_products_is_active ON products(is_active);
CREATE INDEX idx_products_type      ON products(type);

-- Trigger: keep products.updated_at current
CREATE OR REPLACE FUNCTION update_products_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_products_updated_at
BEFORE UPDATE ON products
FOR EACH ROW EXECUTE FUNCTION update_products_updated_at();

-- Add stripe_customer_id to users if missing
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(80);
