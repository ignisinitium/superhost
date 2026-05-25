import express from 'express';
import { generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse, } from '@simplewebauthn/server';
import { query } from '../db.js';
import { authenticateAdmin } from '../middleware/auth.js';
import jwt from 'jsonwebtoken';
const router = express.Router();
const RP_ID = process.env.RP_ID || 'web02.qc.fyi';
const RP_NAME = 'Superhost';
const ORIGIN = `https://${RP_ID}`;
// In-memory store for challenges
const currentChallenges = new Map();
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
        currentChallenges.set(adminId, options.challenge);
        res.json(options);
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
router.post('/register-verify', authenticateAdmin, async (req, res) => {
    const { body } = req;
    const adminId = req.adminId;
    const expectedChallenge = currentChallenges.get(adminId);
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
            currentChallenges.delete(adminId);
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
router.post('/login-options', async (req, res) => {
    const { username } = req.body;
    try {
        const adminRes = await query('SELECT id FROM admins WHERE username = $1', [username]);
        if (adminRes.rows.length === 0)
            return res.status(404).json({ message: 'Admin not found' });
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
        currentChallenges.set(adminId, options.challenge);
        res.json({ options, adminId });
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
router.post('/login-verify', async (req, res) => {
    const { body, adminId } = req.body;
    const expectedChallenge = currentChallenges.get(adminId);
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
            const token = jwt.sign({ id: admin.id, role: 'admin' }, process.env.JWT_SECRET || 'secret', { expiresIn: '1d' });
            currentChallenges.delete(adminId);
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