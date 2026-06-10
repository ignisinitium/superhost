import express from 'express';
import { query } from '../db.js';
import { authenticateAdmin } from '../middleware/auth.js';
const router = express.Router();
router.use(authenticateAdmin);
// GET /api/admin/audit?action=&role=&limit=&offset=
router.get('/', async (req, res) => {
    try {
        const limit = Math.min(parseInt(String(req.query.limit ?? '100'), 10) || 100, 500);
        const offset = Math.max(parseInt(String(req.query.offset ?? '0'), 10) || 0, 0);
        const action = typeof req.query.action === 'string' && req.query.action ? req.query.action : null;
        const role = typeof req.query.role === 'string' && req.query.role ? req.query.role : null;
        const search = typeof req.query.search === 'string' && req.query.search.trim() ? `%${req.query.search.trim()}%` : null;
        const result = await query(`SELECT id, actor_id, actor_role, actor_name, action, target_type, target_id, ip_address, metadata, created_at
       FROM audit_log
       WHERE ($1::text IS NULL OR action = $1)
         AND ($2::text IS NULL OR actor_role = $2)
         AND ($3::text IS NULL OR action ILIKE $3 OR target_id ILIKE $3 OR actor_name ILIKE $3)
       ORDER BY created_at DESC
       LIMIT $4 OFFSET $5`, [action, role, search, limit, offset]);
        const countRes = await query('SELECT COUNT(*)::int AS total FROM audit_log');
        res.json({ entries: result.rows, total: countRes.rows[0]?.total ?? 0, limit, offset });
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
// GET /api/admin/audit/actions — distinct action names for filter dropdown
router.get('/actions', async (_req, res) => {
    try {
        const result = await query('SELECT DISTINCT action FROM audit_log ORDER BY action');
        res.json(result.rows.map((r) => r.action));
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
export default router;
//# sourceMappingURL=auditLog.js.map