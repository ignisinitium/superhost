import express from 'express';
import { query } from '../db.js';
import { authenticateAdmin } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateAdmin);

router.get('/scans', async (req, res) => {
  try {
    const result = await query(`
      SELECT ms.id, ms.scan_path, ms.status, ms.infections_found, ms.created_at, ms.completed_at, u.username
      FROM malware_scans ms
      JOIN users u ON ms.user_id = u.id
      ORDER BY ms.created_at DESC
      LIMIT 100
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

router.post('/scan', async (req, res) => {
  const { userId } = req.body;

  try {
    const userRes = await query('SELECT username FROM users WHERE id = $1', [userId]);
    if (userRes.rows.length === 0) return res.status(404).json({ message: 'User not found' });
    const username = userRes.rows[0].username;

    const taskRes = await query(
      'INSERT INTO tasks (command, payload) VALUES ($1, $2) RETURNING id',
      ['SCAN_MALWARE', { userId, username }]
    );

    res.json({ taskId: taskRes.rows[0].id, message: `Malware scan queued for ${username}` });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

// --- IP BLOCKLIST MANAGEMENT ---

router.get('/blocked-ips', async (req, res) => {
  try {
    const result = await query('SELECT * FROM blocked_ips ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

router.post('/block-ip', async (req, res) => {
  const { ipAddress, reason } = req.body;
  try {
    await query(
      'INSERT INTO blocked_ips (ip_address, reason) VALUES ($1, $2) ON CONFLICT (ip_address) DO UPDATE SET reason = $2',
      [ipAddress, reason || 'Manual block by administrator']
    );

    await query(
      'INSERT INTO tasks (command, payload) VALUES ($1, $2)',
      ['FIREWALL_BLOCK_IP', { ipAddress }]
    );

    res.json({ message: `IP ${ipAddress} blocked successfully` });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

router.post('/unblock-ip', async (req, res) => {
  const { ipAddress } = req.body;
  try {
    await query('DELETE FROM blocked_ips WHERE ip_address = $1', [ipAddress]);

    await query(
      'INSERT INTO tasks (command, payload) VALUES ($1, $2)',
      ['FIREWALL_UNBLOCK_IP', { ipAddress }]
    );

    res.json({ message: `IP ${ipAddress} unblocked successfully` });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

export default router;
