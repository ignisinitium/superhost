import express from 'express';
import { query } from '../db.js';
import { authenticateClient } from '../middleware/auth.js';
import type { AuthRequest } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateClient);

// Get all DNS zones for the current user
router.get('/zones', async (req: AuthRequest, res) => {
  try {
    const result = await query('SELECT * FROM dns_zones WHERE user_id = $1 ORDER BY domain_name ASC', [req.userId]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

// Get all records for a specific zone
router.get('/zones/:zoneId/records', async (req: AuthRequest, res) => {
  const { zoneId } = req.params;
  try {
    // 1. Verify ownership
    const zoneRes = await query('SELECT id FROM dns_zones WHERE id = $1 AND user_id = $2', [zoneId, req.userId]);
    if (zoneRes.rowCount === 0) return res.status(404).json({ message: 'Zone not found' });

    // 2. Get records
    const result = await query('SELECT * FROM dns_records WHERE zone_id = $1 ORDER BY type ASC, name ASC', [zoneId]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

// Add a record to a zone
router.post('/zones/:zoneId/records', async (req: AuthRequest, res) => {
  const { zoneId } = req.params;
  const { name, type, content, priority, ttl } = req.body;
  try {
    // 1. Verify ownership
    const zoneRes = await query('SELECT id, domain_name FROM dns_zones WHERE id = $1 AND user_id = $2', [zoneId, req.userId]);
    if (zoneRes.rowCount === 0) return res.status(404).json({ message: 'Zone not found' });
    const { domain_name } = zoneRes.rows[0];

    // 2. Insert record
    const result = await query(
      'INSERT INTO dns_records (zone_id, name, type, content, priority, ttl) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [zoneId, name, type.toUpperCase(), content, priority || null, ttl || null]
    );

    // 3. Trigger worker to sync zone
    await query(
      'INSERT INTO tasks (command, payload) VALUES ($1, $2)',
      ['SYNC_DNS_ZONE', { zoneId, domainName: domain_name }]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

// Update a record
router.put('/zones/:zoneId/records/:recordId', async (req: AuthRequest, res) => {
  const { zoneId, recordId } = req.params;
  const { name, type, content, priority, ttl } = req.body;
  try {
    // 1. Verify ownership
    const zoneRes = await query('SELECT id, domain_name FROM dns_zones WHERE id = $1 AND user_id = $2', [zoneId, req.userId]);
    if (zoneRes.rowCount === 0) return res.status(404).json({ message: 'Zone not found' });
    const { domain_name } = zoneRes.rows[0];

    // 2. Update record
    const result = await query(
      'UPDATE dns_records SET name = $1, type = $2, content = $3, priority = $4, ttl = $5 WHERE id = $6 AND zone_id = $7 RETURNING *',
      [name, type.toUpperCase(), content, priority || null, ttl || null, recordId, zoneId]
    );

    if (result.rowCount === 0) return res.status(404).json({ message: 'Record not found' });

    // 3. Trigger worker to sync zone
    await query(
      'INSERT INTO tasks (command, payload) VALUES ($1, $2)',
      ['SYNC_DNS_ZONE', { zoneId, domainName: domain_name }]
    );

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

// Delete a record
router.delete('/zones/:zoneId/records/:recordId', async (req: AuthRequest, res) => {
  const { zoneId, recordId } = req.params;
  try {
    // 1. Verify ownership
    const zoneRes = await query('SELECT id, domain_name FROM dns_zones WHERE id = $1 AND user_id = $2', [zoneId, req.userId]);
    if (zoneRes.rowCount === 0) return res.status(404).json({ message: 'Zone not found' });
    const { domain_name } = zoneRes.rows[0];

    // 2. Delete record
    const result = await query('DELETE FROM dns_records WHERE id = $1 AND zone_id = $2 RETURNING id', [recordId, zoneId]);
    if (result.rowCount === 0) return res.status(404).json({ message: 'Record not found' });

    // 3. Trigger worker to sync zone
    await query(
      'INSERT INTO tasks (command, payload) VALUES ($1, $2)',
      ['SYNC_DNS_ZONE', { zoneId, domainName: domain_name }]
    );

    res.json({ message: 'DNS record deleted' });
  } catch (err) {
    res.status(500).json({ message: (err as Error).message });
  }
});

export default router;
