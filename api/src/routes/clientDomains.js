import express from 'express';
import { query } from '../db.js';
import { authenticateClient } from '../middleware/auth.js';
const router = express.Router();
router.use(authenticateClient);
router.get('/', async (req, res) => {
    try {
        const result = await query('SELECT * FROM domains WHERE user_id = $1 ORDER BY created_at DESC', [req.userId]);
        res.json(result.rows);
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
// Clients can trigger SSL installation for their own domains
router.post('/:id/install-ssl', async (req, res) => {
    const { id } = req.params;
    try {
        const domainRes = await query('SELECT domain_name FROM domains WHERE id = $1 AND user_id = $2', [id, req.userId]);
        if (domainRes.rows.length === 0) {
            return res.status(404).json({ message: 'Domain not found or access denied' });
        }
        const { domain_name } = domainRes.rows[0];
        const taskRes = await query('INSERT INTO tasks (command, payload) VALUES ($1, $2) RETURNING id', ['INSTALL_SSL', { domainName: domain_name }]);
        res.json({ message: 'SSL installation task started', taskId: taskRes.rows[0].id });
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
export default router;
//# sourceMappingURL=clientDomains.js.map