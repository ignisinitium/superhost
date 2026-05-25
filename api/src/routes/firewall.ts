import express from 'express';
import { query } from '../db.js';
import { authenticateAdmin } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateAdmin);

router.get('/status', async (req, res) => {
  try {
    // We'll use a task to get the status from the worker since it needs root
    const taskRes = await query(
      'INSERT INTO tasks (command, payload) VALUES ($1, $2) RETURNING id',
      ['GET_FIREWALL_STATUS', {}]
    );
    
    // In a real app, we'd wait for the task or use a websocket. 
    // For now, we'll just return the task ID or a placeholder.
    res.json({ taskId: taskRes.rows[0].id, message: 'Fetching firewall status...' });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

router.post('/allow', async (req, res) => {
  const { port, protocol } = req.body;
  try {
    await query(
      'INSERT INTO tasks (command, payload) VALUES ($1, $2)',
      ['FIREWALL_ALLOW', { port, protocol: protocol || 'tcp' }]
    );
    res.json({ message: `Task created to allow port ${port}` });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

router.post('/delete', async (req, res) => {
  const { ruleNumber } = req.body;
  try {
    const taskRes = await query(
      'INSERT INTO tasks (command, payload) VALUES ($1, $2) RETURNING id',
      ['FIREWALL_DELETE', { ruleNumber }]
    );
    res.json({ taskId: taskRes.rows[0].id, message: `Task created to delete firewall rule #${ruleNumber}` });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

export default router;
