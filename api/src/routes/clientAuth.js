import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import { query } from '../db.js';
import { authenticateClient, signSessionToken } from '../middleware/auth.js';
import { checkIpBlock, logLoginAttempt } from '../middleware/rateLimiter.js';
import { revokeCurrentToken } from '../audit.js';
function getJwtSecret() {
    const secret = process.env.JWT_SECRET;
    if (!secret)
        throw new Error('FATAL: JWT_SECRET is not set');
    return secret;
}
const router = express.Router();
// 'filter' for spam-filter-only accounts (per-mailbox product), else 'hosting'.
// Used by the dashboard to trim nav for filter-only customers.
async function accountType(packageId) {
    if (!packageId)
        return 'hosting';
    const r = await query('SELECT billing_unit FROM products WHERE id = $1', [packageId]);
    return r.rows[0]?.billing_unit === 'mailbox' ? 'filter' : 'hosting';
}
const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');
// ── Self-service password setup (for migrated users with no panel password) ──
// Lightweight check so the UI can show the form (and the username) or an
// "expired link" message without revealing anything for an invalid token.
router.get('/set-password/validate', async (req, res) => {
    const token = String(req.query.token ?? '');
    if (!token)
        return res.json({ valid: false });
    try {
        const r = await query(`SELECT u.username FROM password_setup_tokens t
       JOIN users u ON u.id = t.user_id
       WHERE t.token_hash = $1 AND t.used_at IS NULL AND t.expires_at > NOW()`, [hashToken(token)]);
        if (r.rowCount === 0)
            return res.json({ valid: false });
        res.json({ valid: true, username: r.rows[0].username });
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
// Consume the token and set the dashboard (bcrypt) password. Single-use.
router.post('/set-password', checkIpBlock, async (req, res) => {
    const { token, password } = req.body;
    if (!token || !password)
        return res.status(400).json({ message: 'Token and password are required' });
    if (typeof password !== 'string' || password.length < 8) {
        return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }
    try {
        const r = await query(`SELECT id, user_id FROM password_setup_tokens
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()`, [hashToken(token)]);
        if (r.rowCount === 0) {
            return res.status(400).json({ message: 'This link is invalid or has expired. Ask your administrator for a new one.' });
        }
        const { id: tokenId, user_id: userId } = r.rows[0];
        const passwordHash = await bcrypt.hash(password, 12);
        await query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, userId]);
        // Burn this token and any other outstanding tokens for the same user.
        await query('UPDATE password_setup_tokens SET used_at = NOW() WHERE id = $1', [tokenId]);
        await query('UPDATE password_setup_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL', [userId]);
        res.json({ message: 'Password set successfully. You can now sign in.' });
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
router.post('/login', checkIpBlock, async (req, res) => {
    const { username, password } = req.body;
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    try {
        const result = await query('SELECT * FROM users WHERE username = $1', [username]);
        if (result.rows.length === 0) {
            await logLoginAttempt(ip, username, false);
            return res.status(401).json({ message: 'Invalid credentials' });
        }
        const user = result.rows[0];
        if (!user.password_hash) {
            return res.status(401).json({ message: 'Account not set up for login. Contact support.' });
        }
        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            await logLoginAttempt(ip, username, false);
            return res.status(401).json({ message: 'Invalid credentials' });
        }
        // Success on first factor
        await logLoginAttempt(ip, username, true);
        // Second factor: if TOTP is enabled, require a short-lived pending token
        // bound to this password step (mirrors the admin flow).
        if (user.totp_enabled) {
            const pending = signSessionToken({ id: user.id, role: 'pending_client_2fa' }, '5m');
            return res.json({ require2FA: true, pendingToken: pending });
        }
        const token = signSessionToken({ id: user.id, role: 'client' }, '8h');
        res.json({ token, user: { id: user.id, username: user.username, email: user.email, account_type: await accountType(user.package_id) } });
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
router.post('/verify-2fa', checkIpBlock, async (req, res) => {
    const { token, pendingToken } = req.body;
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    try {
        let userId;
        try {
            const decoded = jwt.verify(pendingToken, getJwtSecret());
            if (decoded.role !== 'pending_client_2fa' || !Number.isInteger(decoded.id)) {
                return res.status(401).json({ message: 'Invalid or expired 2FA session' });
            }
            userId = decoded.id;
        }
        catch {
            return res.status(401).json({ message: 'Invalid or expired 2FA session' });
        }
        const result = await query('SELECT * FROM users WHERE id = $1', [userId]);
        if (result.rows.length === 0)
            return res.status(401).json({ message: 'Invalid account' });
        const user = result.rows[0];
        if (!user.totp_enabled || !user.totp_secret) {
            return res.status(400).json({ message: '2FA is not enabled for this account' });
        }
        const verified = speakeasy.totp.verify({ secret: user.totp_secret, encoding: 'base32', token, window: 1 });
        if (!verified) {
            await logLoginAttempt(ip, user.username, false);
            return res.status(401).json({ message: 'Invalid 2FA token' });
        }
        const jwtToken = signSessionToken({ id: user.id, role: 'client' }, '8h');
        res.json({ token: jwtToken, user: { id: user.id, username: user.username, email: user.email, account_type: await accountType(user.package_id) } });
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
router.post('/logout', authenticateClient, async (req, res) => {
    try {
        await revokeCurrentToken(req);
        res.json({ message: 'Logged out' });
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
// ── Client TOTP 2FA management ───────────────────────────────────────────────
router.post('/setup-2fa', authenticateClient, async (req, res) => {
    try {
        const userRes = await query('SELECT username FROM users WHERE id = $1', [req.userId]);
        const username = userRes.rows[0]?.username ?? `user-${req.userId}`;
        const secret = speakeasy.generateSecret({ name: `Superhost (${username})` });
        // Store the candidate secret; it only becomes active after enable-2fa verifies it.
        await query('UPDATE users SET totp_secret = $1 WHERE id = $2', [secret.base32, req.userId]);
        const qrCode = await QRCode.toDataURL(secret.otpauth_url || '');
        res.json({ secret: secret.base32, qrCode });
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
router.post('/enable-2fa', authenticateClient, async (req, res) => {
    const { token } = req.body;
    try {
        const userRes = await query('SELECT totp_secret FROM users WHERE id = $1', [req.userId]);
        const secret = userRes.rows[0]?.totp_secret;
        if (!secret)
            return res.status(400).json({ message: 'Run setup first' });
        const verified = speakeasy.totp.verify({ secret, encoding: 'base32', token, window: 1 });
        if (!verified)
            return res.status(401).json({ message: 'Invalid verification code' });
        await query('UPDATE users SET totp_enabled = TRUE WHERE id = $1', [req.userId]);
        res.json({ message: '2FA enabled' });
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
router.post('/disable-2fa', authenticateClient, async (req, res) => {
    const { password } = req.body;
    try {
        const userRes = await query('SELECT password_hash FROM users WHERE id = $1', [req.userId]);
        const hash = userRes.rows[0]?.password_hash;
        if (!hash || !(await bcrypt.compare(password ?? '', hash))) {
            return res.status(401).json({ message: 'Password required to disable 2FA' });
        }
        await query('UPDATE users SET totp_enabled = FALSE, totp_secret = NULL WHERE id = $1', [req.userId]);
        res.json({ message: '2FA disabled' });
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
router.get('/profile', authenticateClient, async (req, res) => {
    try {
        const result = await query("SELECT u.id, u.username, u.email, u.disk_limit_mb, u.disk_used_mb, u.bandwidth_limit_mb, u.bandwidth_used_mb, u.totp_enabled, CASE WHEN p.billing_unit='mailbox' THEN 'filter' ELSE 'hosting' END AS account_type FROM users u LEFT JOIN products p ON p.id = u.package_id WHERE u.id = $1", [req.userId]);
        if (result.rows.length === 0)
            return res.status(404).json({ message: 'User not found' });
        res.json(result.rows[0]);
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
router.put('/profile', authenticateClient, async (req, res) => {
    const { email, password } = req.body;
    try {
        if (password) {
            const passwordHash = await bcrypt.hash(password, 10);
            await query('UPDATE users SET email = $1, password_hash = $2 WHERE id = $3', [email, passwordHash, req.userId]);
        }
        else {
            await query('UPDATE users SET email = $1 WHERE id = $2', [email, req.userId]);
        }
        const result = await query("SELECT u.id, u.username, u.email, u.disk_limit_mb, u.disk_used_mb, u.bandwidth_limit_mb, u.bandwidth_used_mb, u.totp_enabled, CASE WHEN p.billing_unit='mailbox' THEN 'filter' ELSE 'hosting' END AS account_type FROM users u LEFT JOIN products p ON p.id = u.package_id WHERE u.id = $1", [req.userId]);
        res.json(result.rows[0]);
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
export default router;
//# sourceMappingURL=clientAuth.js.map