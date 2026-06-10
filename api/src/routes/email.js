import express from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db.js';
import { authenticateClientOrMail } from '../middleware/auth.js';
const router = express.Router();
router.use(authenticateClientOrMail);
// Email local part validation: RFC 5321 safe subset
const EMAIL_LOCAL_RE = /^[a-zA-Z0-9._%+\-]{1,64}$/;
/**
 * Block single-mailbox (mail_user) tokens from account-management endpoints.
 * Mail users may only manage spam/quarantine for their own mailbox; creating
 * mailboxes, deleting them, changing arbitrary passwords, and managing
 * forwarders require a full client token.
 */
function denyMailUser(req, res) {
    if (req.mailUserId != null) {
        res.status(403).json({ message: 'Not permitted for mailbox logins' });
        return true;
    }
    return false;
}
/**
 * For a mail_user token, the requested mailbox must be their own.
 * Returns true (and sends 403) on violation. No-op for full clients.
 */
function mailScopeDenied(req, targetMailUserId, res) {
    if (req.mailUserId != null && Number(targetMailUserId) !== req.mailUserId) {
        res.status(403).json({ message: 'Access denied' });
        return true;
    }
    return false;
}
/**
 * Generate a Dovecot-compatible password hash.
 * Uses {CRYPT} scheme with bcrypt ($2y$), which Dovecot recognises when
 * default_pass_scheme = CRYPT is set (the default on most distros).
 * The $2y$ prefix is the PHP/Dovecot-compatible bcrypt variant.
 */
