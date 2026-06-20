import express from 'express';
import { query } from '../db.js';
import { authenticateAdmin } from '../middleware/auth.js';
import type { AuthRequest } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateAdmin);

// Get all DNS zones for all users
router.get('/zones', async (req: AuthRequest, res) => {
  try {
    const result = await query(`
      SELECT z.*, u.username 
      FROM dns_zones z 
      LEFT JOIN users u ON z.user_id = u.id 
      ORDER BY z.domain_name ASC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

// Get all records for any zone (admin — no user restriction)
router.get('/zones/:id/records', async (req: AuthRequest, res) => {
  const { id } = req.params;
  try {
    const zoneRes = await query('SELECT id FROM dns_zones WHERE id = $1', [id]);
    if (zoneRes.rowCount === 0) return res.status(404).json({ message: 'Zone not found' });
    const result = await query('SELECT * FROM dns_records WHERE zone_id = $1 ORDER BY type ASC, name ASC', [id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

// Add a record to any zone (admin)
router.post('/zones/:id/records', async (req: AuthRequest, res) => {
  const { id } = req.params;
  const { name, type, content, priority, ttl } = req.body;
  try {
    const zoneRes = await query('SELECT id, domain_name FROM dns_zones WHERE id = $1', [id]);
    if (zoneRes.rowCount === 0) return res.status(404).json({ message: 'Zone not found' });
    const { domain_name } = zoneRes.rows[0];

    const result = await query(
      'INSERT INTO dns_records (zone_id, name, type, content, priority, ttl) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [id, name, type.toUpperCase(), content, priority ?? null, ttl ?? null]
    );
    await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)', ['SYNC_DNS_ZONE', { zoneId: id, domainName: domain_name }]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

// Bulk-add records to any zone (admin) — used by the template/preset feature.
// Inserts all records atomically and queues a single zone sync.
router.post('/zones/:id/records/bulk', async (req: AuthRequest, res) => {
  const { id } = req.params;
  const { records } = req.body as {
    records?: Array<{ name: string; type: string; content: string; priority?: number | null; ttl?: number | null }>;
  };

  if (!Array.isArray(records) || records.length === 0) {
    return res.status(400).json({ message: 'records must be a non-empty array' });
  }
  if (records.length > 100) {
    return res.status(400).json({ message: 'Too many records in one batch (max 100)' });
  }
  for (const r of records) {
    if (!r || typeof r.name !== 'string' || typeof r.type !== 'string' || typeof r.content !== 'string') {
      return res.status(400).json({ message: 'Each record requires name, type and content' });
    }
  }

  try {
    const zoneRes = await query('SELECT id, domain_name FROM dns_zones WHERE id = $1', [id]);
    if (zoneRes.rowCount === 0) return res.status(404).json({ message: 'Zone not found' });
    const { domain_name } = zoneRes.rows[0];

    // Build a parameterized multi-row INSERT (6 columns per row).
    const values: unknown[] = [];
    const tuples = records.map((r, i) => {
      const b = i * 6;
      values.push(id, r.name || '@', r.type.toUpperCase(), r.content, r.priority ?? null, r.ttl ?? null);
      return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6})`;
    });

    const result = await query(
      `INSERT INTO dns_records (zone_id, name, type, content, priority, ttl) VALUES ${tuples.join(', ')} RETURNING *`,
      values
    );
    await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)', ['SYNC_DNS_ZONE', { zoneId: id, domainName: domain_name }]);
    res.status(201).json(result.rows);
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

// Recent sync history/status for a zone (admin) — surfaces BIND apply success/failure.
router.get('/zones/:id/sync-status', async (req: AuthRequest, res) => {
  const { id } = req.params;
  try {
    const result = await query(
      `SELECT id, command, status, error_message, created_at, updated_at
       FROM tasks
       WHERE command = 'SYNC_DNS_ZONE' AND payload->>'zoneId' = $1
       ORDER BY id DESC
       LIMIT 10`,
      [String(id)]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

// Update a record in any zone (admin)
router.put('/zones/:id/records/:recordId', async (req: AuthRequest, res) => {
  const { id, recordId } = req.params;
  const { name, type, content, priority, ttl } = req.body;
  try {
    const zoneRes = await query('SELECT id, domain_name FROM dns_zones WHERE id = $1', [id]);
    if (zoneRes.rowCount === 0) return res.status(404).json({ message: 'Zone not found' });
    const { domain_name } = zoneRes.rows[0];

    const result = await query(
      'UPDATE dns_records SET name=$1, type=$2, content=$3, priority=$4, ttl=$5 WHERE id=$6 AND zone_id=$7 RETURNING *',
      [name, type.toUpperCase(), content, priority ?? null, ttl ?? null, recordId, id]
    );
    if (result.rowCount === 0) return res.status(404).json({ message: 'Record not found' });
    await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)', ['SYNC_DNS_ZONE', { zoneId: id, domainName: domain_name }]);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

// Delete a record from any zone (admin)
router.delete('/zones/:id/records/:recordId', async (req: AuthRequest, res) => {
  const { id, recordId } = req.params;
  try {
    const zoneRes = await query('SELECT id, domain_name FROM dns_zones WHERE id = $1', [id]);
    if (zoneRes.rowCount === 0) return res.status(404).json({ message: 'Zone not found' });
    const { domain_name } = zoneRes.rows[0];

    const result = await query('DELETE FROM dns_records WHERE id=$1 AND zone_id=$2 RETURNING id', [recordId, id]);
    if (result.rowCount === 0) return res.status(404).json({ message: 'Record not found' });
    await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)', ['SYNC_DNS_ZONE', { zoneId: id, domainName: domain_name }]);
    res.json({ message: 'Record deleted' });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

// Delete any DNS zone
router.delete('/zones/:id', async (req: AuthRequest, res) => {
  const { id } = req.params;
  try {
    const zoneRes = await query('SELECT domain_name FROM dns_zones WHERE id = $1', [id]);
    if (zoneRes.rowCount === 0) return res.status(404).json({ message: 'Zone not found' });
    const { domain_name } = zoneRes.rows[0];

    await query('DELETE FROM dns_zones WHERE id = $1', [id]);

    // Trigger worker to remove zone (if applicable) or just sync
    await query(
      'INSERT INTO tasks (command, payload) VALUES ($1, $2)',
      ['REMOVE_DNS_ZONE', { domainName: domain_name }]
    );

    res.json({ message: 'DNS zone deleted' });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

// Manual zone creation for admins
router.post('/zones', async (req: AuthRequest, res) => {
  const { userId, domainName, ttl } = req.body;
  try {
    const result = await query(
      'INSERT INTO dns_zones (user_id, domain_name, ttl) VALUES ($1, $2, $3) RETURNING *',
      [userId || null, domainName, ttl || 3600]
    );

    await query(
      'INSERT INTO tasks (command, payload) VALUES ($1, $2)',
      ['SYNC_DNS_ZONE', { zoneId: result.rows[0].id, domainName }]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

export default router;
