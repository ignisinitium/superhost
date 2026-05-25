import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import { query } from '../db.js';
import { authenticateAdmin } from '../middleware/auth.js';
import type { AuthRequest } from '../middleware/auth.js';
import { checkIpBlock, logLoginAttempt } from '../middleware/rateLimiter.js';

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('FATAL: JWT_SECRET is not set');
  return secret;
}

const router = express.Router();

router.post('/login', checkIpBlock, async (req, res) => {
  const { username, password } = req.body;
  const ip = req.ip || req.socket.remoteAddress || 'unknown';

  try {
    const result = await query('SELECT * FROM admins WHERE username = $1', [username]);
    if (result.rows.length === 0) {
      await logLoginAttempt(ip, username, false);
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const admin = result.rows[0];
    const isMatch = await bcrypt.compare(password, admin.password_hash);

    if (!isMatch) {
      await logLoginAttempt(ip, username, false);
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Success
    await logLoginAttempt(ip, username, true);

    if (admin.two_factor_enabled) {
      return res.json({ require2FA: true, adminId: admin.id });
    }

    const token = jwt.sign({ id: admin.id, role: 'admin' }, getJwtSecret(), { expiresIn: '8h' });
    res.json({ token, admin: { id: admin.id, username: admin.username } });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

router.post('/verify-2fa', async (req, res) => {
  const { adminId, token } = req.body;

  try {
    const result = await query('SELECT * FROM admins WHERE id = $1', [adminId]);
    if (result.rows.length === 0) return res.status(401).json({ message: 'Invalid admin' });

    const admin = result.rows[0];
    const verified = speakeasy.totp.verify({
      secret: admin.two_factor_secret,
      encoding: 'base32',
      token
    });

    if (!verified) return res.status(401).json({ message: 'Invalid 2FA token' });

    const jwtToken = jwt.sign({ id: admin.id, role: 'admin' }, getJwtSecret(), { expiresIn: '8h' });
    res.json({ token: jwtToken, admin: { id: admin.id, username: admin.username } });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

router.post('/setup-2fa', authenticateAdmin, async (req: AuthRequest, res) => {
  const secret = speakeasy.generateSecret({ name: `Superhost (${req.adminId})` });
  
  try {
    await query('UPDATE admins SET two_factor_secret = $1 WHERE id = $2', [secret.base32, req.adminId]);
    const qrCodeDataUrl = await QRCode.toDataURL(secret.otpauth_url || '');
    res.json({ secret: secret.base32, qrCode: qrCodeDataUrl });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

router.post('/enable-2fa', authenticateAdmin, async (req: AuthRequest, res) => {
  const { token } = req.body;

  try {
    const result = await query('SELECT * FROM admins WHERE id = $1', [req.adminId]);
    const admin = result.rows[0];

    const verified = speakeasy.totp.verify({
      secret: admin.two_factor_secret,
      encoding: 'base32',
      token
    });

    if (!verified) return res.status(401).json({ message: 'Invalid 2FA token' });

    await query('UPDATE admins SET two_factor_enabled = TRUE WHERE id = $1', [req.adminId]);
    res.json({ message: '2FA enabled successfully' });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

router.get('/profile', authenticateAdmin, async (req: AuthRequest, res) => {
  try {
    const result = await query('SELECT id, username, email, two_factor_enabled FROM admins WHERE id = $1', [req.adminId]);
    if (result.rows.length === 0) return res.status(404).json({ message: 'Admin not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

router.put('/profile', authenticateAdmin, async (req: AuthRequest, res) => {
  const { email, password } = req.body;
  try {
    if (password) {
      const passwordHash = await bcrypt.hash(password, 10);
      await query('UPDATE admins SET email = $1, password_hash = $2 WHERE id = $3', [email, passwordHash, req.adminId]);
    } else {
      await query('UPDATE admins SET email = $1 WHERE id = $2', [email, req.adminId]);
    }
    
    const result = await query('SELECT id, username, email, two_factor_enabled FROM admins WHERE id = $1', [req.adminId]);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

export default router;
