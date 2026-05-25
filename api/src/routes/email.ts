import express from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db.js';
import { authenticateClient } from '../middleware/auth.js';
import type { AuthRequest } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateClient);

// Email local part validation: RFC 5321 safe subset
const EMAIL_LOCAL_RE = /^[a-zA-Z0-9._%+\-]{1,64}$/;

/**
 * Generate a Dovecot-compatible password hash.
 * Uses {CRYPT} scheme with bcrypt ($2y$), which Dovecot recognises when
 * default_pass_scheme = CRYPT is set (the default on most distros).
 * The $2y$ prefix is the PHP/Dovecot-compatible bcrypt variant.
 */
async function generateDovecotPassword(plainPassword: string): Promise<string> {
  if (!plainPassword || plainPassword.length < 8) {
    throw new Error('Password must be at least 8 characters');
  }
  // bcryptjs generates $2a$ prefix; Dovecot accepts both $2a$ and $2y$
  const hash = await bcrypt.hash(plainPassword, 12);
  // Use {BF-CRYPT} — the correct Dovecot scheme name for bcrypt
  return `{BF-CRYPT}${hash}`;
}

router.get('/', async (req: AuthRequest, res) => {
  try {
    // Get all email accounts for domains owned by this user
    const result = await query(`
      SELECT mu.id, mu.email, md.domain_name, mu.quota 
      FROM mail_users mu
      JOIN mail_domains md ON mu.domain_id = md.id
      WHERE md.user_id = $1
      ORDER BY mu.email ASC
    `, [req.userId]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

router.post('/', async (req: AuthRequest, res) => {
  const { localPart, domainId, password, quota = 1024 } = req.body;
  const userId = req.userId!;

  try {
    // Validate email local part format before anything else
    if (!localPart || !EMAIL_LOCAL_RE.test(localPart)) {
      return res.status(400).json({ message: 'Invalid email local part. Use letters, numbers, dots, hyphens, and underscores only (max 64 chars).' });
    }

    if (!password || typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }

    const quotaNum = parseInt(quota);
    if (!Number.isInteger(quotaNum) || quotaNum < 100 || quotaNum > 102400) {
      return res.status(400).json({ message: 'Quota must be between 100 MB and 100 GB' });
    }

    // 1. Verify the domain belongs to the user
    const domainRes = await query('SELECT id, domain_name FROM domains WHERE id = $1 AND user_id = $2', [domainId, userId]);
    if (domainRes.rows.length === 0) {
      return res.status(403).json({ message: 'Domain not found or access denied' });
    }
    const domainName = domainRes.rows[0].domain_name;
    const fullEmail = `${localPart}@${domainName}`;

    // 2. Ensure the mail_domain exists in the mail_domains table
    let mailDomainId;
    const existingMailDomain = await query('SELECT id FROM mail_domains WHERE domain_name = $1', [domainName]);

    if (existingMailDomain.rows.length === 0) {
      const insertDomainRes = await query(
        'INSERT INTO mail_domains (domain_name, user_id) VALUES ($1, $2) RETURNING id',
        [domainName, userId]
      );
      mailDomainId = insertDomainRes.rows[0].id;
    } else {
      mailDomainId = existingMailDomain.rows[0].id;
    }

    // 3. Hash password with correct Dovecot scheme
    const dovecotHash = await generateDovecotPassword(password);

    const result = await query(
      'INSERT INTO mail_users (domain_id, email, password_hash, quota) VALUES ($1, $2, $3, $4) RETURNING id, email, quota',
      [mailDomainId, fullEmail, dovecotHash, quotaNum]
    );

    // 4. Trigger DNS record generation for email security
    await query(
      'INSERT INTO tasks (command, payload) VALUES ($1, $2)',
      ['GENERATE_EMAIL_DNS', { domainId: domainId, domainName }]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    if ((err as any).code === '23505') { // Unique violation
      return res.status(400).json({ message: 'Email address already exists' });
    }
    res.status(500).json({ message: (err as Error).message });
  }
});

router.delete('/:id', async (req: AuthRequest, res) => {
  const { id } = req.params;
  const userId = req.userId!;

  try {
    // Verify ownership via the join
    const verifyRes = await query(`
      SELECT mu.id 
      FROM mail_users mu
      JOIN mail_domains md ON mu.domain_id = md.id
      WHERE mu.id = $1 AND md.user_id = $2
    `, [id, userId]);

    if (verifyRes.rows.length === 0) {
      return res.status(403).json({ message: 'Email account not found or access denied' });
    }

    await query('DELETE FROM mail_users WHERE id = $1', [id]);
    res.json({ message: 'Email account deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

// Update Email Account (Quota, Spam Filter)
router.patch('/:id', async (req: AuthRequest, res) => {
  const { id } = req.params;
  const { quota, spamFilterEnabled } = req.body;
  const userId = req.userId!;

  try {
    const verifyRes = await query(`
      SELECT mu.id 
      FROM mail_users mu
      JOIN mail_domains md ON mu.domain_id = md.id
      WHERE mu.id = $1 AND md.user_id = $2
    `, [id, userId]);

    if (verifyRes.rows.length === 0) return res.status(403).json({ message: 'Access denied' });

    const result = await query(`
      UPDATE mail_users 
      SET quota = COALESCE($1, quota), 
          spam_filter_enabled = COALESCE($2, spam_filter_enabled)
      WHERE id = $3
      RETURNING *
    `, [quota, spamFilterEnabled, id]);

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

// --- Forwarders ---

router.get('/forwarders', async (req: AuthRequest, res) => {
  try {
    const result = await query(`
      SELECT mf.*, md.domain_name 
      FROM mail_forwarders mf
      JOIN mail_domains md ON mf.domain_id = md.id
      WHERE md.user_id = $1
      ORDER BY mf.source ASC
    `, [req.userId]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

router.post('/forwarders', async (req: AuthRequest, res) => {
  const { source, destination, domainId } = req.body;
  const userId = req.userId!;

  try {
    const domainRes = await query('SELECT domain_name FROM domains WHERE id = $1 AND user_id = $2', [domainId, userId]);
    if (domainRes.rows.length === 0) return res.status(403).json({ message: 'Domain not found' });
    
    const domainName = domainRes.rows[0].domain_name;
    const fullSource = source.includes('@') ? source : `${source}@${domainName}`;

    const result = await query(
      'INSERT INTO mail_forwarders (domain_id, source, destination) VALUES ($1, $2, $3) RETURNING *',
      [domainId, fullSource, destination]
    );

    // Trigger worker to ensure Postfix maps are configured
    await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)', ['CONFIGURE_MAIL_SERVER', {}]);

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

router.delete('/forwarders/:id', async (req: AuthRequest, res) => {
  const { id } = req.params;
  try {
    const verifyRes = await query(`
      SELECT mf.id FROM mail_forwarders mf
      JOIN mail_domains md ON mf.domain_id = md.id
      WHERE mf.id = $1 AND md.user_id = $2
    `, [id, req.userId]);

    if (verifyRes.rows.length === 0) return res.status(403).json({ message: 'Access denied' });

    await query('DELETE FROM mail_forwarders WHERE id = $1', [id]);
    
    // Trigger worker to ensure Postfix maps are configured
    await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)', ['CONFIGURE_MAIL_SERVER', {}]);

    res.json({ message: 'Forwarder deleted' });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

// --- Auto-responders ---

router.get('/:mailUserId/autoresponder', async (req: AuthRequest, res) => {
  const { mailUserId } = req.params;
  try {
    const result = await query(`
      SELECT ma.* FROM mail_autoresponders ma
      JOIN mail_users mu ON ma.mail_user_id = mu.id
      JOIN mail_domains md ON mu.domain_id = md.id
      WHERE mu.id = $1 AND md.user_id = $2
    `, [mailUserId, req.userId]);
    
    res.json(result.rows[0] || { message: '', enabled: false });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

router.post('/:mailUserId/autoresponder', async (req: AuthRequest, res) => {
  const { mailUserId } = req.params;
  const { message, enabled } = req.body;
  try {
    const verifyRes = await query(`
      SELECT mu.id FROM mail_users mu
      JOIN mail_domains md ON mu.domain_id = md.id
      WHERE mu.id = $1 AND md.user_id = $2
    `, [mailUserId, req.userId]);

    if (verifyRes.rows.length === 0) return res.status(403).json({ message: 'Access denied' });

    const result = await query(`
      INSERT INTO mail_autoresponders (mail_user_id, message, enabled)
      VALUES ($1, $2, $3)
      ON CONFLICT (mail_user_id) DO UPDATE 
      SET message = EXCLUDED.message, enabled = EXCLUDED.enabled
      RETURNING *
    `, [mailUserId, message, enabled]);

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

// --- Spam Quarantine & Access Control ---

// Get quarantined emails for a user
router.get('/:mailUserId/quarantine', async (req: AuthRequest, res) => {
  const { mailUserId } = req.params;
  try {
    const verifyRes = await query(`
      SELECT mu.id FROM mail_users mu
      JOIN mail_domains md ON mu.domain_id = md.id
      WHERE mu.id = $1 AND md.user_id = $2
    `, [mailUserId, req.userId]);

    if (verifyRes.rowCount === 0) return res.status(403).json({ message: 'Access denied' });

    const result = await query('SELECT * FROM mail_quarantine WHERE mail_user_id = $1 ORDER BY created_at DESC', [mailUserId]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

// Release email from quarantine (Deliver)
router.post('/quarantine/:id/release', async (req: AuthRequest, res) => {
  const { id } = req.params;
  try {
    const qRes = await query(`
      SELECT q.*, mu.email FROM mail_quarantine q
      JOIN mail_users mu ON q.mail_user_id = mu.id
      JOIN mail_domains md ON mu.domain_id = md.id
      WHERE q.id = $1 AND md.user_id = $2
    `, [id, req.userId]);

    if (qRes.rowCount === 0) return res.status(404).json({ message: 'Quarantined email not found' });

    const email = qRes.rows[0];

    // Trigger worker to deliver the file
    await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)', [
      'RELEASE_QUARANTINE', 
      { id, filePath: email.file_path, recipient: email.email }
    ]);

    res.json({ message: 'Email release task started' });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

// Delete quarantined email
router.delete('/quarantine/:id', async (req: AuthRequest, res) => {
  const { id } = req.params;
  try {
    const verifyRes = await query(`
      SELECT q.id, q.file_path FROM mail_quarantine q
      JOIN mail_users mu ON q.mail_user_id = mu.id
      JOIN mail_domains md ON mu.domain_id = md.id
      WHERE q.id = $1 AND md.user_id = $2
    `, [id, req.userId]);

    if (verifyRes.rowCount === 0) return res.status(403).json({ message: 'Access denied' });

    await query('DELETE FROM mail_quarantine WHERE id = $1', [id]);
    
    // Delete file via worker
    await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)', [
      'DELETE_FILE', 
      { filePath: verifyRes.rows[0].file_path }
    ]);

    res.json({ message: 'Quarantined email deleted' });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

// --- Whitelist / Blacklist ---

router.get('/:mailUserId/access-control', async (req: AuthRequest, res) => {
  const { mailUserId } = req.params;
  try {
    const verifyRes = await query(`
      SELECT mu.id FROM mail_users mu
      JOIN mail_domains md ON mu.domain_id = md.id
      WHERE mu.id = $1 AND md.user_id = $2
    `, [mailUserId, req.userId]);

    if (verifyRes.rowCount === 0) return res.status(403).json({ message: 'Access denied' });

    const result = await query('SELECT * FROM mail_access_control WHERE mail_user_id = $1 ORDER BY access_type DESC', [mailUserId]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

router.post('/:mailUserId/access-control', async (req: AuthRequest, res) => {
  const { mailUserId } = req.params;
  const { senderPattern, accessType } = req.body;
  try {
    const verifyRes = await query(`
      SELECT mu.id FROM mail_users mu
      JOIN mail_domains md ON mu.domain_id = md.id
      WHERE mu.id = $1 AND md.user_id = $2
    `, [mailUserId, req.userId]);

    if (verifyRes.rowCount === 0) return res.status(403).json({ message: 'Access denied' });

    const result = await query(`
      INSERT INTO mail_access_control (mail_user_id, sender_pattern, access_type)
      VALUES ($1, $2, $3)
      ON CONFLICT (mail_user_id, sender_pattern) DO UPDATE SET access_type = EXCLUDED.access_type
      RETURNING *
    `, [mailUserId, senderPattern, accessType]);

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

router.delete('/:mailUserId/access-control/:id', async (req: AuthRequest, res) => {
  const { mailUserId, id } = req.params;
  try {
    const verifyRes = await query(`
      SELECT mu.id FROM mail_users mu
      JOIN mail_domains md ON mu.domain_id = md.id
      WHERE mu.id = $1 AND md.user_id = $2
    `, [mailUserId, req.userId]);

    if (verifyRes.rowCount === 0) return res.status(403).json({ message: 'Access denied' });

    await query('DELETE FROM mail_access_control WHERE id = $1 AND mail_user_id = $2', [id, mailUserId]);
    res.json({ message: 'Access rule deleted' });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

export default router;
