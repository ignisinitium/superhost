import express from 'express';
import { query } from '../db.js';
import { authenticateClient } from '../middleware/auth.js';
import type { AuthRequest } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticateClient);

const DOMAIN_RE = /^(?!-)[a-z0-9-]{1,63}(\.[a-z0-9-]{1,63})+$/i;
const HOST_RE = /^(?!-)[a-z0-9.-]{1,253}$|^(\d{1,3}\.){3}\d{1,3}$/i; // hostname or IPv4
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const reconfigure = () => query('INSERT INTO tasks (command, payload) VALUES ($1, $2)', ['CONFIGURE_MAIL_RELAY', {}]);

async function ownsRelay(req: AuthRequest, id: unknown): Promise<boolean> {
  const r = await query('SELECT 1 FROM mail_relay_domains WHERE id = $1 AND user_id = $2', [id, req.userId]);
  return (r.rowCount ?? 0) > 0;
}

// List the client's relay domains with their protected addresses.
router.get('/', async (req: AuthRequest, res) => {
  try {
    const domains = await query(
      'SELECT * FROM mail_relay_domains WHERE user_id = $1 ORDER BY domain_name', [req.userId]);
    const recips = await query(
      `SELECT r.* FROM mail_relay_recipients r
       JOIN mail_relay_domains d ON r.relay_domain_id = d.id WHERE d.user_id = $1`, [req.userId]);
    const byDomain: Record<number, any[]> = {};
    for (const r of recips.rows) (byDomain[r.relay_domain_id] ??= []).push(r);
    res.json(domains.rows.map((d: any) => ({ ...d, recipients: byDomain[d.id] ?? [] })));
  } catch (err) { res.status(500).json({ message: (err as Error).message }); }
});

router.post('/', async (req: AuthRequest, res) => {
  const { domainName, destinationHost, destinationPort, spamThreshold } = req.body ?? {};
  const dom = String(domainName ?? '').toLowerCase().trim();
  const host = String(destinationHost ?? '').toLowerCase().trim();
  const port = parseInt(destinationPort ?? 25, 10);
  if (!DOMAIN_RE.test(dom)) return res.status(400).json({ message: 'Invalid domain name' });
  if (!HOST_RE.test(host)) return res.status(400).json({ message: 'Invalid destination mail server' });
  if (!Number.isInteger(port) || port < 1 || port > 65535) return res.status(400).json({ message: 'Invalid port' });
  try {
    const dup = await query('SELECT 1 FROM mail_relay_domains WHERE domain_name = $1', [dom]);
    if (dup.rowCount) return res.status(409).json({ message: 'That domain is already configured' });
    const r = await query(
      `INSERT INTO mail_relay_domains (user_id, domain_name, destination_host, destination_port, spam_threshold)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.userId, dom, host, port, spamThreshold ?? 5.0]);
    await reconfigure();
    res.status(201).json(r.rows[0]);
  } catch (err) { res.status(500).json({ message: (err as Error).message }); }
});

router.patch('/:id', async (req: AuthRequest, res) => {
  const { id } = req.params;
  const { destinationHost, destinationPort, spamThreshold, enabled } = req.body ?? {};
  try {
    if (!(await ownsRelay(req, id!))) return res.status(404).json({ message: 'Not found' });
    if (destinationHost !== undefined && !HOST_RE.test(String(destinationHost))) {
      return res.status(400).json({ message: 'Invalid destination mail server' });
    }
    const r = await query(
      `UPDATE mail_relay_domains SET
         destination_host = COALESCE($1, destination_host),
         destination_port = COALESCE($2, destination_port),
         spam_threshold   = COALESCE($3, spam_threshold),
         enabled          = COALESCE($4, enabled)
       WHERE id = $5 RETURNING *`,
      [destinationHost ?? null, destinationPort ?? null, spamThreshold ?? null, enabled ?? null, id]);
    await reconfigure();
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ message: (err as Error).message }); }
});

router.delete('/:id', async (req: AuthRequest, res) => {
  const { id } = req.params;
  try {
    if (!(await ownsRelay(req, id!))) return res.status(404).json({ message: 'Not found' });
    await query('DELETE FROM mail_relay_domains WHERE id = $1', [id]);
    await reconfigure();
    res.json({ message: 'Relay domain removed' });
  } catch (err) { res.status(500).json({ message: (err as Error).message }); }
});

// Protected addresses (per-mailbox billing + recipient allow-list)
router.post('/:id/recipients', async (req: AuthRequest, res) => {
  const { id } = req.params;
  const address = String(req.body?.address ?? '').toLowerCase().trim();
  if (!EMAIL_RE.test(address)) return res.status(400).json({ message: 'Invalid email address' });
  try {
    if (!(await ownsRelay(req, id!))) return res.status(404).json({ message: 'Not found' });
    const r = await query(
      `INSERT INTO mail_relay_recipients (relay_domain_id, address) VALUES ($1, $2)
       ON CONFLICT (relay_domain_id, address) DO NOTHING RETURNING *`, [id, address]);
    await reconfigure();
    res.status(201).json(r.rows[0] ?? { message: 'Already added' });
  } catch (err) { res.status(500).json({ message: (err as Error).message }); }
});

router.delete('/:id/recipients/:rid', async (req: AuthRequest, res) => {
  const { id, rid } = req.params;
  try {
    if (!(await ownsRelay(req, id!))) return res.status(404).json({ message: 'Not found' });
    await query('DELETE FROM mail_relay_recipients WHERE id = $1 AND relay_domain_id = $2', [rid, id]);
    await reconfigure();
    res.json({ message: 'Address removed' });
  } catch (err) { res.status(500).json({ message: (err as Error).message }); }
});

export default router;
