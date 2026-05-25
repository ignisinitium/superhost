import express from 'express';
import bcrypt from 'bcryptjs';
import path from 'path';
import { query } from '../db.js';
import { authenticateClient } from '../middleware/auth.js';
const router = express.Router();
router.use(authenticateClient);
// Get all FTP accounts for the current user
router.get('/', async (req, res) => {
    try {
        const result = await query('SELECT id, ftp_username, homedir, created_at FROM ftp_accounts WHERE user_id = $1 ORDER BY created_at DESC', [req.userId]);
        res.json(result.rows);
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
// Create a new FTP account
router.post('/', async (req, res) => {
    const { ftp_user, password, sub_path } = req.body;
    try {
        // 1. Get user info
        const userRes = await query('SELECT username, home_dir FROM users WHERE id = $1', [req.userId]);
        const { username, home_dir } = userRes.rows[0];
        // 2. Format FTP username (e.g. mainuser_ftpuser)
        const fullFtpUsername = `${username}_${ftp_user}`;
        // 3. Resolve and validate path
        // Users are restricted to their home directory or public_html
        const baseDir = path.join(home_dir, 'public_html');
        const targetDir = path.resolve(baseDir, sub_path || '');
        if (!targetDir.startsWith(baseDir)) {
            return res.status(400).json({ message: 'Invalid path. Path must be inside public_html.' });
        }
        // 4. Hash password
        const passwordHash = await bcrypt.hash(password, 10);
        // 5. Save to DB
        const result = await query('INSERT INTO ftp_accounts (user_id, ftp_username, password_hash, homedir) VALUES ($1, $2, $3, $4) RETURNING id, ftp_username, homedir, created_at', [req.userId, fullFtpUsername, passwordHash, targetDir]);
        // 6. Trigger worker task to sync FTP config
        await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)', ['SYNC_FTP', { username }]);
        res.status(201).json(result.rows[0]);
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
// Delete an FTP account
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const userRes = await query('SELECT username FROM users WHERE id = $1', [req.userId]);
        const username = userRes.rows[0].username;
        const result = await query('DELETE FROM ftp_accounts WHERE id = $1 AND user_id = $2 RETURNING ftp_username', [id, req.userId]);
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'FTP account not found' });
        }
        // Trigger worker task to sync FTP config
        await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)', ['SYNC_FTP', { username }]);
        res.json({ message: 'FTP account deleted' });
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
export default router;
//# sourceMappingURL=ftp.js.map