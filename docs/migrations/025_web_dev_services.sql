-- Migration 025: web development & AI services.
-- These are project engagements sold as fixed packages (one-time upfront OR
-- monthly, both bundling hosting) plus custom (quote) offerings. They reuse the
-- products table with type='service' and carry hosting limits so a purchase
-- provisions a real hosting account. Apply after 024_public_signups.sql.

-- Allow the 'service' product type.
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_type_check;
ALTER TABLE products ADD CONSTRAINT products_type_check
  CHECK (type IN ('hosting', 'addon', 'domain', 'vps', 'reseller', 'service'));

-- One-time (upfront) price option, and a "request a quote" flag for custom work.
ALTER TABLE products ADD COLUMN IF NOT EXISTS onetime_price_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_custom BOOLEAN NOT NULL DEFAULT FALSE;

-- Service inquiries / leads (custom work + general "get a quote").
CREATE TABLE IF NOT EXISTS service_inquiries (
  id          BIGSERIAL    PRIMARY KEY,
  product_id  INTEGER      REFERENCES products(id) ON DELETE SET NULL,
  name        VARCHAR(120) NOT NULL,
  email       VARCHAR(120) NOT NULL,
  phone       VARCHAR(40),
  company     VARCHAR(120),
  budget      VARCHAR(40),
  message     TEXT         NOT NULL,
  status      VARCHAR(20)  NOT NULL DEFAULT 'new',  -- new | contacted | won | lost
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_service_inquiries_created ON service_inquiries(created_at DESC);

-- Seed service packages (price_cents = monthly option, onetime_price_cents =
-- upfront option; both include hosting). ids 101-105 to stay clear of plan ids.
INSERT INTO products (
  id, name, description, price_cents, onetime_price_cents, annual_price_cents, billing_cycle, type, is_active, is_custom, sort_order,
  disk_quota_mb, bandwidth_gb, domains_allowed, subdomains_allowed, email_accounts, databases_allowed,
  ssl_included, daily_backups, ssh_access, php_versions, nodejs_support, python_support, redis_access
) VALUES
  (101, 'Single-Page Website',
   'A polished one-page website — landing page, portfolio, or business card. Mobile-friendly with a contact form. Hosting included.',
   2900, 39900, 0, 'monthly', 'service', TRUE, FALSE, 1,
   10240, 100, 1, 5, 5, 2,
   TRUE, FALSE, FALSE, '8.1,8.2,8.3,8.4', FALSE, FALSE, FALSE),

  (102, 'Basic 5-Page Website',
   'A professional website up to 5 pages (Home, About, Services, Gallery, Contact). Responsive design, contact form, SEO basics. Hosting included.',
   4900, 79900, 0, 'monthly', 'service', TRUE, FALSE, 2,
   25600, 250, 1, 10, 10, 5,
   TRUE, FALSE, FALSE, '8.1,8.2,8.3,8.4', FALSE, FALSE, FALSE),

  (103, 'E-Commerce Store',
   'An online store with up to 5 products, shopping cart, secure checkout, and payment integration. Hosting + SSL + daily backups included.',
   9900, 149900, 0, 'monthly', 'service', TRUE, FALSE, 3,
   76800, 1000, 3, 50, 25, 10,
   TRUE, TRUE, TRUE, '8.1,8.2,8.3,8.4', TRUE, TRUE, TRUE),

  (104, 'Full-Stack Website',
   'A custom web application — dashboards, user accounts, APIs, and integrations built to your spec. Premium hosting with Redis & all runtimes included.',
   29900, 499900, 0, 'monthly', 'service', TRUE, FALSE, 4,
   204800, 3000, 10, 200, 100, 50,
   TRUE, TRUE, TRUE, '8.1,8.2,8.3,8.4', TRUE, TRUE, TRUE),

  (105, 'AI Services',
   'Custom AI solutions — chatbots, document Q&A, workflow automation, and model integrations tailored to your business. Pricing scoped to your project.',
   0, 0, 0, 'onetime', 'service', TRUE, TRUE, 5,
   25600, 250, 1, 10, 10, 5,
   TRUE, FALSE, TRUE, '8.1,8.2,8.3,8.4', TRUE, TRUE, TRUE)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description,
  price_cents = EXCLUDED.price_cents, onetime_price_cents = EXCLUDED.onetime_price_cents,
  billing_cycle = EXCLUDED.billing_cycle, type = EXCLUDED.type, is_active = EXCLUDED.is_active,
  is_custom = EXCLUDED.is_custom, sort_order = EXCLUDED.sort_order,
  disk_quota_mb = EXCLUDED.disk_quota_mb, bandwidth_gb = EXCLUDED.bandwidth_gb,
  domains_allowed = EXCLUDED.domains_allowed, subdomains_allowed = EXCLUDED.subdomains_allowed,
  email_accounts = EXCLUDED.email_accounts, databases_allowed = EXCLUDED.databases_allowed,
  ssl_included = EXCLUDED.ssl_included, daily_backups = EXCLUDED.daily_backups, ssh_access = EXCLUDED.ssh_access,
  php_versions = EXCLUDED.php_versions, nodejs_support = EXCLUDED.nodejs_support,
  python_support = EXCLUDED.python_support, redis_access = EXCLUDED.redis_access, updated_at = NOW();

SELECT setval('products_id_seq', (SELECT MAX(id) FROM products));
