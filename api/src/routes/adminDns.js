import express from 'express';
import { query } from '../db.js';
import { authenticateAdmin } from '../middleware/auth.js';
const router = express.Router();
router.use(authenticateAdmin);
// Get all DNS zones for all users
router.get('/zones', async (req, res) => {
    try {
        const result = await query(`
      SELECT z.*, u.username 
      FROM dns_zones z 
      LEFT JOIN users u ON z.user_id = u.id 
      ORDER BY z.domain_name ASC
    `);
        res.json(result.rows);
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
// Get all records for any zone (admin — no user restriction)
router.get('/zones/:id/records', async (req, res) => {
    const { id } = req.params;
    try {
        const zoneRes = await query('SELECT id FROM dns_zones WHERE id = $1', [id]);
        if (zoneRes.rowCount === 0)
            return res.status(404).json({ message: 'Zone not found' });
        const result = await query('SELECT * FROM dns_records WHERE zone_id = $1 ORDER BY type ASC, name ASC', [id]);
        res.json(result.rows);
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
// Add a record to any zone (admin)
router.post('/zones/:id/records', async (req, res) => {
    const { id } = req.params;
    const { name, type, content, priority, ttl } = req.body;
    try {
        const zoneRes = await query('SELECT id, domain_name FROM dns_zones WHERE id = $1', [id]);
        if (zoneRes.rowCount === 0)
            return res.status(404).json({ message: 'Zone not found' });
        const { domain_name } = zoneRes.rows[0];
        const result = await query('INSERT INTO dns_records (zone_id, name, type, content, priority, ttl) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *', [id, name, type.toUpperCase(), content, priority ?? null, ttl ?? null]);
        await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)', ['SYNC_DNS_ZONE', { zoneId: id, domainName: domain_name }]);
        res.status(201).json(result.rows[0]);
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
// Update a record in any zone (admin)
router.put('/zones/:id/records/:recordId', async (req, res) => {
    const { id, recordId } = req.params;
    const { name, type, content, priority, ttl } = req.body;
    try {
        const zoneRes = await query('SELECT id, domain_name FROM dns_zones WHERE id = $1', [id]);
        if (zoneRes.rowCount === 0)
            return res.status(404).json({ message: 'Zone not found' });
        const { domain_name } = zoneRes.rows[0];
        const result = await query('UPDATE dns_records SET name=$1, type=$2, content=$3, priority=$4, ttl=$5 WHERE id=$6 AND zone_id=$7 RETURNING *', [name, type.toUpperCase(), content, priority ?? null, ttl ?? null, recordId, id]);
        if (result.rowCount === 0)
            return res.status(404).json({ message: 'Record not found' });
        await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)', ['SYNC_DNS_ZONE', { zoneId: id, domainName: domain_name }]);
        res.json(result.rows[0]);
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
// Delete a record from any zone (admin)
router.delete('/zones/:id/records/:recordId', async (req, res) => {
    const { id, recordId } = req.params;
    try {
        const zoneRes = await query('SELECT id, domain_name FROM dns_zones WHERE id = $1', [id]);
        if (zoneRes.rowCount === 0)
            return res.status(404).json({ message: 'Zone not found' });
        const { domain_name } = zoneRes.rows[0];
        const result = await query('DELETE FROM dns_records WHERE id=$1 AND zone_id=$2 RETURNING id', [recordId, id]);
        if (result.rowCount === 0)
            return res.status(404).json({ message: 'Record not found' });
        await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)', ['SYNC_DNS_ZONE', { zoneId: id, domainName: domain_name }]);
        res.json({ message: 'Record deleted' });
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
// Delete any DNS zone
router.delete('/zones/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const zoneRes = await query('SELECT domain_name FROM dns_zones WHERE id = $1', [id]);
        if (zoneRes.rowCount === 0)
            return res.status(404).json({ message: 'Zone not found' });
        const { domain_name } = zoneRes.rows[0];
        await query('DELETE FROM dns_zones WHERE id = $1', [id]);
        // Trigger worker to remove zone (if applicable) or just sync
        await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)', ['REMOVE_DNS_ZONE', { domainName: domain_name }]);
        res.json({ message: 'DNS zone deleted' });
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
// Manual zone creation for admins
router.post('/zones', async (req, res) => {
    const { userId, domainName, ttl } = req.body;
    try {
        const result = await query('INSERT INTO dns_zones (user_id, domain_name, ttl) VALUES ($1, $2, $3) RETURNING *', [userId || null, domainName, ttl || 3600]);
        await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)', ['SYNC_DNS_ZONE', { zoneId: result.rows[0].id, domainName }]);
        res.status(201).json(result.rows[0]);
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
export default router;
//# sourceMappingURL=adminDns.js.map