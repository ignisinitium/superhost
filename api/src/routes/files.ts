import express from 'express';
import path from 'path';
import { query } from '../db.js';
import { authenticateClient } from '../middleware/auth.js';
import type { AuthRequest } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateClient);

/**
 * Validates that a client-supplied path stays within their public_html directory.
 * Rejects any path containing ".." after normalization.
 * Note: symlink resolution happens in the worker via fs.realpath().
 */
function sanitizeFilePath(inputPath: unknown, username: string): string {
  if (typeof inputPath !== 'string') throw new Error('Path must be a string');
  if (inputPath.length > 4096) throw new Error('Path too long');

  const normalized = path.normalize(inputPath);

  // Reject traversal sequences
  if (normalized.includes('..') || normalized.startsWith('/')) {
    throw new Error('Invalid path: path traversal not allowed');
  }

  // Reject null bytes and shell metacharacters
  if (/[\x00;&|`$<>(){}[\]!]/.test(normalized)) {
    throw new Error('Invalid path: contains disallowed characters');
  }

  return normalized;
}

router.get('/list', async (req: AuthRequest, res) => {
  const { path: inputPath = '' } = req.query;
  try {
    const userRes = await query('SELECT username FROM users WHERE id = $1', [req.userId]);
    if (userRes.rows.length === 0) return res.status(404).json({ message: 'User not found' });
    const username = userRes.rows[0].username;

    const safePath = sanitizeFilePath(inputPath, username);

    const taskRes = await query(
      'INSERT INTO tasks (command, payload) VALUES ($1, $2) RETURNING id',
      ['LIST_FILES', { username, path: safePath }]
    );
    res.json({ taskId: taskRes.rows[0].id });
  } catch (err) {
    res.status(400).json({ message: (err as Error).message });
  }
});

router.get('/read', async (req: AuthRequest, res) => {
  const { filePath: inputPath } = req.query;
  try {
    const userRes = await query('SELECT username FROM users WHERE id = $1', [req.userId]);
    if (userRes.rows.length === 0) return res.status(404).json({ message: 'User not found' });
    const username = userRes.rows[0].username;

    const safePath = sanitizeFilePath(inputPath, username);

    const taskRes = await query(
      'INSERT INTO tasks (command, payload) VALUES ($1, $2) RETURNING id',
      ['READ_FILE_CONTENT', { username, filePath: safePath }]
    );
    res.json({ taskId: taskRes.rows[0].id });
  } catch (err) {
    res.status(400).json({ message: (err as Error).message });
  }
});

router.post('/write', async (req: AuthRequest, res) => {
  const { filePath: inputPath, content } = req.body;
  try {
    const userRes = await query('SELECT username FROM users WHERE id = $1', [req.userId]);
    if (userRes.rows.length === 0) return res.status(404).json({ message: 'User not found' });
    const username = userRes.rows[0].username;

    const safePath = sanitizeFilePath(inputPath, username);

    if (typeof content !== 'string') return res.status(400).json({ message: 'Content must be a string' });
    if (content.length > 10 * 1024 * 1024) return res.status(413).json({ message: 'File content too large (max 10 MB)' });

    const taskRes = await query(
      'INSERT INTO tasks (command, payload) VALUES ($1, $2) RETURNING id',
      ['WRITE_FILE_CONTENT', { username, filePath: safePath, content }]
    );
    res.json({ taskId: taskRes.rows[0].id });
  } catch (err) {
    res.status(400).json({ message: (err as Error).message });
  }
});

router.delete('/delete', async (req: AuthRequest, res) => {
  const { filePath: inputPath } = req.query;
  try {
    const userRes = await query('SELECT username FROM users WHERE id = $1', [req.userId]);
    if (userRes.rows.length === 0) return res.status(404).json({ message: 'User not found' });
    const username = userRes.rows[0].username;

    const safePath = sanitizeFilePath(inputPath, username);

    const taskRes = await query(
      'INSERT INTO tasks (command, payload) VALUES ($1, $2) RETURNING id',
      ['DELETE_FILE', { username, filePath: safePath }]
    );
    res.json({ taskId: taskRes.rows[0].id });
  } catch (err) {
    res.status(400).json({ message: (err as Error).message });
  }
});

export default router;
