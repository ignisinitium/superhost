import express from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db.js';
import { authenticateAdmin } from '../middleware/auth.js';
import { User } from '../../../shared/types.js';
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
    const { username, email, password } = req.body;
    const homeDir = `/home/${username}`;
    try {
        const passwordHash = password ? await bcrypt.hash(password, 10) : null;
        // 1. Insert into DB
        const result = await query('INSERT INTO users (username, email, home_dir, password_hash) VALUES ($1, $2, $3, $4) RETURNING *', [username, email, homeDir, passwordHash]);
        const user = result.rows[0];
        // 2. Insert Task for Worker
        await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)', ['CREATE_USER', { username }]);
        res.status(201).json(user);
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
export default router;
//# sourceMappingURL=users.js.map