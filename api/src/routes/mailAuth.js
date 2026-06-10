import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../db.js';
import { checkIpBlock, logLoginAttempt } from '../middleware/rateLimiter.js';
const router = express.Router();
function getJwtSecret() {
    const secret = process.env.JWT_SECRET;
    if (!secret)
        throw new Error('FATAL: JWT_SECRET not set');
    return secret;
}
router.post('/login', checkIpBlock, async (req, res) => {
    const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required' });
    }
    try {
        const muRes = await query(`
      SELECT mu.id, mu.password_hash, md.user_id
      FROM mail_users mu
      JOIN mail_domains md ON mu.domain_id = md.id
      WHERE mu.email = $1
    `, [email.toLowerCase().trim()]);
        if (muRes.rowCount === 0) {
            await logLoginAttempt(ip, email, false);
            return res.status(401).json({ message: 'Invalid email or password' });
        }
        const mu = muRes.rows[0];
        // Stored as {BLF-CRYPT}$2b$... — strip the scheme prefix before comparing
        const rawHash = mu.password_hash.replace(/^\{[^}]+\}/, '');
        const match = await bcrypt.compare(password, rawHash);
        if (!match) {
            await logLoginAttempt(ip, email, false);
            return res.status(401).json({ message: 'Invalid email or password' });
        }
        await logLoginAttempt(ip, email, true);
        const token = jwt.sign({ id: mu.user_id, role: 'mail_user', mailUserId: mu.id }, getJwtSecret(), { expiresIn: '24h' });
        res.json({ token, email });
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
export default router;
//# sourceMappingURL=mailAuth.js.map