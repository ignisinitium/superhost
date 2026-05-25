import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../db.js';
import { authenticateClient } from '../middleware/auth.js';
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
    const result = await query('SELECT * FROM users WHERE username = $1', [username]);
    if (result.rows.length === 0) {
      await logLoginAttempt(ip, username, false);
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const user = result.rows[0];
    if (!user.password_hash) {
      return res.status(401).json({ message: 'Account not set up for login. Contact support.' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      await logLoginAttempt(ip, username, false);
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Success
    await logLoginAttempt(ip, username, true);

    const token = jwt.sign({ id: user.id, role: 'client' }, getJwtSecret(), { expiresIn: '8h' });
    res.json({ token, user: { id: user.id, username: user.username, email: user.email } });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

router.get('/profile', authenticateClient, async (req: AuthRequest, res) => {
  try {
    const result = await query('SELECT id, username, email, disk_limit_mb, disk_used_mb, bandwidth_limit_mb, bandwidth_used_mb FROM users WHERE id = $1', [req.userId]);
    if (result.rows.length === 0) return res.status(404).json({ message: 'User not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

router.put('/profile', authenticateClient, async (req: AuthRequest, res) => {
  const { email, password } = req.body;
  try {
    if (password) {
      const passwordHash = await bcrypt.hash(password, 10);
      await query('UPDATE users SET email = $1, password_hash = $2 WHERE id = $3', [email, passwordHash, req.userId]);
    } else {
      await query('UPDATE users SET email = $1 WHERE id = $2', [email, req.userId]);
    }
    
    const result = await query('SELECT id, username, email, disk_limit_mb, disk_used_mb, bandwidth_limit_mb, bandwidth_used_mb FROM users WHERE id = $1', [req.userId]);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

export default router;
