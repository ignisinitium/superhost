import express from 'express';
import { query } from '../db.js';
import { authenticateAdmin } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticateAdmin);

// GET /api/admin/nameservers/settings
// Returns NS1, NS2, master domain, server IP, and BIND9 service status
router.get('/settings', async (_req, res) => {
  try {
    const result = await query("SELECT key, value FROM server_settings WHERE key IN ('ns1','ns2','master_domain','server_ip')");
    const settings: Record<string, string> = {};
    for (const row of result.rows) settings[row.key] = row.value;

    // Also queue a task to get live BIND status
    const taskRes = await query(
      "INSERT INTO tasks (command, payload) VALUES ('GET_BIND_STATUS', '{}') RETURNING id"
    );
    res.json({ settings, taskId: taskRes.rows[0].id });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

// PUT /api/admin/nameservers/settings
// Update NS1, NS2, master domain, server IP
router.put('/settings', async (req, res) => {
  const { ns1, ns2, master_domain, server_ip } = req.body as Record<string, string>;
  const updates: [string, string][] = [];
  if (ns1)          updates.push(['ns1', ns1]);
  if (ns2)          updates.push(['ns2', ns2]);
  if (master_domain) updates.push(['master_domain', master_domain]);
  if (server_ip)    updates.push(['server_ip', server_ip]);

  if (updates.length === 0) return res.status(400).json({ message: 'No fields to update' });

  try {
    for (const [key, value] of updates) {
      await query(
        "INSERT INTO server_settings (key, value, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=NOW()",
        [key, value]
      );
    }
    res.json({ message: 'Settings updated' });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

// POST /api/admin/nameservers/bind/:action
// Control BIND9: start | stop | restart | reload
router.post('/bind/:action', async (req, res) => {
  const { action } = req.params;
  const allowed = ['start', 'stop', 'restart', 'reload'];
  if (!allowed.includes(action)) return res.status(400).json({ message: 'Invalid action' });

  try {
    const taskRes = await query(
      "INSERT INTO tasks (command, payload) VALUES ('MANAGE_BIND', $1) RETURNING id",
      [JSON.stringify({ action })]
    );
    res.json({ taskId: taskRes.rows[0].id });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

// GET /api/admin/nameservers/zones
// Returns all zones in named.conf.zones + DB zone list with record counts
router.get('/zones', async (_req, res) => {
  try {
    const result = await query(`
      SELECT z.id, z.domain_name, z.ttl, z.created_at,
             u.username,
             COUNT(r.id)::int AS record_count
      FROM dns_zones z
      LEFT JOIN users u ON z.user_id = u.id
      LEFT JOIN dns_records r ON r.zone_id = z.id
      GROUP BY z.id, u.username
      ORDER BY z.domain_name ASC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

export default router;
