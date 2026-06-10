-- Migration 023: industry-aligned hosting packages + annual pricing.
--   * Adds annual_price_cents so each plan carries both a monthly and an annual
--     (discounted) price — the standard pricing-page monthly/annual toggle.
--   * Replaces the old flat Basic/Pro plans (which had identical limits) with a
--     proper good/better/best ladder + a reseller plan, at mainstream-value
--     price points with generous, enforceable (metered) caps.
-- Upserts by id so the existing user on plan id 1 is preserved (now "Starter").
-- Apply after 022_password_setup_tokens.sql.

ALTER TABLE products ADD COLUMN IF NOT EXISTS annual_price_cents INTEGER NOT NULL DEFAULT 0;

INSERT INTO products (
  id, name, description, price_cents, annual_price_cents, setup_fee_cents, billing_cycle, type, is_active, sort_order,
  disk_quota_mb, bandwidth_gb, inodes_limit,
  domains_allowed, subdomains_allowed, addon_domains, parked_domains,
  email_accounts, email_quota_mb, email_forwarders, email_autoresponders, mailing_lists, spam_filter, catchall_email,
  databases_allowed, database_users,
  ftp_accounts, ssh_access, sftp_access,
  ssl_included, cron_jobs, php_versions, nodejs_support, python_support, ruby_support,
  opcache_enabled, redis_access, memcached_access,
  daily_backups, backup_retention_days,
  reseller_enabled, reseller_accounts, static_ip
) VALUES
  -- Starter — $5.99/mo, $59.90/yr (~$4.99/mo). One site, the essentials.
  (1, 'Starter', 'Perfect for a single website or blog. Everything you need to get online.',
   599, 5990, 0, 'monthly', 'hosting', TRUE, 1,
   25600, 250, 250000,
   1, 10, 0, 5,
   10, 1024, 25, 5, 1, TRUE, TRUE,
   5, 5,
   2, FALSE, TRUE,
   TRUE, 5, '8.1,8.2,8.3,8.4', FALSE, FALSE, FALSE,
   TRUE, FALSE, FALSE,
   FALSE, 7,
   FALSE, 0, FALSE),

  -- Business — $10.99/mo, $109.90/yr (~$9.16/mo). Several sites, daily backups, SSH.
  (2, 'Business', 'For growing businesses running multiple sites. Daily backups and SSH included.',
   1099, 10990, 0, 'monthly', 'hosting', TRUE, 2,
   76800, 1000, 500000,
   10, 50, 25, 25,
   100, 2048, 100, 25, 5, TRUE, TRUE,
   25, 25,
   10, TRUE, TRUE,
   TRUE, 25, '8.1,8.2,8.3,8.4', TRUE, TRUE, FALSE,
   TRUE, TRUE, FALSE,
   TRUE, 14,
   FALSE, 0, FALSE),

  -- Pro — $19.99/mo, $199.90/yr (~$16.66/mo). High-traffic sites, full stack, 30-day backups.
  (4, 'Pro', 'High-performance hosting for high-traffic sites. Redis, all runtimes, 30-day backups.',
   1999, 19990, 0, 'monthly', 'hosting', TRUE, 3,
   204800, 3000, 1000000,
   50, 200, 100, 100,
   500, 5120, 500, 100, 25, TRUE, TRUE,
   100, 100,
   25, TRUE, TRUE,
   TRUE, 100, '8.1,8.2,8.3,8.4', TRUE, TRUE, TRUE,
   TRUE, TRUE, TRUE,
   TRUE, 30,
   FALSE, 0, FALSE),

  -- Reseller — $34.99/mo, $349.90/yr (~$29.16/mo). Host & manage clients.
  (5, 'Reseller', 'Run your own hosting business. Manage up to 25 client accounts with white-label branding.',
   3499, 34990, 0, 'monthly', 'reseller', TRUE, 4,
   307200, 5000, 2000000,
   200, 500, 200, 200,
   1000, 5120, 1000, 200, 50, TRUE, TRUE,
   250, 250,
   100, TRUE, TRUE,
   TRUE, 200, '8.1,8.2,8.3,8.4', TRUE, TRUE, TRUE,
   TRUE, TRUE, TRUE,
   TRUE, 30,
   TRUE, 25, FALSE),

  -- Dedicated IP — $3.99/mo add-on.
  (3, 'Dedicated IP', 'A dedicated IPv4 address for your account.',
   399, 0, 0, 'monthly', 'addon', TRUE, 10,
   0, 0, 0,
   0, 0, 0, 0,
   0, 0, 0, 0, 0, FALSE, FALSE,
   0, 0,
   0, FALSE, FALSE,
   FALSE, 0, '', FALSE, FALSE, FALSE,
   FALSE, FALSE, FALSE,
   FALSE, 0,
   FALSE, 0, TRUE)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description,
  price_cents = EXCLUDED.price_cents, annual_price_cents = EXCLUDED.annual_price_cents,
  setup_fee_cents = EXCLUDED.setup_fee_cents, billing_cycle = EXCLUDED.billing_cycle,
  type = EXCLUDED.type, is_active = EXCLUDED.is_active, sort_order = EXCLUDED.sort_order,
  disk_quota_mb = EXCLUDED.disk_quota_mb, bandwidth_gb = EXCLUDED.bandwidth_gb, inodes_limit = EXCLUDED.inodes_limit,
  domains_allowed = EXCLUDED.domains_allowed, subdomains_allowed = EXCLUDED.subdomains_allowed,
  addon_domains = EXCLUDED.addon_domains, parked_domains = EXCLUDED.parked_domains,
  email_accounts = EXCLUDED.email_accounts, email_quota_mb = EXCLUDED.email_quota_mb,
  email_forwarders = EXCLUDED.email_forwarders, email_autoresponders = EXCLUDED.email_autoresponders,
  mailing_lists = EXCLUDED.mailing_lists, spam_filter = EXCLUDED.spam_filter, catchall_email = EXCLUDED.catchall_email,
  databases_allowed = EXCLUDED.databases_allowed, database_users = EXCLUDED.database_users,
  ftp_accounts = EXCLUDED.ftp_accounts, ssh_access = EXCLUDED.ssh_access, sftp_access = EXCLUDED.sftp_access,
  ssl_included = EXCLUDED.ssl_included, cron_jobs = EXCLUDED.cron_jobs, php_versions = EXCLUDED.php_versions,
  nodejs_support = EXCLUDED.nodejs_support, python_support = EXCLUDED.python_support, ruby_support = EXCLUDED.ruby_support,
  opcache_enabled = EXCLUDED.opcache_enabled, redis_access = EXCLUDED.redis_access, memcached_access = EXCLUDED.memcached_access,
  daily_backups = EXCLUDED.daily_backups, backup_retention_days = EXCLUDED.backup_retention_days,
  reseller_enabled = EXCLUDED.reseller_enabled, reseller_accounts = EXCLUDED.reseller_accounts,
  static_ip = EXCLUDED.static_ip, updated_at = NOW();

-- Keep the serial sequence ahead of the explicit ids we inserted.
SELECT setval('products_id_seq', (SELECT MAX(id) FROM products));
