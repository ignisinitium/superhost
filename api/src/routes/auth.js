import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import { query } from '../db.js';
import { authenticateAdmin } from '../middleware/auth.js';
import { checkIpBlock, logLoginAttempt } from '../middleware/rateLimiter.js';
function getJwtSecret() {
    const secret = process.env.JWT_SECRET;
    if (!secret)
        throw new Error('FATAL: JWT_SECRET is not set');
    return secret;
}
const router = express.Router();
router.post('/login', checkIpBlock, async (req, res) => {
    const { username, password } = req.body;
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    try {
        const result = await query('SELECT * FROM admins WHERE username = $1', [username]);
        if (result.rows.length === 0) {
            await logLoginAttempt(ip, username, false);
            return res.status(401).json({ message: 'Invalid credentials' });
        }
        const admin = result.rows[0];
        const isMatch = await bcrypt.compare(password, admin.password_hash);
        if (!isMatch) {
            await logLoginAttempt(ip, username, false);
            return res.status(401).json({ message: 'Invalid credentials' });
        }
        // Success
        await logLoginAttempt(ip, username, true);
        if (admin.two_factor_enabled) {
            return res.json({ require2FA: true, adminId: admin.id });
        }
        const token = jwt.sign({ id: admin.id, role: 'admin' }, getJwtSecret(), { expiresIn: '8h' });
        res.json({ token, admin: { id: admin.id, username: admin.username } });
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
router.post('/verify-2fa', async (req, res) => {
    const { adminId, token } = req.body;
    try {
        const result = await query('SELECT * FROM admins WHERE id = $1', [adminId]);
        if (result.rows.length === 0)
            return res.status(401).json({ message: 'Invalid admin' });
        const admin = result.rows[0];
        const verified = speakeasy.totp.verify({
            secret: admin.two_factor_secret,
            encoding: 'base32',
            token
        });
        if (!verified)
            return res.status(401).json({ message: 'Invalid 2FA token' });
        const jwtToken = jwt.sign({ id: admin.id, role: 'admin' }, getJwtSecret(), { expiresIn: '8h' });
        res.json({ token: jwtToken, admin: { id: admin.id, username: admin.username } });
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
router.post('/setup-2fa', authenticateAdmin, async (req, res) => {
    const secret = speakeasy.generateSecret({ name: `Superhost (${req.adminId})` });
    try {
        await query('UPDATE admins SET two_factor_secret = $1 WHERE id = $2', [secret.base32, req.adminId]);
        const qrCodeDataUrl = await QRCode.toDataURL(secret.otpauth_url || '');
        res.json({ secret: secret.base32, qrCode: qrCodeDataUrl });
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
router.post('/enable-2fa', authenticateAdmin, async (req, res) => {
    const { token } = req.body;
    try {
        const result = await query('SELECT * FROM admins WHERE id = $1', [req.adminId]);
        const admin = result.rows[0];
        const verified = speakeasy.totp.verify({
            secret: admin.two_factor_secret,
            encoding: 'base32',
            token
        });
        if (!verified)
            return res.status(401).json({ message: 'Invalid 2FA token' });
        await query('UPDATE admins SET two_factor_enabled = TRUE WHERE id = $1', [req.adminId]);
        res.json({ message: '2FA enabled successfully' });
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
// POST /impersonate/:userId — admin-only; returns a client-scoped JWT for the target user
router.post('/impersonate/:userId', authenticateAdmin, async (req, res) => {
    const { userId } = req.params;
    try {
        const userRes = await query('SELECT id, username, email FROM users WHERE id = $1', [userId]);
        if (userRes.rows.length === 0)
            return res.status(404).json({ message: 'User not found' });
        const user = userRes.rows[0];
        const token = jwt.sign({ id: user.id, role: 'client', impersonatedBy: req.adminId }, getJwtSecret(), { expiresIn: '2h' });
        res.json({ token, user: { id: user.id, username: user.username, email: user.email } });
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
router.get('/profile', authenticateAdmin, async (req, res) => {
    try {
        const result = await query('SELECT id, username, email, two_factor_enabled FROM admins WHERE id = $1', [req.adminId]);
        if (result.rows.length === 0)
            return res.status(404).json({ message: 'Admin not found' });
        res.json(result.rows[0]);
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
router.put('/profile', authenticateAdmin, async (req, res) => {
    const { email, password } = req.body;
    try {
        if (password) {
            const passwordHash = await bcrypt.hash(password, 10);
            await query('UPDATE admins SET email = $1, password_hash = $2 WHERE id = $3', [email, passwordHash, req.adminId]);
        }
        else {
            await query('UPDATE admins SET email = $1 WHERE id = $2', [email, req.adminId]);
        }
        const result = await query('SELECT id, username, email, two_factor_enabled FROM admins WHERE id = $1', [req.adminId]);
        res.json(result.rows[0]);
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
export default router;
//# sourceMappingURL=auth.js.map