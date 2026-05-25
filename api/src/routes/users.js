import express from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db.js';
import { authenticateAdmin } from '../middleware/auth.js';
const router = express.Router();
router.use(authenticateAdmin);
router.get('/', async (req, res) => {
    try {
        const result = await query('SELECT * FROM users ORDER BY created_at DESC');
        res.json(result.rows);
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
router.post('/', async (req, res) => {
    const { username, email, password, disk_limit_mb, bandwidth_limit_mb } = req.body;
    const homeDir = `/home/${username}`;
    try {
        const passwordHash = password ? await bcrypt.hash(password, 10) : null;
        // 1. Insert into DB
        const result = await query('INSERT INTO users (username, email, home_dir, password_hash, disk_limit_mb, bandwidth_limit_mb) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *', [username, email, homeDir, passwordHash, disk_limit_mb || 1024, bandwidth_limit_mb || 5120]);
        const user = result.rows[0];
        // 2. Insert Task for Worker
        await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)', ['CREATE_USER', { username }]);
        res.status(201).json(user);
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
router.get('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await query('SELECT * FROM users WHERE id = $1', [id]);
        if (result.rows.length === 0)
            return res.status(404).json({ message: 'User not found' });
        res.json(result.rows[0]);
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { email, password, disk_limit_mb, bandwidth_limit_mb } = req.body;
    try {
        let result;
        if (password) {
            const passwordHash = await bcrypt.hash(password, 10);
            result = await query('UPDATE users SET email = $1, password_hash = $2, disk_limit_mb = $3, bandwidth_limit_mb = $4 WHERE id = $5 RETURNING *', [email, passwordHash, disk_limit_mb, bandwidth_limit_mb, id]);
        }
        else {
            result = await query('UPDATE users SET email = $1, disk_limit_mb = $2, bandwidth_limit_mb = $3 WHERE id = $4 RETURNING *', [email, disk_limit_mb, bandwidth_limit_mb, id]);
        }
        if (result.rows.length === 0)
            return res.status(404).json({ message: 'User not found' });
        res.json(result.rows[0]);
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
export default router;
//# sourceMappingURL=users.js.map