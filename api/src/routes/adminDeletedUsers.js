import express from 'express';
import { query } from '../db.js';
import { authenticateAdmin } from '../middleware/auth.js';
const router = express.Router();
router.use(authenticateAdmin);
router.get('/', async (_req, res) => {
    try {
        const result = await query(`SELECT id, username, email, original_user_id, archive_path,
              archive_size_bytes, deleted_at,
              metadata->'domains' AS domains,
              jsonb_array_length(COALESCE(metadata->'domains', '[]'::jsonb)) AS domain_count,
              jsonb_array_length(COALESCE(metadata->'databases', '[]'::jsonb)) AS database_count,
              jsonb_array_length(COALESCE(metadata->'dns_zones', '[]'::jsonb)) AS dns_zone_count,
              jsonb_array_length(COALESCE(metadata->'mail_users', '[]'::jsonb)) AS mail_user_count
       FROM deleted_users
       ORDER BY deleted_at DESC`);
        res.json(result.rows);
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
router.post('/:id/restore', async (req, res) => {
    const { id } = req.params;
    try {
        const deletedRes = await query('SELECT id, username FROM deleted_users WHERE id = $1', [id]);
        if (deletedRes.rows.length === 0)
            return res.status(404).json({ message: 'Deleted user not found' });
        const taskRes = await query('INSERT INTO tasks (command, payload) VALUES ($1, $2) RETURNING id', ['RESTORE_USER', { deletedUserId: parseInt(id) }]);
        res.json({ message: `Restore of ${deletedRes.rows[0].username} queued`, taskId: taskRes.rows[0].id });
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const deletedRes = await query('SELECT archive_path FROM deleted_users WHERE id = $1', [id]);
        if (deletedRes.rows.length === 0)
            return res.status(404).json({ message: 'Deleted user not found' });
        // Queue archive file removal via a task so the worker (root) can delete it
        await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)', ['PURGE_USER_ARCHIVE', { deletedUserId: parseInt(id), archivePath: deletedRes.rows[0].archive_path }]);
        res.json({ message: 'Archive purge queued' });
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
export default router;
//# sourceMappingURL=adminDeletedUsers.js.map