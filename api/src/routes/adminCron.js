import express from 'express';
import { query } from '../db.js';
import { authenticateAdmin } from '../middleware/auth.js';
const router = express.Router();
router.use(authenticateAdmin);
// Get all cron jobs for all users
router.get('/', async (req, res) => {
    try {
        const result = await query(`
      SELECT c.*, u.username 
      FROM user_cron_jobs c 
      LEFT JOIN users u ON c.user_id = u.id 
      ORDER BY c.created_at DESC
    `);
        res.json(result.rows);
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
// Get system cron jobs (root)
router.get('/system', async (req, res) => {
    try {
        const result = await query('SELECT * FROM user_cron_jobs WHERE user_id IS NULL ORDER BY created_at DESC');
        res.json(result.rows);
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
// Add a cron job (can be for a specific user or system if user_id is null)
router.post('/', async (req, res) => {
    const { userId, minute, hour, day, month, weekday, command, description } = req.body;
    try {
        let username = 'root';
        if (userId) {
            const userRes = await query('SELECT username FROM users WHERE id = $1', [userId]);
            if (userRes.rowCount === 0)
                return res.status(404).json({ message: 'User not found' });
            username = userRes.rows[0].username;
        }
        const result = await query('INSERT INTO user_cron_jobs (user_id, minute, hour, day, month, weekday, command, description) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *', [userId || null, minute || '*', hour || '*', day || '*', month || '*', weekday || '*', command, description]);
        // Sync crontab — fetch all jobs for this user (or all system jobs if userId is null)
        const allJobs = userId
            ? await query('SELECT * FROM user_cron_jobs WHERE user_id = $1', [userId])
            : await query('SELECT * FROM user_cron_jobs WHERE user_id IS NULL');
        await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)', ['SYNC_CRONTAB', { username, jobs: allJobs.rows }]);
        res.status(201).json(result.rows[0]);
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
// Delete any cron job
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const jobRes = await query('SELECT user_id FROM user_cron_jobs WHERE id = $1', [id]);
        if (jobRes.rowCount === 0)
            return res.status(404).json({ message: 'Cron job not found' });
        const userId = jobRes.rows[0].user_id;
        let username = 'root';
        if (userId) {
            const userRes = await query('SELECT username FROM users WHERE id = $1', [userId]);
            username = userRes.rows[0].username;
        }
        await query('DELETE FROM user_cron_jobs WHERE id = $1', [id]);
        // Sync crontab — fetch all jobs for this user (or all system jobs if userId is null)
        const allJobs = userId
            ? await query('SELECT * FROM user_cron_jobs WHERE user_id = $1', [userId])
            : await query('SELECT * FROM user_cron_jobs WHERE user_id IS NULL');
        await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)', ['SYNC_CRONTAB', { username, jobs: allJobs.rows }]);
        res.json({ message: 'Cron job deleted' });
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { userId, minute, hour, day, month, weekday, command, description } = req.body;
    try {
        const jobRes = await query('SELECT user_id FROM user_cron_jobs WHERE id = $1', [id]);
        if (jobRes.rowCount === 0)
            return res.status(404).json({ message: 'Cron job not found' });
        let username = 'root';
        if (userId) {
            const userRes = await query('SELECT username FROM users WHERE id = $1', [userId]);
            if (userRes.rowCount === 0)
                return res.status(404).json({ message: 'User not found' });
            username = userRes.rows[0].username;
        }
        const result = await query(`UPDATE user_cron_jobs 
       SET user_id = $1, minute = $2, hour = $3, day = $4, month = $5, weekday = $6, command = $7, description = $8 
       WHERE id = $9 RETURNING *`, [userId || null, minute || '*', hour || '*', day || '*', month || '*', weekday || '*', command, description, id]);
        // Sync crontab — fetch all jobs for this user (or all system jobs if userId is null)
        const allJobs = userId
            ? await query('SELECT * FROM user_cron_jobs WHERE user_id = $1', [userId])
            : await query('SELECT * FROM user_cron_jobs WHERE user_id IS NULL');
        await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)', ['SYNC_CRONTAB', { username, jobs: allJobs.rows }]);
        res.json(result.rows[0]);
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
export default router;
//# sourceMappingURL=adminCron.js.map