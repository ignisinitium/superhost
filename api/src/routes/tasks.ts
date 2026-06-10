import express from 'express';
import { query } from '../db.js';
import { authenticateAdmin } from '../middleware/auth.js';
import { redactTask } from '../redact.js';

const router = express.Router();

router.use(authenticateAdmin);

router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await query('SELECT * FROM tasks WHERE id = $1', [id]);
    if (result.rows.length === 0) return res.status(404).json({ message: 'Task not found' });
    res.json(redactTask(result.rows[0]));
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

router.get('/recent', async (req, res) => {
  try {
    const result = await query('SELECT * FROM tasks ORDER BY created_at DESC LIMIT 10');
    res.json(result.rows.map(redactTask));
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

export default router;
