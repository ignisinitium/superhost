import express from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { query } from '../db.js';
import { authenticateAdmin } from '../middleware/auth.js';
import type { User } from '../../../shared/types.js';

const router = express.Router();

router.use(authenticateAdmin);

router.get('/', async (_req, res) => {
  try {
    const result = await query(`
      SELECT u.*, p.name AS package_name, p.type AS package_type
      FROM users u
      LEFT JOIN products p ON p.id = u.package_id
      ORDER BY u.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

const USERNAME_RE = /^[a-z_][a-z0-9_-]{0,31}$/;

router.post('/', async (req, res) => {
  const { username, email, password, disk_limit_mb, bandwidth_limit_mb, package_id } = req.body;

  if (!username || !USERNAME_RE.test(username)) {
    res.status(400).json({ message: 'Invalid username. Must start with a lowercase letter or underscore, contain only lowercase letters, numbers, hyphens, or underscores, and be at most 32 characters.' });
    return;
  }

  try {
    // Resolve conflicts with active users and archived (deleted) usernames.
    // If the requested name is taken, append a random 3-digit hex suffix and retry.
    let finalUsername = username;
    for (let attempt = 0; attempt < 10; attempt++) {
      const conflict = await query(
        `SELECT 1 FROM users WHERE username = $1
         UNION ALL
         SELECT 1 FROM deleted_users WHERE username = $1
         LIMIT 1`,
        [finalUsername]
      );
      if (conflict.rows.length === 0) break;
      const base   = username.slice(0, 28); // leave room for _xxx suffix
      const suffix = crypto.randomBytes(2).toString('hex').slice(0, 3);
      finalUsername = `${base}_${suffix}`;
    }

    const homeDir     = `/home/${finalUsername}`;
    const passwordHash = password ? await bcrypt.hash(password, 10) : null;

    const result = await query(
      `INSERT INTO users
         (username, email, home_dir, password_hash, disk_limit_mb, bandwidth_limit_mb, package_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [finalUsername, email, homeDir, passwordHash,
       disk_limit_mb || 1024, bandwidth_limit_mb || 5120,
       package_id ?? null]
    );
    const user: User = result.rows[0];

    await query(
      'INSERT INTO tasks (command, payload) VALUES ($1, $2)',
      ['CREATE_USER', { username: finalUsername }]
    );

    res.status(201).json(user);
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await query(`
      SELECT u.*, p.name AS package_name, p.type AS package_type,
             p.disk_quota_mb, p.bandwidth_gb, p.email_accounts, p.databases_allowed,
             p.domains_allowed, p.ssh_access, p.ssl_included, p.spam_filter,
             p.price_cents, p.billing_cycle
      FROM users u
      LEFT JOIN products p ON p.id = u.package_id
      WHERE u.id = $1
    `, [id]);
    if (result.rows.length === 0) return res.status(404).json({ message: 'User not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { email, password, disk_limit_mb, bandwidth_limit_mb, package_id } = req.body;

  try {
    let result;
    if (password) {
      const passwordHash = await bcrypt.hash(password, 10);
      result = await query(
        `UPDATE users SET email=$1, password_hash=$2, disk_limit_mb=$3,
          bandwidth_limit_mb=$4, package_id=$5
         WHERE id=$6 RETURNING *`,
        [email, passwordHash, disk_limit_mb, bandwidth_limit_mb,
         package_id ?? null, id]
      );
    } else {
      result = await query(
        `UPDATE users SET email=$1, disk_limit_mb=$2,
          bandwidth_limit_mb=$3, package_id=$4
         WHERE id=$5 RETURNING *`,
        [email, disk_limit_mb, bandwidth_limit_mb,
         package_id ?? null, id]
      );
    }

    if (result.rows.length === 0) return res.status(404).json({ message: 'User not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const userRes = await query('SELECT id, username, email FROM users WHERE id = $1', [id]);
    if (userRes.rows.length === 0) return res.status(404).json({ message: 'User not found' });

    const taskRes = await query(
      'INSERT INTO tasks (command, payload) VALUES ($1, $2) RETURNING id',
      ['ARCHIVE_AND_DELETE_USER', { userId: parseInt(id) }]
    );

    res.json({ message: 'User archival and deletion queued', taskId: taskRes.rows[0].id });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

export default router;
