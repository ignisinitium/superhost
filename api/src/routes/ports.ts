import express from 'express';
import { query } from '../db.js';
import { authenticateAdmin } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateAdmin);

router.post('/assign', async (req, res) => {
  const { userId, serviceName, domainId } = req.body;

  try {
    // Find next available port (starting from 10000)
    const portRes = await query('SELECT MAX(port) as max_port FROM user_ports');
    const nextPort = Math.max(10000, (portRes.rows[0].max_port || 9999) + 1);

    const result = await query(
      'INSERT INTO user_ports (user_id, port, service_name, domain_id) VALUES ($1, $2, $3, $4) RETURNING *',
      [userId, nextPort, serviceName, domainId]
    );

    // Create task for worker to setup reverse proxy and systemd service
    await query(
      'INSERT INTO tasks (command, payload) VALUES ($1, $2)',
      ['SETUP_CUSTOM_API', { userId, port: nextPort, serviceName, domainId }]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

router.get('/user/:userId', async (req, res) => {
  try {
    const result = await query('SELECT * FROM user_ports WHERE user_id = $1', [req.params.userId]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

export default router;
