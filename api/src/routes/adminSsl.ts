import express from 'express';
import { query } from '../db.js';
import { authenticateAdmin } from '../middleware/auth.js';
import type { AuthRequest } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateAdmin);

// Basic hostname guard for values that flow into worker shell commands. The
// worker re-validates and shell-escapes, but reject obvious junk early.
const DOMAINISH = /^[A-Za-z0-9._-]{1,253}$/;

// Overview: every known certificate (with derived owner) plus the domains that
// don't currently have a valid certificate covering them.
router.get('/', async (_req: AuthRequest, res) => {
  try {
    const certs = await query(`
      SELECT s.*, u.username
      FROM ssl_certificates s
      LEFT JOIN users u ON s.user_id = u.id
      ORDER BY s.not_after ASC NULLS LAST
    `);

    const domainsWithoutSsl = await query(`
      SELECT d.id, d.domain_name, d.is_ssl, d.is_subdomain, u.username
      FROM domains d
      JOIN users u ON d.user_id = u.id
      WHERE NOT EXISTS (
        SELECT 1 FROM ssl_certificates s
        WHERE d.domain_name = ANY(s.domains) AND s.not_after > NOW()
      )
      ORDER BY u.username ASC, d.domain_name ASC
    `);

    res.json({ certs: certs.rows, domainsWithoutSsl: domainsWithoutSsl.rows });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

// Rescan certs from disk (queues a worker task; poll /tasks/:id for completion).
router.post('/refresh', async (_req: AuthRequest, res) => {
  try {
    const t = await query(
      'INSERT INTO tasks (command, payload) VALUES ($1, $2) RETURNING id',
      ['REFRESH_SSL_CERTS', {}]
    );
    res.json({ message: 'SSL refresh started', taskId: t.rows[0].id });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

// Issue a certificate for a domain (Let's Encrypt via certbot --nginx).
router.post('/issue', async (req: AuthRequest, res) => {
  const { domainName } = req.body as { domainName?: string };
  if (!domainName || !DOMAINISH.test(domainName)) {
    return res.status(400).json({ message: 'A valid domainName is required' });
  }
  try {
    const d = await query('SELECT id FROM domains WHERE domain_name = $1', [domainName]);
    if (d.rowCount === 0) return res.status(404).json({ message: 'Domain not found' });

    const t = await query(
      'INSERT INTO tasks (command, payload) VALUES ($1, $2) RETURNING id',
      ['INSTALL_SSL', { domainName }]
    );
    res.json({ message: 'SSL issuance started', taskId: t.rows[0].id });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

// Force-reissue an existing certificate (--force-renewal).
router.post('/reissue', async (req: AuthRequest, res) => {
  const { domainName } = req.body as { domainName?: string };
  if (!domainName || !DOMAINISH.test(domainName)) {
    return res.status(400).json({ message: 'A valid domainName is required' });
  }
  try {
    const t = await query(
      'INSERT INTO tasks (command, payload) VALUES ($1, $2) RETURNING id',
      ['REISSUE_SSL', { domainName }]
    );
    res.json({ message: 'SSL reissue started', taskId: t.rows[0].id });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

// Renew all certs that are within certbot's renewal window.
router.post('/renew-all', async (_req: AuthRequest, res) => {
  try {
    const t = await query(
      'INSERT INTO tasks (command, payload) VALUES ($1, $2) RETURNING id',
      ['RENEW_ALL_SSL', {}]
    );
    res.json({ message: 'Renewal of all certificates started', taskId: t.rows[0].id });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

export default router;
