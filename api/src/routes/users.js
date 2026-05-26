import express from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db.js';
import { authenticateAdmin } from '../middleware/auth.js';
const router = express.Router();
router.use(authenticateAdmin);
router.get('/', async (_req, res) => {
    try {
        const result = await query(`
      SELECT u.*, p.name AS package_name, p.type AS package_type
      FROM users u
      LEFT JOIN products p ON p.id = u.package_id
      ORDER BY u.created_at DESC
    `);
        res.json(result.rows);
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
router.post('/', async (req, res) => {
    const { username, email, password, disk_limit_mb, bandwidth_limit_mb, package_id } = req.body;
    const homeDir = `/home/${username}`;
    try {
        const passwordHash = password ? await bcrypt.hash(password, 10) : null;
        const result = await query(`INSERT INTO users
         (username, email, home_dir, password_hash, disk_limit_mb, bandwidth_limit_mb, package_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`, [username, email, homeDir, passwordHash,
            disk_limit_mb || 1024, bandwidth_limit_mb || 5120,
            package_id ?? null]);
        const user = result.rows[0];
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
        const result = await query(`
      SELECT u.*, p.name AS package_name, p.type AS package_type,
             p.disk_quota_mb, p.bandwidth_gb, p.email_accounts, p.databases_allowed,
             p.domains_allowed, p.ssh_access, p.ssl_included, p.spam_filter,
             p.price_cents, p.billing_cycle
      FROM users u
      LEFT JOIN products p ON p.id = u.package_id
      WHERE u.id = $1
    `, [id]);
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
    const { email, password, disk_limit_mb, bandwidth_limit_mb, package_id } = req.body;
    try {
        let result;
        if (password) {
            const passwordHash = await bcrypt.hash(password, 10);
            result = await query(`UPDATE users SET email=$1, password_hash=$2, disk_limit_mb=$3,
          bandwidth_limit_mb=$4, package_id=$5
         WHERE id=$6 RETURNING *`, [email, passwordHash, disk_limit_mb, bandwidth_limit_mb,
                package_id ?? null, id]);
        }
        else {
            result = await query(`UPDATE users SET email=$1, disk_limit_mb=$2,
          bandwidth_limit_mb=$3, package_id=$4
         WHERE id=$5 RETURNING *`, [email, disk_limit_mb, bandwidth_limit_mb,
                package_id ?? null, id]);
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