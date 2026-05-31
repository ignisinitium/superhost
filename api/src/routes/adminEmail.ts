import express from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db.js';
import { authenticateAdmin } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticateAdmin);

async function generateDovecotPassword(plain: string): Promise<string> {
  if (!plain || plain.length < 8) throw new Error('Password must be at least 8 characters');
  const hash = await bcrypt.hash(plain, 12);
  return `{BLF-CRYPT}${hash}`;
}

// ── List mailboxes ─────────────────────────────────────────────────────────────
// GET /api/admin/email?userId=n  — for a specific user
// GET /api/admin/email           — all mailboxes across all users
router.get('/', async (req, res) => {
  try {
    const { userId } = req.query;
    const result = userId
      ? await query(
          `SELECT mu.id, mu.email, mu.quota, mu.spam_filter_enabled, mu.spam_score_threshold,
                  mu.spam_action, mu.is_catchall, md.domain_name, u.username as owner
           FROM mail_users mu
           JOIN mail_domains md ON mu.domain_id = md.id
           JOIN users u ON md.user_id = u.id
           WHERE md.user_id = $1
           ORDER BY mu.email ASC`,
          [userId]
        )
      : await query(
          `SELECT mu.id, mu.email, mu.quota, mu.spam_filter_enabled, mu.spam_score_threshold,
                  mu.spam_action, mu.is_catchall, md.domain_name, u.username as owner
           FROM mail_users mu
           JOIN mail_domains md ON mu.domain_id = md.id
           JOIN users u ON md.user_id = u.id
           ORDER BY u.username ASC, mu.email ASC`
        );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

// ── List domains available for a user (for mailbox creation) ───────────────────
router.get('/domains', async (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ message: 'userId is required' });
  try {
    const result = await query(
      'SELECT id, domain_name FROM domains WHERE user_id = $1 ORDER BY domain_name ASC',
      [userId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

// ── Create mailbox ─────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const { userId, domainId, localPart, password, quota = 1024 } = req.body;
  if (!userId || !domainId || !localPart || !password)
    return res.status(400).json({ message: 'userId, domainId, localPart, and password are required' });

  try {
    const domainRes = await query(
      'SELECT domain_name FROM domains WHERE id = $1 AND user_id = $2',
      [domainId, userId]
    );
    if (domainRes.rows.length === 0)
      return res.status(404).json({ message: 'Domain not found or does not belong to user' });

    const domainName = domainRes.rows[0].domain_name as string;
    const fullEmail  = `${localPart}@${domainName}`;

    // Ensure mail_domain row exists
    let mailDomainId: number;
    const existingMd = await query('SELECT id FROM mail_domains WHERE domain_name = $1', [domainName]);
    if (existingMd.rows.length === 0) {
      const ins = await query(
        'INSERT INTO mail_domains (domain_name, user_id) VALUES ($1, $2) RETURNING id',
        [domainName, userId]
      );
      mailDomainId = ins.rows[0].id as number;
    } else {
      mailDomainId = existingMd.rows[0].id as number;
    }

    const hash = await generateDovecotPassword(password as string);
    const result = await query(
      'INSERT INTO mail_users (domain_id, email, password_hash, quota) VALUES ($1, $2, $3, $4) RETURNING id, email, quota',
      [mailDomainId, fullEmail, hash, quota]
    );

    // Provision Maildir + DNS + mail server config
    await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)',
      ['PROVISION_MAILBOX', { email: fullEmail }]);
    await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)',
      ['GENERATE_EMAIL_DNS', { domainId, domainName }]);
    await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)',
      ['CONFIGURE_MAIL_SERVER', {}]);

    res.status(201).json(result.rows[0]);
  } catch (err: any) {
    if (err.code === '23505') return res.status(400).json({ message: 'Email address already exists' });
    res.status(500).json({ message: (err as Error).message });
  }
});

// ── Update mailbox settings ─────────────────────────────────────────────────────
router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const { quota, spamFilterEnabled, spamScoreThreshold, spamAction } = req.body;
  if (spamAction !== undefined && !['quarantine', 'tag', 'deliver'].includes(spamAction)) {
    return res.status(400).json({ message: 'spamAction must be quarantine, tag, or deliver' });
  }
  try {
    const r = await query(
      `UPDATE mail_users
       SET quota               = COALESCE($1, quota),
           spam_filter_enabled = COALESCE($2, spam_filter_enabled),
           spam_score_threshold= COALESCE($3, spam_score_threshold),
           spam_action         = COALESCE($4, spam_action)
       WHERE id = $5
       RETURNING *`,
      [quota ?? null, spamFilterEnabled ?? null, spamScoreThreshold ?? null, spamAction ?? null, id]
    );
    if (r.rows.length === 0) return res.status(404).json({ message: 'Mailbox not found' });

    if (quota !== undefined) {
      await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)',
        ['APPLY_EMAIL_QUOTA', { email: r.rows[0].email }]);
    }

    if (spamFilterEnabled !== undefined || spamScoreThreshold !== undefined || spamAction !== undefined) {
      await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)',
        ['SYNC_SPAM_RULES', { mailUserId: parseInt(id, 10) }]);
    }

    res.json(r.rows[0]);
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

// ── Change password ────────────────────────────────────────────────────────────
router.patch('/:id/password', async (req, res) => {
  const { id } = req.params;
  const { password } = req.body;
  if (!password || typeof password !== 'string' || password.length < 8)
    return res.status(400).json({ message: 'Password must be at least 8 characters' });
  try {
    const mailboxRes = await query('SELECT id FROM mail_users WHERE id = $1', [id]);
    if (mailboxRes.rows.length === 0) return res.status(404).json({ message: 'Mailbox not found' });

    const passwordHash = await generateDovecotPassword(password);
    await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)',
      ['CHANGE_EMAIL_PASSWORD', { mailUserId: parseInt(id as string, 10), passwordHash }]);

    res.json({ message: 'Password change queued' });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

// ── Delete mailbox ─────────────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const r = await query('SELECT email FROM mail_users WHERE id = $1', [id]);
    if (r.rows.length === 0) return res.status(404).json({ message: 'Mailbox not found' });

    await query('DELETE FROM mail_users WHERE id = $1', [id]);
    res.json({ message: 'Mailbox deleted' });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

// ── List forwarders ────────────────────────────────────────────────────────────
router.get('/forwarders', async (req, res) => {
  const { userId } = req.query;
  try {
    const result = userId
      ? await query(
          `SELECT mf.*, md.domain_name, u.username as owner
           FROM mail_forwarders mf
           JOIN mail_domains md ON mf.domain_id = md.id
           JOIN users u ON md.user_id = u.id
           WHERE md.user_id = $1
           ORDER BY mf.source ASC`,
          [userId]
        )
      : await query(
          `SELECT mf.*, md.domain_name, u.username as owner
           FROM mail_forwarders mf
           JOIN mail_domains md ON mf.domain_id = md.id
           JOIN users u ON md.user_id = u.id
           ORDER BY u.username ASC, mf.source ASC`
        );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

export default router;
