import express from 'express';
import { query } from '../db.js';
import { authenticateAdmin } from '../middleware/auth.js';
const router = express.Router();
router.use(authenticateAdmin);
// Get all FTP accounts for all users
router.get('/', async (req, res) => {
    try {
        const result = await query(`
      SELECT f.*, u.username as owner_username 
      FROM ftp_accounts f 
      JOIN users u ON f.user_id = u.id 
      ORDER BY f.created_at DESC
    `);
        res.json(result.rows);
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
// Delete any FTP account
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const jobRes = await query(`
      SELECT f.ftp_username, u.username as owner_username 
      FROM ftp_accounts f 
      JOIN users u ON f.user_id = u.id 
      WHERE f.id = $1
    `, [id]);
        if (jobRes.rowCount === 0)
            return res.status(404).json({ message: 'FTP account not found' });
        const { owner_username } = jobRes.rows[0];
        await query('DELETE FROM ftp_accounts WHERE id = $1', [id]);
        // Trigger worker task to sync FTP config
        await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)', ['SYNC_FTP', { username: owner_username }]);
        res.json({ message: 'FTP account deleted' });
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
export default router;
//# sourceMappingURL=adminFtp.js.map