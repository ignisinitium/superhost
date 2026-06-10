import express from 'express';
import Stripe from 'stripe';
import { query } from '../db.js';
import { authenticateClient, authenticateAdmin } from '../middleware/auth.js';
import type { AuthRequest } from '../middleware/auth.js';
import { provisionSignupByToken, provisionSignupById } from '../provisioning.js';

// Initialize Stripe (using a dummy key if not provided in env)
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_dummy_key', {
  apiVersion: '2023-10-16' as any,
});

const router = express.Router();

// --- PUBLIC WEBHOOK ROUTE (Do not authenticate) ---
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!process.env.STRIPE_SECRET_KEY || !endpointSecret) {
    console.error('Stripe webhook received but STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET is not configured');
    return res.status(503).json({ message: 'Stripe webhooks not configured' });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig as string, endpointSecret);
  } catch (err: any) {
    console.error('Stripe webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as any;
        console.log(`Checkout session completed for ${session.customer}`);
        // Self-service signup: provision the hosting account now that payment
        // is confirmed. Idempotent, so webhook retries are safe.
        const token = session.metadata?.signup_token;
        if (token) {
          try {
            await provisionSignupByToken(token);
          } catch (e) {
            console.error('Signup provisioning failed:', (e as Error).message);
          }
        }
        break;
      }
      case 'invoice.paid': {
        const invoice = event.data.object;
        await query('UPDATE invoices SET status = $1, paid_at = NOW() WHERE stripe_invoice_id = $2', ['paid', invoice.id]);
        break;
      }
      case 'invoice.payment_failed': {
        const failedInvoice = event.data.object;
        await query('UPDATE invoices SET status = $1 WHERE stripe_invoice_id = $2', ['failed', failedInvoice.id]);
        break;
      }
      default:
        console.log(`Unhandled Stripe event type: ${event.type}`);
    }
    res.send();
  } catch (err) {
    console.error('Webhook processing error:', err);
    res.status(500).send('Internal Server Error');
  }
});

// ─── ADMIN ROUTES ────────────────────────────────────────────────────────────

