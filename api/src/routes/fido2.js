import express from 'express';
import { generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse, } from '@simplewebauthn/server';
import { query } from '../db.js';
import { authenticateAdmin } from '../middleware/auth.js';
import { checkIpBlock } from '../middleware/rateLimiter.js';
import jwt from 'jsonwebtoken';
const router = express.Router();
// RP_ID is the domain used for WebAuthn. Defaults to the hostname if not set.
// Set RP_ID in .env to your panel's actual domain for production use.
const RP_ID = process.env.RP_ID || 'localhost';
const RP_NAME = process.env.RP_NAME || 'Superhost';
const ORIGIN = process.env.RP_ORIGIN || `https://${RP_ID}`;
function getJwtSecret() {
    const secret = process.env.JWT_SECRET;
    if (!secret)
        throw new Error('FATAL: JWT_SECRET is not set');
    return secret;
}
// Challenges stored in PostgreSQL with TTL — survives restarts, works in clusters
async function storeChallenge(adminId, challenge) {
    await query(`INSERT INTO fido2_challenges (admin_id, challenge, expires_at)
     VALUES ($1, $2, NOW() + INTERVAL '5 minutes')
     ON CONFLICT (admin_id) DO UPDATE
       SET challenge = EXCLUDED.challenge, expires_at = EXCLUDED.expires_at`, [adminId, challenge]);
}
async function getChallenge(adminId) {
    const result = await query(`DELETE FROM fido2_challenges
     WHERE admin_id = $1 AND expires_at > NOW()
     RETURNING challenge`, [adminId]);
    return result.rows[0]?.challenge ?? null;
}
async function clearExpiredChallenges() {
    await query('DELETE FROM fido2_challenges WHERE expires_at <= NOW()');
}
router.post('/register-options', authenticateAdmin, async (req, res) => {
    try {
        const adminId = req.adminId;
        const adminRes = await query('SELECT username FROM admins WHERE id = $1', [adminId]);
        const admin = adminRes.rows[0];
        const credsRes = await query('SELECT credential_id FROM admin_fido_credentials WHERE admin_id = $1', [adminId]);
        const excludeCredentials = credsRes.rows.map(row => ({
            id: row.credential_id,
            type: 'public-key',
        }));
        const options = await generateRegistrationOptions({
            rpName: RP_NAME,
            rpID: RP_ID,
            userID: new TextEncoder().encode(adminId.toString()),
            userName: admin.username,
            attestationType: 'none',
            excludeCredentials,
            authenticatorSelection: {
                residentKey: 'preferred',
                userVerification: 'preferred',
            },
        });
        await storeChallenge(adminId, options.challenge);
        res.json(options);
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
router.post('/register-verify', authenticateAdmin, async (req, res) => {
    const { body } = req;
    const adminId = req.adminId;
    const expectedChallenge = await getChallenge(adminId);
    if (!expectedChallenge) {
        return res.status(400).json({ message: 'No challenge found' });
    }
    try {
        const verification = await verifyRegistrationResponse({
            response: body,
            expectedChallenge,
            expectedOrigin: ORIGIN,
            expectedRPID: RP_ID,
        });
        if (verification.verified && verification.registrationInfo) {
            const { credential } = verification.registrationInfo;
            await query('INSERT INTO admin_fido_credentials (admin_id, credential_id, public_key, counter) VALUES ($1, $2, $3, $4)', [adminId, credential.id, Buffer.from(credential.publicKey), credential.counter]);
            // Challenge already consumed by getChallenge (DELETE-RETURNING pattern)
            res.json({ verified: true });
        }
        else {
            res.status(400).json({ verified: false });
        }
    }
    catch (err) {
        res.status(400).json({ message: err.message });
    }
});
router.post('/login-options', checkIpBlock, async (req, res) => {
    const { username } = req.body;
    try {
        const adminRes = await query('SELECT id FROM admins WHERE username = $1', [username]);
        // Use a uniform 404 message identical to a malformed request so this can't
        // be used as a username-enumeration oracle.
        if (adminRes.rows.length === 0)
            return res.status(404).json({ message: 'No passkey available' });
        const adminId = adminRes.rows[0].id;
        const credsRes = await query('SELECT credential_id FROM admin_fido_credentials WHERE admin_id = $1', [adminId]);
        const allowCredentials = credsRes.rows.map(row => ({
            id: row.credential_id,
            type: 'public-key',
        }));
        const options = await generateAuthenticationOptions({
            rpID: RP_ID,
            allowCredentials,
            userVerification: 'preferred',
        });
        await storeChallenge(adminId, options.challenge);
        await clearExpiredChallenges(); // Housekeeping
        res.json({ options, adminId });
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
router.post('/login-verify', checkIpBlock, async (req, res) => {
    const { body, adminId } = req.body;
    const expectedChallenge = await getChallenge(adminId);
    if (!expectedChallenge)
        return res.status(400).json({ message: 'No challenge found' });
    try {
        const credRes = await query('SELECT * FROM admin_fido_credentials WHERE credential_id = $1 AND admin_id = $2', [body.id, adminId]);
        if (credRes.rows.length === 0)
            return res.status(400).json({ message: 'Credential not found' });
        const dbCred = credRes.rows[0];
        const verification = await verifyAuthenticationResponse({
            response: body,
            expectedChallenge,
            expectedOrigin: ORIGIN,
            expectedRPID: RP_ID,
            credential: {
                id: dbCred.credential_id,
                publicKey: dbCred.public_key,
                counter: dbCred.counter,
            },
        });
        if (verification.verified) {
            await query('UPDATE admin_fido_credentials SET counter = $1 WHERE id = $2', [verification.authenticationInfo.newCounter, dbCred.id]);
            const adminRes = await query('SELECT id, username FROM admins WHERE id = $1', [adminId]);
            const admin = adminRes.rows[0];
            const token = jwt.sign({ id: admin.id, role: 'admin' }, getJwtSecret(), { expiresIn: '8h' });
            // Challenge was already consumed atomically by getChallenge
            res.json({ verified: true, token, admin: { id: admin.id, username: admin.username } });
        }
        else {
            res.status(400).json({ verified: false });
        }
    }
    catch (err) {
        res.status(400).json({ message: err.message });
    }
});
export default router;
//# sourceMappingURL=fido2.js.map