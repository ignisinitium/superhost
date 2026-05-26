import express from 'express';
import { query } from '../db.js';
import { authenticateAdmin } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticateAdmin);

// POST /api/admin/system/reboot — schedule an immediate server reboot
router.post('/reboot', async (_req, res) => {
  try {
    const taskRes = await query(
      "INSERT INTO tasks (command, payload) VALUES ($1, $2) RETURNING id",
      ['REBOOT_SERVER', {}]
    );
    res.json({ taskId: taskRes.rows[0].id });
  } catch (err) {
    console.error('Failed to queue reboot:', err);
    res.status(500).json({ error: 'Failed to queue reboot' });
  }
});

// POST /api/admin/system/restart-web — restart nginx + all active php-fpm instances
router.post('/restart-web', async (_req, res) => {
  try {
    const taskRes = await query(
      "INSERT INTO tasks (command, payload) VALUES ($1, $2) RETURNING id",
      ['RESTART_WEB_SERVICES', {}]
    );
    res.json({ taskId: taskRes.rows[0].id });
  } catch (err) {
    console.error('Failed to queue web restart:', err);
    res.status(500).json({ error: 'Failed to queue web restart' });
  }
});

// POST /api/admin/system/exec — run a root shell command (root terminal)
router.post('/exec', async (req, res) => {
  const { command } = req.body as { command?: string };
  if (!command || typeof command !== 'string' || !command.trim()) {
    res.status(400).json({ error: 'command is required' });
    return;
  }
  if (command.trim().length > 500) {
    res.status(400).json({ error: 'Command too long (max 500 chars)' });
    return;
  }
  try {
    const taskRes = await query(
      "INSERT INTO tasks (command, payload) VALUES ($1, $2) RETURNING id",
      ['EXEC_COMMAND', { command: command.trim() }]
    );
    res.json({ taskId: taskRes.rows[0].id });
  } catch (err) {
    console.error('Failed to queue exec command:', err);
    res.status(500).json({ error: 'Failed to queue command' });
  }
});

// POST /api/admin/system/backup — trigger a system configuration backup
router.post('/backup', async (_req, res) => {
  try {
    const taskRes = await query(
      "INSERT INTO tasks (command, payload) VALUES ($1, $2) RETURNING id",
      ['ADMIN_BACKUP', {}]
    );
    res.json({ taskId: taskRes.rows[0].id });
  } catch (err) {
    console.error('Failed to queue admin backup:', err);
    res.status(500).json({ error: 'Failed to queue backup' });
  }
});

export default router;