// List all products (admin)
router.get('/products/admin', authenticateAdmin, async (_req, res) => {
  try {
    const result = await query('SELECT * FROM products ORDER BY sort_order ASC, price_cents ASC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

// Create a product (admin)
router.post('/products', authenticateAdmin, async (req, res) => {
  const {
    name, description, price_cents, annual_price_cents, onetime_price_cents, is_custom, setup_fee_cents, billing_cycle, type, is_active, sort_order,
    disk_quota_mb, bandwidth_gb, inodes_limit,
    domains_allowed, subdomains_allowed, addon_domains, parked_domains,
    email_accounts, email_quota_mb, email_forwarders, email_autoresponders, mailing_lists,
    spam_filter, catchall_email,
    databases_allowed, database_users,
    ftp_accounts, ssh_access, sftp_access,
    ssl_included, cron_jobs, php_versions, nodejs_support, python_support, ruby_support,
    opcache_enabled, redis_access, memcached_access,
    daily_backups, backup_retention_days,
    reseller_enabled, reseller_accounts,
    static_ip,
    stripe_price_id,
  } = req.body;

  try {
    const result = await query(
      `INSERT INTO products (
        name, description, price_cents, setup_fee_cents, billing_cycle, type, is_active, sort_order,
        disk_quota_mb, bandwidth_gb, inodes_limit,
        domains_allowed, subdomains_allowed, addon_domains, parked_domains,
        email_accounts, email_quota_mb, email_forwarders, email_autoresponders, mailing_lists,
        spam_filter, catchall_email,
        databases_allowed, database_users,
        ftp_accounts, ssh_access, sftp_access,
        ssl_included, cron_jobs, php_versions, nodejs_support, python_support, ruby_support,
        opcache_enabled, redis_access, memcached_access,
        daily_backups, backup_retention_days,
        reseller_enabled, reseller_accounts,
        static_ip, stripe_price_id, annual_price_cents, onetime_price_cents, is_custom
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,
        $9,$10,$11,
        $12,$13,$14,$15,
        $16,$17,$18,$19,$20,
        $21,$22,
        $23,$24,
        $25,$26,$27,
        $28,$29,$30,$31,$32,$33,
        $34,$35,$36,
        $37,$38,
        $39,$40,
        $41,$42,$43,$44,$45
      ) RETURNING *`,
      [
        name, description ?? '', price_cents ?? 0, setup_fee_cents ?? 0,
        billing_cycle ?? 'monthly', type ?? 'hosting', is_active ?? true, sort_order ?? 0,
        disk_quota_mb ?? 5120, bandwidth_gb ?? 100, inodes_limit ?? 250000,
        domains_allowed ?? 1, subdomains_allowed ?? 10, addon_domains ?? 0, parked_domains ?? 5,
        email_accounts ?? 10, email_quota_mb ?? 500, email_forwarders ?? 10,
        email_autoresponders ?? 5, mailing_lists ?? 1,
        spam_filter ?? true, catchall_email ?? true,
        databases_allowed ?? 5, database_users ?? 5,
        ftp_accounts ?? 3, ssh_access ?? false, sftp_access ?? true,
        ssl_included ?? true, cron_jobs ?? 5,
        php_versions ?? '8.1,8.2,8.3',
        nodejs_support ?? false, python_support ?? false, ruby_support ?? false,
        opcache_enabled ?? true, redis_access ?? false, memcached_access ?? false,
        daily_backups ?? false, backup_retention_days ?? 7,
        reseller_enabled ?? false, reseller_accounts ?? 0,
        static_ip ?? false, stripe_price_id ?? null, annual_price_cents ?? 0,
        onetime_price_cents ?? 0, is_custom ?? false,
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

// Update a product (admin)
router.put('/products/:id', authenticateAdmin, async (req, res) => {
  const { id } = req.params;
  const {
    name, description, price_cents, annual_price_cents, onetime_price_cents, is_custom, setup_fee_cents, billing_cycle, type, is_active, sort_order,
    disk_quota_mb, bandwidth_gb, inodes_limit,
    domains_allowed, subdomains_allowed, addon_domains, parked_domains,
    email_accounts, email_quota_mb, email_forwarders, email_autoresponders, mailing_lists,
    spam_filter, catchall_email,
    databases_allowed, database_users,
    ftp_accounts, ssh_access, sftp_access,
    ssl_included, cron_jobs, php_versions, nodejs_support, python_support, ruby_support,
    opcache_enabled, redis_access, memcached_access,
    daily_backups, backup_retention_days,
    reseller_enabled, reseller_accounts,
    static_ip,
    stripe_price_id,
  } = req.body;

  try {
    const result = await query(
      `UPDATE products SET
        name=$1, description=$2, price_cents=$3, setup_fee_cents=$4, billing_cycle=$5,
        type=$6, is_active=$7, sort_order=$8,
        disk_quota_mb=$9, bandwidth_gb=$10, inodes_limit=$11,
        domains_allowed=$12, subdomains_allowed=$13, addon_domains=$14, parked_domains=$15,
        email_accounts=$16, email_quota_mb=$17, email_forwarders=$18,
        email_autoresponders=$19, mailing_lists=$20,
        spam_filter=$21, catchall_email=$22,
        databases_allowed=$23, database_users=$24,
        ftp_accounts=$25, ssh_access=$26, sftp_access=$27,
        ssl_included=$28, cron_jobs=$29, php_versions=$30,
        nodejs_support=$31, python_support=$32, ruby_support=$33,
        opcache_enabled=$34, redis_access=$35, memcached_access=$36,
        daily_backups=$37, backup_retention_days=$38,
        reseller_enabled=$39, reseller_accounts=$40,
        static_ip=$41, stripe_price_id=$42, annual_price_cents=$43,
        onetime_price_cents=$44, is_custom=$45
      WHERE id=$46 RETURNING *`,
      [
        name, description, price_cents, setup_fee_cents, billing_cycle,
        type, is_active, sort_order,
        disk_quota_mb, bandwidth_gb, inodes_limit,
        domains_allowed, subdomains_allowed, addon_domains, parked_domains,
        email_accounts, email_quota_mb, email_forwarders, email_autoresponders, mailing_lists,
        spam_filter, catchall_email,
        databases_allowed, database_users,
        ftp_accounts, ssh_access, sftp_access,
        ssl_included, cron_jobs, php_versions,
        nodejs_support, python_support, ruby_support,
        opcache_enabled, redis_access, memcached_access,
        daily_backups, backup_retention_days,
        reseller_enabled, reseller_accounts,
        static_ip ?? false, stripe_price_id ?? null, annual_price_cents ?? 0,
        onetime_price_cents ?? 0, is_custom ?? false,
        id,
      ]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Package not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

// Delete a product (admin)
router.delete('/products/:id', authenticateAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    await query('DELETE FROM products WHERE id = $1', [id]);
    res.json({ message: 'Package deleted' });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

// ─── SIGNUPS (admin) ──────────────────────────────────────────────────────────

// List recent self-service signups (storefront orders).
router.get('/signups', authenticateAdmin, async (_req, res) => {
  try {
    const result = await query(
      `SELECT s.id, s.username, s.email, s.primary_domain, s.billing_cycle, s.amount_cents,
              s.status, s.created_at, s.provisioned_at, p.name AS plan_name
       FROM pending_signups s LEFT JOIN products p ON p.id = s.product_id
       ORDER BY s.created_at DESC LIMIT 200`,
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

// Manually provision a pending signup (manual orders, or testing before Stripe
// is live). Provisioning itself is idempotent.
router.post('/signups/:id/provision', authenticateAdmin, async (req, res) => {
  try {
    await provisionSignupById(parseInt(req.params.id as string, 10));
    res.json({ message: 'Provisioning started' });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

// Service inquiries / quote requests (admin).
router.get('/inquiries', authenticateAdmin, async (_req, res) => {
  try {
    const result = await query(
      `SELECT i.*, p.name AS service_name FROM service_inquiries i
       LEFT JOIN products p ON p.id = i.product_id
       ORDER BY i.created_at DESC LIMIT 200`,
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

// ─── USER ADD-ONS (admin) ─────────────────────────────────────────────────────

// List add-ons assigned to a user
router.get('/users/:userId/addons', authenticateAdmin, async (req, res) => {
  const { userId } = req.params;
  try {
    const result = await query(
      `SELECT ua.id, ua.user_id, ua.product_id, ua.quantity, ua.notes, ua.created_at,
              p.name, p.description, p.price_cents, p.billing_cycle, p.static_ip,
              p.disk_quota_mb, p.bandwidth_gb, p.email_accounts, p.databases_allowed,
              p.domains_allowed, p.ssh_access, p.daily_backups, p.redis_access, p.memcached_access
       FROM user_addons ua
       JOIN products p ON ua.product_id = p.id
       WHERE ua.user_id = $1
       ORDER BY p.name ASC`,
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

// Assign an add-on to a user
router.post('/users/:userId/addons', authenticateAdmin, async (req, res) => {
  const { userId } = req.params;
  const { productId, quantity = 1, notes } = req.body;
  if (!productId) return res.status(400).json({ message: 'productId is required' });
  try {
    // Verify the product exists and is an addon type
    const prodRes = await query(
      `SELECT id, name FROM products WHERE id = $1 AND type = 'addon'`,
      [productId]
    );
    if (prodRes.rows.length === 0)
      return res.status(404).json({ message: 'Add-on product not found' });

    const result = await query(
      `INSERT INTO user_addons (user_id, product_id, quantity, notes)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, product_id) DO UPDATE SET quantity = $3, notes = $4
       RETURNING *`,
      [userId, productId, quantity, notes ?? null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

// Remove an add-on from a user
router.delete('/users/:userId/addons/:addonId', authenticateAdmin, async (req, res) => {
  const { userId, addonId } = req.params;
  try {
    const r = await query(
      'DELETE FROM user_addons WHERE id = $1 AND user_id = $2 RETURNING id',
      [addonId, userId]
    );
    if (r.rows.length === 0) return res.status(404).json({ message: 'Add-on assignment not found' });
    res.json({ message: 'Add-on removed' });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

// ─── AUTHENTICATED CLIENT ROUTES ─────────────────────────────────────────────

router.use(authenticateClient);

router.get('/products', async (_req: AuthRequest, res) => {
  try {
    const result = await query(
      'SELECT * FROM products WHERE is_active = TRUE ORDER BY sort_order ASC, price_cents ASC'
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

router.get('/invoices', async (req: AuthRequest, res) => {
  try {
    const result = await query(
      'SELECT * FROM invoices WHERE user_id = $1 ORDER BY created_at DESC',
      [req.userId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

router.post('/create-checkout-session', async (req: AuthRequest, res) => {
  const { productId, cycle } = req.body as { productId: number; cycle?: 'monthly' | 'annual' };
  const userId = req.userId!;

  try {
    const userRes = await query('SELECT email, stripe_customer_id FROM users WHERE id = $1', [userId]);
    if (userRes.rows.length === 0) return res.status(404).json({ message: 'User not found' });
    let { email, stripe_customer_id } = userRes.rows[0];

    const prodRes = await query(
      'SELECT name, price_cents, annual_price_cents, stripe_price_id FROM products WHERE id = $1 AND is_active = TRUE',
      [productId]
    );
    if (prodRes.rows.length === 0) return res.status(404).json({ message: 'Package not found' });
    const product = prodRes.rows[0];

    // Charge the annual price when the customer chose the annual cadence.
    const billedAmount = (cycle === 'annual' && product.annual_price_cents > 0)
      ? product.annual_price_cents
      : product.price_cents;

    // Demo mode
    if (!process.env.STRIPE_SECRET_KEY) {
      await query(
        'INSERT INTO invoices (user_id, product_id, stripe_invoice_id, amount_cents, status) VALUES ($1, $2, $3, $4, $5)',
        [userId, productId, `demo_inv_${Date.now()}`, billedAmount, 'open']
      );
      return res.json({ url: '/client/billing?success=demo' });
    }

    if (!stripe_customer_id) {
      const customer = await stripe.customers.create({ email });
      stripe_customer_id = customer.id;
      await query('UPDATE users SET stripe_customer_id = $1 WHERE id = $2', [stripe_customer_id, userId]);
    }

    const session = await stripe.checkout.sessions.create({
      customer: stripe_customer_id,
      line_items: [{ price: product.stripe_price_id, quantity: 1 }],
      mode: 'subscription',
      success_url: `https://${process.env.RP_ID || 'localhost'}/client/billing?success=true`,
      cancel_url: `https://${process.env.RP_ID || 'localhost'}/client/billing?canceled=true`,
    });

    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

export default router;
