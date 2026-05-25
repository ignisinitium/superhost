import express from 'express';
import { query } from '../db.js';
import { authenticateAdmin } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateAdmin);

router.get('/status', async (req, res) => {
  try {
    const taskRes = await query(
      'INSERT INTO tasks (command, payload) VALUES ($1, $2) RETURNING id',
      ['GET_SERVICES_STATUS', {}]
    );
    res.json({ taskId: taskRes.rows[0].id });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

router.post('/manage', async (req, res) => {
  const { service, action } = req.body;
  try {
    const taskRes = await query(
      'INSERT INTO tasks (command, payload) VALUES ($1, $2) RETURNING id',
      ['MANAGE_SERVICE', { service, action }]
    );
    res.json({ taskId: taskRes.rows[0].id });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

export default router;
