import express from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import Stripe from 'stripe';
import { query } from '../db.js';
import { checkIpBlock } from '../middleware/rateLimiter.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_dummy_key', {
  apiVersion: '2023-10-16' as any,
});

const router = express.Router();

const USERNAME_RE = /^[a-z][a-z0-9_-]{2,31}$/;
const DOMAIN_RE = /^(?!-)[a-z0-9-]{1,63}(\.[a-z0-9-]{1,63})+$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// System / role names a customer must not be able to claim.
const RESERVED = new Set([
  'root', 'admin', 'administrator', 'www', 'mail', 'ftp', 'sftp', 'test', 'superhost',
  'postmaster', 'webmaster', 'support', 'info', 'noreply', 'no-reply', 'daemon', 'bin',
  'sys', 'postfix', 'dovecot', 'mysql', 'nginx', 'vmail', 'named', 'bind', 'cpanel', 'cwp',
]);

// Return the storefront origin to send the buyer back to after Stripe. Prefer
// the host the customer is actually on (so it works on qc.fyi or web02.qc.fyi),
// but only accept the company's own domain to avoid open-redirect abuse.
function safeOrigin(req: express.Request): string {
  const fallbackHost = (process.env.STOREFRONT_DOMAIN || process.env.MASTER_DOMAIN || 'qc.fyi').replace(/^https?:\/\//, '');
  const root = fallbackHost.split('.').slice(-2).join('.'); // e.g. qc.fyi
  const candidates = [
    req.headers.origin,
    req.headers.host ? `https://${req.headers.host}` : null,
  ];
  for (const c of candidates) {
    if (typeof c !== 'string') continue;
    try {
      const host = new URL(c).host;
      if (host === root || host.endsWith(`.${root}`)) return `https://${host}`;
    } catch { /* not a URL */ }
  }
  return `https://${fallbackHost}`;
}

function normalizeDomain(raw: unknown): string {
  return String(raw ?? '').toLowerCase().trim()
    .replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');
}

async function usernameTaken(username: string): Promise<boolean> {
  const u = await query('SELECT 1 FROM users WHERE lower(username) = lower($1)', [username]);
  if (u.rowCount) return true;
  const p = await query(
    `SELECT 1 FROM pending_signups WHERE lower(username) = lower($1)
       AND status = 'pending' AND created_at > NOW() - INTERVAL '1 day'`,
    [username],
  );
  return (p.rowCount ?? 0) > 0;
}

// Public plans for the marketing/pricing page.
router.get('/plans', async (_req, res) => {
  try {
    const result = await query(
      `SELECT id, name, description, price_cents, annual_price_cents, type,
              disk_quota_mb, bandwidth_gb, domains_allowed, subdomains_allowed,
              email_accounts, databases_allowed, ftp_accounts,
              daily_backups, backup_retention_days, ssh_access, ssl_included,
              nodejs_support, python_support, redis_access,
              reseller_enabled, reseller_accounts, sort_order
       FROM products
       WHERE is_active = TRUE AND type IN ('hosting', 'reseller')
       ORDER BY sort_order ASC, price_cents ASC`,
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

// Public web-development / AI service packages.
router.get('/services', async (_req, res) => {
  try {
    const result = await query(
      `SELECT id, name, description, price_cents, onetime_price_cents, is_custom, sort_order,
              disk_quota_mb, bandwidth_gb, domains_allowed, email_accounts, databases_allowed,
              daily_backups, ssh_access, ssl_included
       FROM products
       WHERE is_active = TRUE AND type = 'service'
       ORDER BY sort_order ASC, price_cents ASC`,
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

// Portfolio of completed websites for the marketing site.
router.get('/portfolio', async (_req, res) => {
  try {
    const result = await query(
      `SELECT id, title, url, description, category, image_url
       FROM portfolio_items WHERE is_active = TRUE ORDER BY sort_order ASC, id ASC`,
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

// Capture a sales lead / quote request (e.g. for custom AI or full-stack work).
router.post('/inquiry', checkIpBlock, async (req, res) => {
  const { name, email, phone, company, budget, message, productId } = req.body ?? {};
  if (!name || String(name).trim().length < 2) return res.status(400).json({ message: 'Please enter your name' });
  if (!EMAIL_RE.test(String(email ?? ''))) return res.status(400).json({ message: 'Please enter a valid email' });
  if (!message || String(message).trim().length < 5) return res.status(400).json({ message: 'Please describe your project' });
  try {
    let pid: number | null = null;
    if (productId) {
      const p = await query("SELECT id FROM products WHERE id = $1 AND type = 'service'", [productId]);
      if (p.rowCount) pid = Number(productId);
    }
    await query(
      `INSERT INTO service_inquiries (product_id, name, email, phone, company, budget, message)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [pid, String(name).slice(0, 120), String(email).slice(0, 120),
       phone ? String(phone).slice(0, 40) : null, company ? String(company).slice(0, 120) : null,
       budget ? String(budget).slice(0, 40) : null, String(message).slice(0, 5000)],
    );
    res.status(201).json({ message: "Thanks! We'll be in touch shortly." });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

// Live username availability for the signup form.
router.post('/check-username', checkIpBlock, async (req, res) => {
  const username = String(req.body?.username ?? '').toLowerCase();
  if (!USERNAME_RE.test(username) || RESERVED.has(username)) {
    return res.json({ available: false, reason: 'invalid' });
  }
  res.json({ available: !(await usernameTaken(username)) });
});

// Validate the signup, store it as pending, and open a Stripe Checkout session.
// NOTHING is provisioned here — provisioning happens only on the paid webhook.
router.post('/checkout', checkIpBlock, async (req, res) => {
  const { username, email, password, domain, productId, cycle } = req.body ?? {};
  const uname = String(username ?? '').toLowerCase();
  const mail = String(email ?? '').toLowerCase().trim();
  const primaryDomain = domain ? normalizeDomain(domain) : '';
  // monthly | annual (hosting) | onetime (service upfront)
  const billingCycle = ['annual', 'onetime'].includes(cycle) ? cycle : 'monthly';

  try {
    if (!USERNAME_RE.test(uname) || RESERVED.has(uname)) {
      return res.status(400).json({ message: 'Invalid username (3–32 chars, start with a letter)' });
    }
    if (!EMAIL_RE.test(mail)) return res.status(400).json({ message: 'Invalid email address' });
    if (!password || String(password).length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }
    if (primaryDomain && !DOMAIN_RE.test(primaryDomain)) {
      return res.status(400).json({ message: 'Invalid domain name' });
    }

    const prodRes = await query(
      "SELECT * FROM products WHERE id = $1 AND is_active = TRUE AND type IN ('hosting','reseller','service')",
      [productId],
    );
    if (prodRes.rowCount === 0) return res.status(404).json({ message: 'Plan not found' });
    const product = prodRes.rows[0];
    if (product.is_custom) {
      return res.status(400).json({ message: 'This service is quote-only — please request a quote.' });
    }

    if (await usernameTaken(uname)) return res.status(409).json({ message: 'That username is taken' });
    const emailExists = await query('SELECT 1 FROM users WHERE lower(email) = lower($1)', [mail]);
    if (emailExists.rowCount) return res.status(409).json({ message: 'An account with that email already exists' });
    if (primaryDomain) {
      const dom = await query('SELECT 1 FROM domains WHERE lower(domain_name) = lower($1)', [primaryDomain]);
      if (dom.rowCount) return res.status(409).json({ message: 'That domain is already hosted here' });
    }

    // Resolve amount + Stripe mode from the chosen cycle.
    let amount: number;
    let stripeMode: 'subscription' | 'payment';
    let interval: 'month' | 'year' = 'month';
    if (billingCycle === 'onetime') {
      amount = product.onetime_price_cents;
      stripeMode = 'payment';
    } else if (billingCycle === 'annual') {
      amount = product.annual_price_cents > 0 ? product.annual_price_cents : product.price_cents;
      stripeMode = 'subscription';
      interval = 'year';
    } else {
      amount = product.price_cents;
      stripeMode = 'subscription';
    }
    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'That billing option is not available for this package.' });
    }

    const passwordHash = await bcrypt.hash(String(password), 12);
    const token = crypto.randomBytes(24).toString('hex');
    const isService = product.type === 'service';
    const label = isService ? product.name : `${product.name} Hosting`;

    await query(
      `INSERT INTO pending_signups
         (session_token, username, email, password_hash, primary_domain, product_id, billing_cycle, amount_cents)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [token, uname, mail, passwordHash, primaryDomain || null, product.id, billingCycle, amount],
    );

    const origin = safeOrigin(req);
    let session;
    try {
      session = await stripe.checkout.sessions.create({
        mode: stripeMode,
        customer_email: mail,
        line_items: [{
          quantity: 1,
          price_data: {
            currency: 'usd',
            product_data: { name: `${label} (${billingCycle})` },
            unit_amount: amount,
            ...(stripeMode === 'subscription' ? { recurring: { interval } } : {}),
          },
        }],
        metadata: { signup_token: token },
        ...(stripeMode === 'subscription' ? { subscription_data: { metadata: { signup_token: token } } } : {}),
        success_url: `${origin}/order/success?token=${token}`,
        cancel_url: `${origin}/order?canceled=1`,
      });
    } catch (err) {
      // Roll back the pending row so a retry isn't blocked by the reserved username.
      await query('DELETE FROM pending_signups WHERE session_token = $1', [token]).catch(() => {});
      return res.status(502).json({ message: `Payment processor not configured: ${(err as Error).message}` });
    }

    await query('UPDATE pending_signups SET stripe_session_id = $1 WHERE session_token = $2', [session.id, token]);
    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

export default router;
