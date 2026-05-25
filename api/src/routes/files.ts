import express from 'express';
import { query } from '../db.js';
import { authenticateClient } from '../middleware/auth.js';
import type { AuthRequest } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateClient);

router.get('/list', async (req: AuthRequest, res) => {
  const { path = '' } = req.query;
  try {
    const userRes = await query('SELECT username FROM users WHERE id = $1', [req.userId]);
    const username = userRes.rows[0].username;

    const taskRes = await query(
      'INSERT INTO tasks (command, payload) VALUES ($1, $2) RETURNING id',
      ['LIST_FILES', { username, path }]
    );
    res.json({ taskId: taskRes.rows[0].id });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

router.get('/read', async (req: AuthRequest, res) => {
  const { filePath } = req.query;
  try {
    const userRes = await query('SELECT username FROM users WHERE id = $1', [req.userId]);
    const username = userRes.rows[0].username;

    const taskRes = await query(
      'INSERT INTO tasks (command, payload) VALUES ($1, $2) RETURNING id',
      ['READ_FILE_CONTENT', { username, filePath }]
    );
    res.json({ taskId: taskRes.rows[0].id });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

router.post('/write', async (req: AuthRequest, res) => {
  const { filePath, content } = req.body;
  try {
    const userRes = await query('SELECT username FROM users WHERE id = $1', [req.userId]);
    const username = userRes.rows[0].username;

    const taskRes = await query(
      'INSERT INTO tasks (command, payload) VALUES ($1, $2) RETURNING id',
      ['WRITE_FILE_CONTENT', { username, filePath, content }]
    );
    res.json({ taskId: taskRes.rows[0].id });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

router.delete('/delete', async (req: AuthRequest, res) => {
  const { filePath } = req.query;
  try {
    const userRes = await query('SELECT username FROM users WHERE id = $1', [req.userId]);
    const username = userRes.rows[0].username;

    const taskRes = await query(
      'INSERT INTO tasks (command, payload) VALUES ($1, $2) RETURNING id',
      ['DELETE_FILE', { username, filePath }]
    );
    res.json({ taskId: taskRes.rows[0].id });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

export default router;
