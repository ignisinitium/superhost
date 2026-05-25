import express from 'express';
import { query } from '../db.js';
import { authenticateClient } from '../middleware/auth.js';
const router = express.Router();
router.use(authenticateClient);
router.get('/', async (req, res) => {
    try {
        const result = await query('SELECT * FROM user_cron_jobs WHERE user_id = $1 ORDER BY created_at DESC', [req.userId]);
        res.json(result.rows);
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
router.post('/', async (req, res) => {
    const { minute, hour, day, month, weekday, command, description } = req.body;
    try {
        const userRes = await query('SELECT username FROM users WHERE id = $1', [req.userId]);
        const username = userRes.rows[0].username;
        const result = await query('INSERT INTO user_cron_jobs (user_id, minute, hour, day, month, weekday, command, description) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *', [req.userId, minute || '*', hour || '*', day || '*', month || '*', weekday || '*', command, description]);
        // Get all cron jobs for this user to rebuild crontab
        const allJobs = await query('SELECT * FROM user_cron_jobs WHERE user_id = $1', [req.userId]);
        await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)', ['SYNC_CRONTAB', { username, jobs: allJobs.rows }]);
        res.status(201).json(result.rows[0]);
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const userRes = await query('SELECT username FROM users WHERE id = $1', [req.userId]);
        const username = userRes.rows[0].username;
        await query('DELETE FROM user_cron_jobs WHERE id = $1 AND user_id = $2', [id, req.userId]);
        // Rebuild crontab
        const allJobs = await query('SELECT * FROM user_cron_jobs WHERE user_id = $1', [req.userId]);
        await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)', ['SYNC_CRONTAB', { username, jobs: allJobs.rows }]);
        res.json({ message: 'Cron job deleted' });
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { minute, hour, day, month, weekday, command, description } = req.body;
    try {
        const userRes = await query('SELECT username FROM users WHERE id = $1', [req.userId]);
        const username = userRes.rows[0].username;
        const result = await query(`UPDATE user_cron_jobs 
       SET minute = $1, hour = $2, day = $3, month = $4, weekday = $5, command = $6, description = $7 
       WHERE id = $8 AND user_id = $9 RETURNING *`, [minute || '*', hour || '*', day || '*', month || '*', weekday || '*', command, description, id, req.userId]);
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Cron job not found' });
        }
        // Rebuild crontab
        const allJobs = await query('SELECT * FROM user_cron_jobs WHERE user_id = $1', [req.userId]);
        await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)', ['SYNC_CRONTAB', { username, jobs: allJobs.rows }]);
        res.json(result.rows[0]);
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
export default router;
//# sourceMappingURL=cron.js.map