async function generateDovecotPassword(plainPassword) {
    if (!plainPassword || plainPassword.length < 8) {
        throw new Error('Password must be at least 8 characters');
    }
    // bcryptjs generates $2a$ prefix; Dovecot accepts both $2a$ and $2y$
    const hash = await bcrypt.hash(plainPassword, 12);
    // Use {BLF-CRYPT} — Dovecot's bcrypt scheme name (Blowfish-Crypt)
    return `{BLF-CRYPT}${hash}`;
}
router.get('/', async (req, res) => {
    try {
        // Full clients see all their mailboxes; a mail_user sees only their own.
        const result = await query(`
      SELECT mu.id, mu.domain_id, mu.email, md.domain_name, mu.quota,
             mu.spam_filter_enabled, mu.spam_digest_enabled,
             mu.spam_score_threshold, mu.spam_action, mu.is_catchall
      FROM mail_users mu
      JOIN mail_domains md ON mu.domain_id = md.id
      WHERE md.user_id = $1 AND ($2::int IS NULL OR mu.id = $2)
      ORDER BY mu.email ASC
    `, [req.userId, req.mailUserId ?? null]);
        res.json(result.rows);
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
router.post('/', async (req, res) => {
    if (denyMailUser(req, res))
        return;
    const { localPart, domainId, password, quota = 1024, isCatchall = false } = req.body;
    const userId = req.userId;
    try {
        // Validate email local part format before anything else
        if (!localPart || !EMAIL_LOCAL_RE.test(localPart)) {
            return res.status(400).json({ message: 'Invalid email local part. Use letters, numbers, dots, hyphens, and underscores only (max 64 chars).' });
        }
        if (!password || typeof password !== 'string' || password.length < 8) {
            return res.status(400).json({ message: 'Password must be at least 8 characters' });
        }
        const quotaNum = parseInt(quota);
        if (!Number.isInteger(quotaNum) || quotaNum < 100 || quotaNum > 102400) {
            return res.status(400).json({ message: 'Quota must be between 100 MB and 100 GB' });
        }
        // 1. Verify the domain belongs to the user
        const domainRes = await query('SELECT id, domain_name FROM domains WHERE id = $1 AND user_id = $2', [domainId, userId]);
        if (domainRes.rows.length === 0) {
            return res.status(403).json({ message: 'Domain not found or access denied' });
        }
        const domainName = domainRes.rows[0].domain_name;
        const fullEmail = `${localPart}@${domainName}`;
        // 2. Ensure the mail_domain exists in the mail_domains table
        let mailDomainId;
        const existingMailDomain = await query('SELECT id FROM mail_domains WHERE domain_name = $1', [domainName]);
        if (existingMailDomain.rows.length === 0) {
            const insertDomainRes = await query('INSERT INTO mail_domains (domain_name, user_id) VALUES ($1, $2) RETURNING id', [domainName, userId]);
            mailDomainId = insertDomainRes.rows[0].id;
        }
        else {
            mailDomainId = existingMailDomain.rows[0].id;
        }
        // 3. If catchall requested, enforce one-per-domain before inserting
        if (isCatchall) {
            const existingCatchall = await query('SELECT id, email FROM mail_users WHERE domain_id = $1 AND is_catchall = TRUE', [mailDomainId]);
            if (existingCatchall.rows.length > 0) {
                return res.status(400).json({
                    message: `A catchall already exists for this domain: ${existingCatchall.rows[0].email}`
                });
            }
        }
        // 4. Hash password with correct Dovecot scheme
        const dovecotHash = await generateDovecotPassword(password);
        const result = await query('INSERT INTO mail_users (domain_id, email, password_hash, quota, is_catchall) VALUES ($1, $2, $3, $4, $5) RETURNING id, email, quota, is_catchall', [mailDomainId, fullEmail, dovecotHash, quotaNum, isCatchall === true]);
        // 5. Provision Maildir and trigger DNS + mail-server setup
        await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)', ['PROVISION_MAILBOX', { email: fullEmail }]);
        await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)', ['GENERATE_EMAIL_DNS', { domainId, domainName }]);
        await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)', ['CONFIGURE_MAIL_SERVER', {}]);
        res.status(201).json(result.rows[0]);
    }
    catch (err) {
        if (err.code === '23505') { // Unique violation
            // Could be duplicate email OR duplicate catchall (from partial index)
            const msg = err.constraint === 'mail_users_catchall_per_domain'
                ? 'A catchall already exists for this domain'
                : 'Email address already exists';
            return res.status(400).json({ message: msg });
        }
        res.status(500).json({ message: err.message });
    }
});
router.delete('/:id', async (req, res) => {
    if (denyMailUser(req, res))
        return;
    const { id } = req.params;
    const userId = req.userId;
    try {
        // Verify ownership via the join
        const verifyRes = await query(`
      SELECT mu.id 
      FROM mail_users mu
      JOIN mail_domains md ON mu.domain_id = md.id
      WHERE mu.id = $1 AND md.user_id = $2
    `, [id, userId]);
        if (verifyRes.rows.length === 0) {
            return res.status(403).json({ message: 'Email account not found or access denied' });
        }
        await query('DELETE FROM mail_users WHERE id = $1', [id]);
        res.json({ message: 'Email account deleted successfully' });
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
// Change email password
router.patch('/:id/password', async (req, res) => {
    if (denyMailUser(req, res))
        return;
    const { id } = req.params;
    const { password } = req.body;
    const userId = req.userId;
    try {
        if (!password || typeof password !== 'string' || password.length < 8) {
            return res.status(400).json({ message: 'Password must be at least 8 characters' });
        }
        const verifyRes = await query(`
      SELECT mu.id, mu.email FROM mail_users mu
      JOIN mail_domains md ON mu.domain_id = md.id
      WHERE mu.id = $1 AND md.user_id = $2
    `, [id, userId]);
        if (verifyRes.rows.length === 0)
            return res.status(403).json({ message: 'Access denied' });
        const passwordHash = await generateDovecotPassword(password);
        await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)', ['CHANGE_EMAIL_PASSWORD', { mailUserId: parseInt(id, 10), passwordHash }]);
        res.json({ message: 'Password change queued' });
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
// Update Email Account (Quota, Spam Filter)
router.patch('/:id', async (req, res) => {
    const { id } = req.params;
    if (mailScopeDenied(req, id, res))
        return;
    let { quota } = req.body;
    const { spamFilterEnabled, spamDigestEnabled, spamScoreThreshold, spamAction } = req.body;
    const userId = req.userId;
    // A mail_user may tune their own spam settings but not raise their quota.
    if (req.mailUserId != null)
        quota = undefined;
    if (spamAction !== undefined && !['quarantine', 'tag', 'deliver'].includes(spamAction)) {
        return res.status(400).json({ message: 'spamAction must be quarantine, tag, or deliver' });
    }
    if (spamScoreThreshold !== undefined) {
        const t = Number(spamScoreThreshold);
        if (!Number.isFinite(t) || t < 0.1 || t > 100) {
            return res.status(400).json({ message: 'spamScoreThreshold must be between 0.1 and 100' });
        }
    }
    try {
        const verifyRes = await query(`
      SELECT mu.id, mu.email
      FROM mail_users mu
      JOIN mail_domains md ON mu.domain_id = md.id
      WHERE mu.id = $1 AND md.user_id = $2
    `, [id, userId]);
        if (verifyRes.rows.length === 0)
            return res.status(403).json({ message: 'Access denied' });
        const result = await query(`
      UPDATE mail_users
      SET quota                = COALESCE($1, quota),
          spam_filter_enabled  = COALESCE($2, spam_filter_enabled),
          spam_digest_enabled  = COALESCE($3, spam_digest_enabled),
          spam_score_threshold = COALESCE($4, spam_score_threshold),
          spam_action          = COALESCE($5, spam_action)
      WHERE id = $6
      RETURNING *
    `, [quota ?? null, spamFilterEnabled ?? null, spamDigestEnabled ?? null, spamScoreThreshold ?? null, spamAction ?? null, id]);
        if (quota !== undefined) {
            await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)', ['APPLY_EMAIL_QUOTA', { email: verifyRes.rows[0].email }]);
        }
        // Re-sync Sieve when spam settings change
        if (spamFilterEnabled !== undefined || spamAction !== undefined || spamScoreThreshold !== undefined) {
            await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)', ['SYNC_SPAM_RULES', { mailUserId: parseInt(id, 10) }]);
        }
        res.json(result.rows[0]);
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
// --- Forwarders ---
router.get('/forwarders', async (req, res) => {
    if (denyMailUser(req, res))
        return;
    try {
        const result = await query(`
      SELECT mf.*, md.domain_name 
      FROM mail_forwarders mf
      JOIN mail_domains md ON mf.domain_id = md.id
      WHERE md.user_id = $1
      ORDER BY mf.source ASC
    `, [req.userId]);
        res.json(result.rows);
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
router.post('/forwarders', async (req, res) => {
    if (denyMailUser(req, res))
        return;
    const { source, destination, domainId } = req.body;
    const userId = req.userId;
    try {
        const domainRes = await query('SELECT domain_name FROM domains WHERE id = $1 AND user_id = $2', [domainId, userId]);
        if (domainRes.rows.length === 0)
            return res.status(403).json({ message: 'Domain not found' });
        const domainName = domainRes.rows[0].domain_name;
        const fullSource = source.includes('@') ? source : `${source}@${domainName}`;
        const result = await query('INSERT INTO mail_forwarders (domain_id, source, destination) VALUES ($1, $2, $3) RETURNING *', [domainId, fullSource, destination]);
        // Trigger worker to ensure Postfix maps are configured
        await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)', ['CONFIGURE_MAIL_SERVER', {}]);
        res.status(201).json(result.rows[0]);
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
router.delete('/forwarders/:id', async (req, res) => {
    if (denyMailUser(req, res))
        return;
    const { id } = req.params;
    try {
        const verifyRes = await query(`
      SELECT mf.id FROM mail_forwarders mf
      JOIN mail_domains md ON mf.domain_id = md.id
      WHERE mf.id = $1 AND md.user_id = $2
    `, [id, req.userId]);
        if (verifyRes.rows.length === 0)
            return res.status(403).json({ message: 'Access denied' });
        await query('DELETE FROM mail_forwarders WHERE id = $1', [id]);
        // Trigger worker to ensure Postfix maps are configured
        await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)', ['CONFIGURE_MAIL_SERVER', {}]);
        res.json({ message: 'Forwarder deleted' });
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
// --- Auto-responders ---
router.get('/:mailUserId/autoresponder', async (req, res) => {
    const { mailUserId } = req.params;
    if (mailScopeDenied(req, mailUserId, res))
        return;
    try {
        const result = await query(`
      SELECT ma.* FROM mail_autoresponders ma
      JOIN mail_users mu ON ma.mail_user_id = mu.id
      JOIN mail_domains md ON mu.domain_id = md.id
      WHERE mu.id = $1 AND md.user_id = $2
    `, [mailUserId, req.userId]);
        res.json(result.rows[0] || { message: '', enabled: false });
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
router.post('/:mailUserId/autoresponder', async (req, res) => {
    const { mailUserId } = req.params;
    if (mailScopeDenied(req, mailUserId, res))
        return;
    const { message, enabled } = req.body;
    try {
        const verifyRes = await query(`
      SELECT mu.id FROM mail_users mu
      JOIN mail_domains md ON mu.domain_id = md.id
      WHERE mu.id = $1 AND md.user_id = $2
    `, [mailUserId, req.userId]);
        if (verifyRes.rows.length === 0)
            return res.status(403).json({ message: 'Access denied' });
        const result = await query(`
      INSERT INTO mail_autoresponders (mail_user_id, message, enabled)
      VALUES ($1, $2, $3)
      ON CONFLICT (mail_user_id) DO UPDATE
      SET message = EXCLUDED.message, enabled = EXCLUDED.enabled
      RETURNING *
    `, [mailUserId, message, enabled]);
        // Get the email address so the worker can write the Sieve script
        const userRes = await query('SELECT email FROM mail_users WHERE id = $1', [mailUserId]);
        if (userRes.rows.length > 0) {
            await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)', ['UPDATE_AUTORESPONDER', { email: userRes.rows[0].email, message, enabled }]);
        }
        res.json(result.rows[0]);
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
// --- Spam Quarantine & Access Control ---
// Get quarantined emails for a user (supports ?search=)
router.get('/:mailUserId/quarantine', async (req, res) => {
    const { mailUserId } = req.params;
    if (mailScopeDenied(req, mailUserId, res))
        return;
    const { search } = req.query;
    try {
        const verifyRes = await query(`
      SELECT mu.id FROM mail_users mu
      JOIN mail_domains md ON mu.domain_id = md.id
      WHERE mu.id = $1 AND md.user_id = $2
    `, [mailUserId, req.userId]);
        if (verifyRes.rowCount === 0)
            return res.status(403).json({ message: 'Access denied' });
        const params = [mailUserId];
        let sql = 'SELECT * FROM mail_quarantine WHERE mail_user_id = $1 AND released_at IS NULL';
        if (search && typeof search === 'string' && search.trim()) {
            sql += ' AND (sender ILIKE $2 OR subject ILIKE $2)';
            params.push(`%${search.trim()}%`);
        }
        sql += ' ORDER BY created_at DESC';
        const result = await query(sql, params);
        res.json(result.rows);
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
// Bulk release or delete quarantined emails (client)
router.post('/quarantine/bulk', async (req, res) => {
    const { ids, action } = req.body;
    if (!Array.isArray(ids) || !ids.length || !['release', 'delete'].includes(action)) {
        return res.status(400).json({ message: 'ids[] and action (release|delete) required' });
    }
    const safeIds = ids.slice(0, 200).map(Number).filter(n => Number.isFinite(n) && n > 0);
    const userId = req.userId;
    try {
        const qRes = await query(`
      SELECT q.id, q.file_path, q.sender, q.mail_user_id, mu.email AS recipient
      FROM mail_quarantine q
      JOIN mail_users mu ON q.mail_user_id = mu.id
      JOIN mail_domains md ON mu.domain_id = md.id
      WHERE q.id = ANY($1) AND md.user_id = $2 AND q.released_at IS NULL
        AND ($3::int IS NULL OR q.mail_user_id = $3)
    `, [safeIds, userId, req.mailUserId ?? null]);
        if (action === 'delete') {
            // Worker removes the mail file then deletes the row (prevents the
            // quarantine scanner from re-inserting it). Don't pre-delete here.
            for (const row of qRes.rows) {
                await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)', ['DELETE_QUARANTINE_FILE', { quarantineId: row.id, filePath: row.file_path }]);
            }
        }
        else {
            for (const row of qRes.rows) {
                await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)', ['RELEASE_QUARANTINE', { id: row.id, filePath: row.file_path, recipient: row.recipient }]);
            }
        }
        res.json({ processed: qRes.rows.length });
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
// Release email from quarantine (Deliver), optionally adding sender to allowlist
router.post('/quarantine/:id/release', async (req, res) => {
    const { id } = req.params;
    const { addToAllowlist } = req.body;
    try {
        const qRes = await query(`
      SELECT q.*, mu.email FROM mail_quarantine q
      JOIN mail_users mu ON q.mail_user_id = mu.id
      JOIN mail_domains md ON mu.domain_id = md.id
      WHERE q.id = $1 AND md.user_id = $2 AND q.released_at IS NULL
        AND ($3::int IS NULL OR q.mail_user_id = $3)
    `, [id, req.userId, req.mailUserId ?? null]);
        if (qRes.rowCount === 0)
            return res.status(404).json({ message: 'Quarantined email not found' });
        const item = qRes.rows[0];
        await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)', [
            'RELEASE_QUARANTINE',
            { id: item.id, filePath: item.file_path, recipient: item.email }
        ]);
        if (addToAllowlist && item.sender) {
            await query(`
        INSERT INTO mail_access_control (mail_user_id, sender_pattern, access_type)
        VALUES ($1, $2, 'allow')
        ON CONFLICT (mail_user_id, sender_pattern) DO NOTHING
      `, [item.mail_user_id, item.sender]);
        }
        res.json({ message: 'Email release queued' });
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
// Delete quarantined email
router.delete('/quarantine/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const verifyRes = await query(`
      SELECT q.id, q.file_path FROM mail_quarantine q
      JOIN mail_users mu ON q.mail_user_id = mu.id
      JOIN mail_domains md ON mu.domain_id = md.id
      WHERE q.id = $1 AND md.user_id = $2 AND q.released_at IS NULL
        AND ($3::int IS NULL OR q.mail_user_id = $3)
    `, [id, req.userId, req.mailUserId ?? null]);
        if (verifyRes.rowCount === 0)
            return res.status(403).json({ message: 'Access denied' });
        // Remove the mail file first (dedicated task that validates the quarantine
        // path), then drop the DB row inside the worker so the 5-minute scanner
        // can't resurrect a deleted item. See DELETE_QUARANTINE_FILE handler.
        await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)', [
            'DELETE_QUARANTINE_FILE',
            { quarantineId: verifyRes.rows[0].id, filePath: verifyRes.rows[0].file_path }
        ]);
        res.json({ message: 'Quarantined email deletion queued' });
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
// --- Whitelist / Blacklist ---
router.get('/:mailUserId/access-control', async (req, res) => {
    const { mailUserId } = req.params;
    if (mailScopeDenied(req, mailUserId, res))
        return;
    try {
        const verifyRes = await query(`
      SELECT mu.id FROM mail_users mu
      JOIN mail_domains md ON mu.domain_id = md.id
      WHERE mu.id = $1 AND md.user_id = $2
    `, [mailUserId, req.userId]);
        if (verifyRes.rowCount === 0)
            return res.status(403).json({ message: 'Access denied' });
        const result = await query('SELECT * FROM mail_access_control WHERE mail_user_id = $1 ORDER BY access_type DESC', [mailUserId]);
        res.json(result.rows);
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
router.post('/:mailUserId/access-control', async (req, res) => {
    const { mailUserId } = req.params;
    if (mailScopeDenied(req, mailUserId, res))
        return;
    const { senderPattern, accessType } = req.body;
    if (!senderPattern || typeof senderPattern !== 'string' || !/^[a-zA-Z0-9@._%+\-*]{1,255}$/.test(senderPattern)) {
        return res.status(400).json({ message: 'Invalid sender pattern' });
    }
    if (!['allow', 'block'].includes(accessType)) {
        return res.status(400).json({ message: 'accessType must be allow or block' });
    }
    try {
        const verifyRes = await query(`
      SELECT mu.id FROM mail_users mu
      JOIN mail_domains md ON mu.domain_id = md.id
      WHERE mu.id = $1 AND md.user_id = $2
    `, [mailUserId, req.userId]);
        if (verifyRes.rowCount === 0)
            return res.status(403).json({ message: 'Access denied' });
        const result = await query(`
      INSERT INTO mail_access_control (mail_user_id, sender_pattern, access_type)
      VALUES ($1, $2, $3)
      ON CONFLICT (mail_user_id, sender_pattern) DO UPDATE SET access_type = EXCLUDED.access_type
      RETURNING *
    `, [mailUserId, senderPattern, accessType]);
        await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)', ['SYNC_SPAM_RULES', { mailUserId: parseInt(mailUserId, 10) }]);
        res.status(201).json(result.rows[0]);
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
router.delete('/:mailUserId/access-control/:id', async (req, res) => {
    const { mailUserId, id } = req.params;
    if (mailScopeDenied(req, mailUserId, res))
        return;
    try {
        const verifyRes = await query(`
      SELECT mu.id FROM mail_users mu
      JOIN mail_domains md ON mu.domain_id = md.id
      WHERE mu.id = $1 AND md.user_id = $2
    `, [mailUserId, req.userId]);
        if (verifyRes.rowCount === 0)
            return res.status(403).json({ message: 'Access denied' });
        await query('DELETE FROM mail_access_control WHERE id = $1 AND mail_user_id = $2', [id, mailUserId]);
        await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)', ['SYNC_SPAM_RULES', { mailUserId: parseInt(mailUserId, 10) }]);
        res.json({ message: 'Access rule deleted' });
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
// ── Per-domain allow/block rules (apply to every mailbox in the domain) ──────
// Verify the mail domain belongs to the authenticated client. Mail-user tokens
// are blocked (domain-wide changes are an account-owner action).
async function ownedMailDomain(req, domainId) {
    const r = await query('SELECT id FROM mail_domains WHERE id = $1 AND user_id = $2', [domainId, req.userId]);
    return (r.rowCount ?? 0) > 0;
}
router.get('/domain-rules/:domainId', async (req, res) => {
    if (denyMailUser(req, res))
        return;
    const { domainId } = req.params;
    try {
        if (!(await ownedMailDomain(req, domainId)))
            return res.status(403).json({ message: 'Access denied' });
        const result = await query('SELECT * FROM mail_domain_rules WHERE domain_id = $1 ORDER BY access_type DESC, sender_pattern', [domainId]);
        res.json(result.rows);
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
router.post('/domain-rules/:domainId', async (req, res) => {
    if (denyMailUser(req, res))
        return;
    const { domainId } = req.params;
    const { senderPattern, accessType } = req.body;
    if (!senderPattern || typeof senderPattern !== 'string' || !/^[a-zA-Z0-9@._%+\-*]{1,255}$/.test(senderPattern)) {
        return res.status(400).json({ message: 'Invalid sender pattern' });
    }
    if (!['allow', 'block'].includes(accessType)) {
        return res.status(400).json({ message: 'accessType must be allow or block' });
    }
    try {
        if (!(await ownedMailDomain(req, domainId)))
            return res.status(403).json({ message: 'Access denied' });
        const result = await query(`INSERT INTO mail_domain_rules (domain_id, sender_pattern, access_type)
       VALUES ($1, $2, $3)
       ON CONFLICT (domain_id, sender_pattern) DO UPDATE SET access_type = EXCLUDED.access_type
       RETURNING *`, [domainId, senderPattern, accessType]);
        await resyncDomainMailboxes(domainId);
        res.status(201).json(result.rows[0]);
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
router.delete('/domain-rules/:domainId/:id', async (req, res) => {
    if (denyMailUser(req, res))
        return;
    const { domainId, id } = req.params;
    try {
        if (!(await ownedMailDomain(req, domainId)))
            return res.status(403).json({ message: 'Access denied' });
        await query('DELETE FROM mail_domain_rules WHERE id = $1 AND domain_id = $2', [id, domainId]);
        await resyncDomainMailboxes(domainId);
        res.json({ message: 'Domain rule deleted' });
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
// Re-sync sieve for every mailbox in a domain after a domain-rule change.
async function resyncDomainMailboxes(domainId) {
    const mailboxes = await query('SELECT id FROM mail_users WHERE domain_id = $1', [domainId]);
    for (const m of mailboxes.rows) {
        await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)', ['SYNC_SPAM_RULES', { mailUserId: m.id }]);
    }
}
// Report a quarantined message as spam (retrain Bayes) without deleting it.
router.post('/quarantine/:id/report-spam', async (req, res) => {
    const { id } = req.params;
    try {
        const qRes = await query(`
      SELECT q.id, q.file_path FROM mail_quarantine q
      JOIN mail_users mu ON q.mail_user_id = mu.id
      JOIN mail_domains md ON mu.domain_id = md.id
      WHERE q.id = $1 AND md.user_id = $2
        AND ($3::int IS NULL OR q.mail_user_id = $3)
    `, [id, req.userId, req.mailUserId ?? null]);
        if (qRes.rowCount === 0)
            return res.status(404).json({ message: 'Not found' });
        await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)', ['LEARN_SPAM', { filePath: qRes.rows[0].file_path }]);
        res.json({ message: 'Reported as spam' });
    }
    catch (err) {
        res.status(500).json({ message: err.message });
    }
});
export default router;
//# sourceMappingURL=email.js.map