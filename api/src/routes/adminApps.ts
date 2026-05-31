import express from 'express';
import { query } from '../db.js';
import { authenticateAdmin } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateAdmin);

router.get('/', async (req, res) => {
  try {
    const { userId } = req.query;
    const result = userId
      ? await query(
          `SELECT a.*, u.username, d.domain_name
           FROM user_apps a
           JOIN users u ON a.user_id = u.id
           JOIN domains d ON a.domain_id = d.id
           WHERE a.user_id = $1
           ORDER BY a.created_at DESC`,
          [userId]
        )
      : await query(
          `SELECT a.*, u.username, d.domain_name
           FROM user_apps a
           JOIN users u ON a.user_id = u.id
           JOIN domains d ON a.domain_id = d.id
           ORDER BY a.created_at DESC`
        );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

router.post('/:id/manage', async (req, res) => {
  const { id } = req.params;
  const { action } = req.body;
  if (!['start', 'stop', 'restart'].includes(action))
    return res.status(400).json({ message: 'action must be start, stop, or restart' });

  try {
    const appRes = await query(
      'SELECT a.*, u.username FROM user_apps a JOIN users u ON a.user_id = u.id WHERE a.id = $1',
      [id]
    );
    if (appRes.rows.length === 0) return res.status(404).json({ message: 'App not found' });
    const app = appRes.rows[0];

    const taskRes = await query(
      'INSERT INTO tasks (command, payload) VALUES ($1, $2) RETURNING id',
      ['MANAGE_APP_RUNTIME', { appId: app.id, username: app.username, action }]
    );

    res.json({ message: `App ${action} queued`, taskId: taskRes.rows[0].id });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const appRes = await query(
      `SELECT a.*, u.username, d.domain_name
       FROM user_apps a
       JOIN users u ON a.user_id = u.id
       JOIN domains d ON a.domain_id = d.id
       WHERE a.id = $1`,
      [id]
    );
    if (appRes.rows.length === 0) return res.status(404).json({ message: 'App not found' });
    const app = appRes.rows[0];

    await query('DELETE FROM user_apps WHERE id = $1', [id]);

    const taskRes = await query(
      'INSERT INTO tasks (command, payload) VALUES ($1, $2) RETURNING id',
      ['DELETE_APP_RUNTIME', { appId: app.id, username: app.username, domainName: app.domain_name }]
    );

    res.json({ message: 'App deletion queued', taskId: taskRes.rows[0].id });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

export default router;
