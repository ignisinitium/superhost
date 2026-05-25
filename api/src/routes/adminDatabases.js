import express from 'express';
import { query } from '../db.js';
import { authenticateAdmin } from '../middleware/auth.js';
const router = express.Router();
router.use(authenticateAdmin);
router.get('/', async (req, res) => {
    try {
        const result = await query(`
      SELECT d.*, u.username as owner_name 
      FROM databases d
      JOIN users u ON d.user_id = u.id
      ORDER BY d.created_at DESC
    `);
        res.json(result.rows);
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const dbRes = await query('SELECT db_name, db_user FROM databases WHERE id = $1', [id]);
        if (dbRes.rows.length === 0)
            return res.status(404).json({ message: 'Database not found' });
        const { db_name, db_user } = dbRes.rows[0];
        // 1. Delete from PostgreSQL
        await query('DELETE FROM databases WHERE id = $1', [id]);
        // 2. Create worker task to actually drop from MariaDB
        await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)', ['DELETE_DATABASE', { dbName: db_name, dbUser: db_user }]);
        res.json({ message: 'Database deletion task queued' });
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
export default router;
//# sourceMappingURL=adminDatabases.js.map