import express from 'express';
import Stripe from 'stripe';
import { query } from '../db.js';
import { authenticateClient, authenticateAdmin } from '../middleware/auth.js';
import type { AuthRequest } from '../middleware/auth.js';

// Initialize Stripe (using a dummy key if not provided in env)
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_dummy_key', {
  apiVersion: '2023-10-16' as any, // Cast to avoid TS error on older/newer versions depending on types
});

const router = express.Router();

// --- PUBLIC WEBHOOK ROUTE (Do not authenticate) ---
router.post('/webhook', express.raw({type: 'application/json'}), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_dummy';

  let event;

  try {
    // Note: To actually verify signatures, req.body must be the raw buffer.
    // In a real setup, ensure express.raw() handles this route correctly before standard json parsers.
    // For this demo, we'll try/catch the constructEvent.
    if (process.env.STRIPE_SECRET_KEY) {
      event = stripe.webhooks.constructEvent(req.body, sig as string, endpointSecret);
    } else {
      // Dummy mode
      event = JSON.parse(req.body.toString());
    }
  } catch (err: any) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  try {
    switch (event.type) {
      case 'checkout.session.completed':
        const session = event.data.object;
        // Fulfill the purchase (e.g., mark invoice paid, provision service)
        console.log(`Checkout session completed for ${session.customer}`);
        break;
      case 'invoice.paid':
        const invoice = event.data.object;
        await query('UPDATE invoices SET status = $1, paid_at = NOW() WHERE stripe_invoice_id = $2', ['paid', invoice.id]);
        break;
      case 'invoice.payment_failed':
        const failedInvoice = event.data.object;
        await query('UPDATE invoices SET status = $1 WHERE stripe_invoice_id = $2', ['failed', failedInvoice.id]);
        break;
      // ... handle other event types
      default:
        console.log(`Unhandled event type ${event.type}`);
    }
    res.send();
  } catch (err) {
    console.error('Webhook processing error:', err);
    res.status(500).send('Internal Server Error');
  }
});

// --- ADMIN ROUTES ---
router.post('/products', authenticateAdmin, async (req, res) => {
  const { name, description, price_cents, type, stripe_price_id } = req.body;
  try {
    const result = await query(
      'INSERT INTO products (name, description, price_cents, type, stripe_price_id) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [name, description, price_cents, type, stripe_price_id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

router.delete('/products/:id', authenticateAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    await query('DELETE FROM products WHERE id = $1', [id]);
    res.json({ message: 'Product deleted' });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

// --- AUTHENTICATED CLIENT ROUTES ---
router.use(authenticateClient);

router.get('/products', async (req: AuthRequest, res) => {
  try {
    const result = await query('SELECT * FROM products ORDER BY price_cents ASC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

router.get('/invoices', async (req: AuthRequest, res) => {
  try {
    const result = await query('SELECT * FROM invoices WHERE user_id = $1 ORDER BY created_at DESC', [req.userId]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

router.post('/create-checkout-session', async (req: AuthRequest, res) => {
  const { productId } = req.body;
  const userId = req.userId!;

  try {
    const userRes = await query('SELECT email, stripe_customer_id FROM users WHERE id = $1', [userId]);
    if (userRes.rows.length === 0) return res.status(404).json({ message: 'User not found' });
    let { email, stripe_customer_id } = userRes.rows[0];

    const prodRes = await query('SELECT name, price_cents, stripe_price_id FROM products WHERE id = $1', [productId]);
    if (prodRes.rows.length === 0) return res.status(404).json({ message: 'Product not found' });
    const product = prodRes.rows[0];

    // If no Stripe API key is configured, simulate a success for the demo
    if (!process.env.STRIPE_SECRET_KEY) {
      // Simulate creating an invoice
      await query(
        'INSERT INTO invoices (user_id, stripe_invoice_id, amount_cents, status) VALUES ($1, $2, $3, $4)',
        [userId, `demo_inv_${Date.now()}`, product.price_cents, 'open']
      );
      return res.json({ url: '/client/billing?success=demo' });
    }

    // Real Stripe Integration
    if (!stripe_customer_id) {
      const customer = await stripe.customers.create({ email });
      stripe_customer_id = customer.id;
      await query('UPDATE users SET stripe_customer_id = $1 WHERE id = $2', [stripe_customer_id, userId]);
    }

    const session = await stripe.checkout.sessions.create({
      customer: stripe_customer_id,
      line_items: [
        {
          price: product.stripe_price_id, // Requires actual Stripe Price ID in DB
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `https://${process.env.RP_ID || 'web02.qc.fyi'}/client/billing?success=true`,
      cancel_url: `https://${process.env.RP_ID || 'web02.qc.fyi'}/client/billing?canceled=true`,
    });

    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

export default router;
