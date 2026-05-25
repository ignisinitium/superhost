import express from 'express';
import { query } from '../db.js';
import { authenticateAdmin } from '../middleware/auth.js';
const router = express.Router();
router.use(authenticateAdmin);
router.get('/ips', async (req, res) => {
    try {
        const result = await query(`
      SELECT v.*, d.domain_name 
      FROM virtual_ips v 
      LEFT JOIN domains d ON v.assigned_domain_id = d.id 
      ORDER BY v.created_at DESC
    `);
        res.json(result.rows);
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
router.post('/ips', async (req, res) => {
    const { ipAddress, interfaceName } = req.body;
    try {
        // Save to DB
        const result = await query('INSERT INTO virtual_ips (ip_address, interface) VALUES ($1, $2) RETURNING *', [ipAddress, interfaceName || 'eth0:1']);
        // Tell worker to bring interface up
        await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)', ['ADD_VIRTUAL_IP', { ipAddress, interface: interfaceName || 'eth0:1' }]);
        res.status(201).json({ message: 'Virtual IP added and interface configuring', ip: result.rows[0] });
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
router.delete('/ips/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const ipRes = await query('SELECT ip_address, interface FROM virtual_ips WHERE id = $1', [id]);
        if (ipRes.rows.length === 0)
            return res.status(404).json({ message: 'IP not found' });
        const { ip_address, interface: iface } = ipRes.rows[0];
        // Remove from DB
        await query('DELETE FROM virtual_ips WHERE id = $1', [id]);
        // Tell worker to bring interface down
        await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)', ['REMOVE_VIRTUAL_IP', { ipAddress: ip_address, interface: iface }]);
        res.json({ message: 'Virtual IP deleted and interface spinning down' });
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
router.post('/ips/:id/assign', async (req, res) => {
    const { id } = req.params;
    const { domainId } = req.body; // if null, unassign
    try {
        const ipRes = await query('SELECT ip_address FROM virtual_ips WHERE id = $1', [id]);
        if (ipRes.rows.length === 0)
            return res.status(404).json({ message: 'IP not found' });
        const ipAddress = ipRes.rows[0].ip_address;
        let domainName = null;
        if (domainId) {
            const domainRes = await query('SELECT domain_name FROM domains WHERE id = $1', [domainId]);
            if (domainRes.rows.length === 0)
                return res.status(404).json({ message: 'Domain not found' });
            domainName = domainRes.rows[0].domain_name;
            await query('UPDATE virtual_ips SET is_allocated = true, assigned_domain_id = $1 WHERE id = $2', [domainId, id]);
        }
        else {
            // Unassigning
            const prevRes = await query('SELECT assigned_domain_id FROM virtual_ips WHERE id = $1', [id]);
            if (prevRes.rows[0].assigned_domain_id) {
                const prevDomainRes = await query('SELECT domain_name FROM domains WHERE id = $1', [prevRes.rows[0].assigned_domain_id]);
                domainName = prevDomainRes.rows.length > 0 ? prevDomainRes.rows[0].domain_name : null;
            }
            await query('UPDATE virtual_ips SET is_allocated = false, assigned_domain_id = NULL WHERE id = $1', [id]);
        }
        if (domainName) {
            // Tell worker to update nginx config for this domain
            await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)', ['ASSIGN_VIRTUAL_IP', { domainName, ipAddress: domainId ? ipAddress : null }]);
        }
        res.json({ message: 'IP assignment updated and Nginx reloading' });
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
export default router;
//# sourceMappingURL=network.js.map