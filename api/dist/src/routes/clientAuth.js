import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../db.js';
const router = express.Router();
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const result = await query('SELECT * FROM users WHERE username = $1', [username]);
        if (result.rows.length === 0)
            return res.status(401).json({ message: 'Invalid credentials' });
        const user = result.rows[0];
        if (!user.password_hash) {
            return res.status(401).json({ message: 'Account not set up for login. Contact support.' });
        }
        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch)
            return res.status(401).json({ message: 'Invalid credentials' });
        const token = jwt.sign({ id: user.id, role: 'client' }, process.env.JWT_SECRET || 'secret', { expiresIn: '1d' });
        res.json({ token, user: { id: user.id, username: user.username, email: user.email } });
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
export default router;
//# sourceMappingURL=clientAuth.js.map