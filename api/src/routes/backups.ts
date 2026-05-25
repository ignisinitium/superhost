import express from 'express';
import path from 'path';
import { query } from '../db.js';
import { authenticateClient } from '../middleware/auth.js';
import type { AuthRequest } from '../middleware/auth.js';
import fs from 'fs';

const router = express.Router();

router.use(authenticateClient);

// Backups are always stored under this directory — enforce it on download
const BACKUP_BASE_DIR = '/home';

router.get('/', async (req: AuthRequest, res) => {
  try {
    const result = await query('SELECT * FROM backups WHERE user_id = $1 ORDER BY created_at DESC', [req.userId]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

router.post('/', async (req: AuthRequest, res) => {
  const userId = req.userId!;

  try {
    const userRes = await query('SELECT username FROM users WHERE id = $1', [userId]);
    if (userRes.rows.length === 0) return res.status(404).json({ message: 'User not found' });
    const username = userRes.rows[0].username;

    // 1. Create a pending backup record
    const backupRes = await query(
      'INSERT INTO backups (user_id, type) VALUES ($1, $2) RETURNING id',
      [userId, 'full_account']
    );
    const backupId = backupRes.rows[0].id;

    // 2. Queue worker task
    await query(
      'INSERT INTO tasks (command, payload) VALUES ($1, $2)',
      ['CREATE_BACKUP', { userId, username, backupId }]
    );

    res.json({ message: 'Backup generation queued.', backupId });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

router.get('/:id/download', async (req: AuthRequest, res) => {
  const { id } = req.params;
  const userId = req.userId!;

  try {
    const result = await query(
      'SELECT file_path FROM backups WHERE id = $1 AND user_id = $2 AND status = $3',
      [id, userId, 'completed']
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Backup not found or not ready' });
    }

    const filePath = result.rows[0].file_path as string;

    // Validate that the path is an absolute path within the expected base directory
    // This prevents IDOR-via-DB-manipulation attacks
    const normalized = path.normalize(filePath);
    if (!normalized.startsWith(BACKUP_BASE_DIR + '/') || normalized.includes('..')) {
      console.error(`Suspicious backup path blocked: ${filePath} for user ${userId}`);
      return res.status(403).json({ message: 'Invalid backup path' });
    }

    if (!fs.existsSync(normalized)) {
      return res.status(404).json({ message: 'Backup file missing from server' });
    }

    res.download(normalized);
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

router.post('/:id/restore', async (req: AuthRequest, res) => {
  const { id } = req.params;
  const userId = req.userId!;

  try {
    const userRes = await query('SELECT username FROM users WHERE id = $1', [userId]);
    if (userRes.rows.length === 0) return res.status(404).json({ message: 'User not found' });
    const username = userRes.rows[0].username;

    const result = await query(
      'SELECT id FROM backups WHERE id = $1 AND user_id = $2 AND status = $3',
      [id, userId, 'completed']
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Backup not found or not ready' });
    }

    // Queue worker task
    await query(
      'INSERT INTO tasks (command, payload) VALUES ($1, $2)',
      ['RESTORE_BACKUP', { userId, username, backupId: id }]
    );

    res.json({ message: 'Backup restoration queued.' });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

export default router;
