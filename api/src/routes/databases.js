import express from 'express';
import { query } from '../db.js';
import { authenticateClient } from '../middleware/auth.js';
import crypto from 'crypto';
const router = express.Router();
router.use(authenticateClient);
router.get('/sso', async (req, res) => {
    try {
        const userRes = await query('SELECT username FROM users WHERE id = $1', [req.userId]);
        if (userRes.rows.length === 0)
            return res.status(404).json({ message: 'User not found' });
        const username = userRes.rows[0].username;
        // Create a 1-minute single-use token for SSO in DB
        const token = crypto.randomBytes(32).toString('hex');
        await query('INSERT INTO sso_tokens (token, username) VALUES ($1, $2)', [token, username]);
        res.json({ url: `https://${process.env.RP_ID || 'web02.qc.fyi'}/phpmyadmin/sso.php?token=${token}` });
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
router.get('/', async (req, res) => {
    try {
        const result = await query('SELECT * FROM databases WHERE user_id = $1 ORDER BY created_at DESC', [req.userId]);
        res.json(result.rows);
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
router.post('/', async (req, res) => {
    const { dbName, dbPassword } = req.body;
    const userId = req.userId;
    try {
        // 1. Get username to prefix the database name (cPanel style)
        const userRes = await query('SELECT username FROM users WHERE id = $1', [userId]);
        const username = userRes.rows[0].username;
        // Sanitize and prefix
        const safeName = dbName.replace(/[^a-zA-Z0-9_]/g, '');
        const fullDbName = `${username}_${safeName}`;
        const fullDbUser = fullDbName; // For simplicity, user = dbName
        // 2. Insert into PostgreSQL tracking table
        const result = await query('INSERT INTO databases (user_id, db_name, db_user) VALUES ($1, $2, $3) RETURNING *', [userId, fullDbName, fullDbUser]);
        // 3. Create worker task
        await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)', ['CREATE_DATABASE', { dbName: fullDbName, dbUser: fullDbUser, dbPassword }]);
        res.status(201).json(result.rows[0]);
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    const userId = req.userId;
    try {
        const dbRes = await query('SELECT db_name, db_user FROM databases WHERE id = $1 AND user_id = $2', [id, userId]);
        if (dbRes.rows.length === 0)
            return res.status(404).json({ message: 'Database not found' });
        const { db_name, db_user } = dbRes.rows[0];
        // 1. Delete from PostgreSQL
        await query('DELETE FROM databases WHERE id = $1', [id]);
        // 2. Create worker task
        await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)', ['DELETE_DATABASE', { dbName: db_name, dbUser: db_user }]);
        res.json({ message: 'Database deletion task queued' });
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
export default router;
//# sourceMappingURL=databases.js.map