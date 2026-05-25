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