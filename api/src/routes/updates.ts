import express from 'express';
import { query } from '../db.js';
import { authenticateAdmin } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateAdmin);

router.get('/', async (req, res) => {
  try {
    const taskRes = await query(
      'INSERT INTO tasks (command, payload) VALUES ($1, $2) RETURNING id',
      ['GET_UPDATES', {}]
    );
    res.json({ taskId: taskRes.rows[0].id });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

router.post('/install', async (req, res) => {
  try {
    const taskRes = await query(
      'INSERT INTO tasks (command, payload) VALUES ($1, $2) RETURNING id',
      ['INSTALL_UPDATES', {}]
    );
    res.json({ taskId: taskRes.rows[0].id });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

router.post('/auto', async (req, res) => {
  const { enabled } = req.body;
  try {
    const taskRes = await query(
      'INSERT INTO tasks (command, payload) VALUES ($1, $2) RETURNING id',
      ['MANAGE_AUTO_UPDATES', { enabled }]
    );
    res.json({ taskId: taskRes.rows[0].id });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

export default router;
