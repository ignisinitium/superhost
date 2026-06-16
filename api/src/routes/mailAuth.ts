import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { spawn } from 'child_process';
import { query } from '../db.js';
import { checkIpBlock, logLoginAttempt } from '../middleware/rateLimiter.js';

const router = express.Router();

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('FATAL: JWT_SECRET not set');
  return secret;
}

// Recompute a crypt(3) hash with the stored salt (password fed via stdin, never
// argv). Used for migrated mailboxes whose passwords are MD5/SHA-256/SHA-512-crypt.
function opensslCrypt(flag: string, salt: string, password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn('openssl', ['passwd', flag, '-salt', salt, '-stdin']);
    let out = '', err = '';
    p.stdout.on('data', d => out += d.toString());
    p.stderr.on('data', d => err += d.toString());
    p.on('error', reject);
    p.on('close', code => code === 0 ? resolve(out.trim()) : reject(new Error(err || `openssl exit ${code}`)));
    p.stdin.write(password); p.stdin.end();
  });
}

// Verify a password against a Dovecot-style hash of any scheme. Migrated CWP
// mailboxes use {SHA512-CRYPT}/{SHA256-CRYPT}/{MD5-CRYPT}; panel-created ones
// use {BLF-CRYPT} (bcrypt). Mirrors what Dovecot accepts for IMAP/SMTP.
async function verifyMailPassword(password: string, stored: string): Promise<boolean> {
  if (!stored) return false;
  const raw = stored.replace(/^\{[^}]+\}/, '');
  if (/^\$2[aby]?\$/.test(raw)) {
    return bcrypt.compare(password, raw).catch(() => false);
  }
  const m = raw.match(/^\$([156])\$([^$]{1,16})\$/);
  if (m) {
    const flag = m[1] === '6' ? '-6' : m[1] === '5' ? '-5' : '-1';
    try {
      const computed = await opensslCrypt(flag, m[2]!, password);
      return computed.length === raw.length && computed === raw;
    } catch { return false; }
  }
  if (/^\{(PLAIN|CLEARTEXT)\}/i.test(stored)) return password === raw;
  return false;
}

router.post('/login', checkIpBlock, async (req, res) => {
  const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  try {
    const muRes = await query(`
      SELECT mu.id, mu.password_hash, md.user_id
      FROM mail_users mu
      JOIN mail_domains md ON mu.domain_id = md.id
      WHERE mu.email = $1
    `, [email.toLowerCase().trim()]);

    if (muRes.rowCount === 0) {
      await logLoginAttempt(ip, email, false);
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const mu = muRes.rows[0];
    const match = await verifyMailPassword(password, mu.password_hash as string);
    if (!match) {
      await logLoginAttempt(ip, email, false);
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    await logLoginAttempt(ip, email, true);

    const token = jwt.sign(
      { id: mu.user_id, role: 'mail_user', mailUserId: mu.id },
      getJwtSecret(),
      { expiresIn: '24h' }
    );

    res.json({ token, email });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

export default router;
