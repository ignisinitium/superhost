import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import { query } from '../db.js';
import { authenticateAdmin } from '../middleware/auth.js';
const router = express.Router();
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const result = await query('SELECT * FROM admins WHERE username = $1', [username]);
        if (result.rows.length === 0)
            return res.status(401).json({ message: 'Invalid credentials' });
        const admin = result.rows[0];
        const isMatch = await bcrypt.compare(password, admin.password_hash);
        if (!isMatch)
            return res.status(401).json({ message: 'Invalid credentials' });
        if (admin.two_factor_enabled) {
            return res.json({ require2FA: true, adminId: admin.id });
        }
        const token = jwt.sign({ id: admin.id }, process.env.JWT_SECRET || 'secret', { expiresIn: '1d' });
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
        const jwtToken = jwt.sign({ id: admin.id }, process.env.JWT_SECRET || 'secret', { expiresIn: '1d' });
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
export default router;
//# sourceMappingURL=auth.js.map