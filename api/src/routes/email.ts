import express from 'express';
import { query } from '../db.js';
import { authenticateClient } from '../middleware/auth.js';
import type { AuthRequest } from '../middleware/auth.js';
import crypto from 'crypto';

const router = express.Router();

router.use(authenticateClient);

// Note: In Dovecot/Postfix setups, passwords often use a specific hashing scheme like SHA512-CRYPT
// For simplicity in this implementation, we will use Dovecot's native password generation via system exec
// Alternatively, we can use standard bcrypt if Dovecot is configured for it (we set default_pass_scheme = CRYPT).
// We'll use a basic crypt hash here using Node's crypto module (though bcrypt is better if configured).
// Let's assume Dovecot is configured to accept SHA-512 crypt.

function generateDovecotPassword(plainPassword: string): string {
  // A simple fallback for SHA-512 crypt. In a real system, you might use doveadm pw -s SHA512-CRYPT
  // or a proper bcrypt library if Dovecot is configured for BLF-CRYPT.
  // For demonstration, we'll construct a basic salted SHA512 hash that Dovecot's CRYPT scheme can read, 
  // or simply use MD5-CRYPT which is built into glibc crypt().
  const salt = crypto.randomBytes(8).toString('hex');
  // Node's native crypt is not exposed directly. 
  // The best approach without relying on `doveadm pw` exec is to use a standard format Dovecot accepts.
  // Since we set default_pass_scheme = CRYPT, we can actually use standard bcrypt or SHA512-CRYPT if generated correctly.
  // To avoid complex external dependencies, we'll store it as plain text and let the worker hash it, 
  // OR we can just use the standard bcrypt library since Dovecot supports `{BLF-CRYPT}`.
  
  // Let's use bcrypt and prefix it so Dovecot knows the scheme!
  return plainPassword; // We'll handle hashing in the worker or a better utility later.
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

    // 3. Queue a worker task to handle the actual password hashing and creation
    // We delegate to the worker so it can use `doveadm pw` for perfect compatibility,
    // or just handle the system-level directory structures if needed.
    // For now, we will just insert it into the DB directly with a basic prefix.
    
    // We will use bcrypt for compatibility and prefix it with {BLF-CRYPT}
    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash(password, 10);
    const dovecotHash = `{BLF-CRYPT}${hash}`;

    const result = await query(
      'INSERT INTO mail_users (domain_id, email, password_hash, quota) VALUES ($1, $2, $3, $4) RETURNING id, email, quota',
      [mailDomainId, fullEmail, dovecotHash, quota]
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

export default router;
