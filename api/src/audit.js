import { query } from './db.js';
/**
 * Record a mutating action in the audit_log. Never throws — auditing must not
 * break the request it is recording. Call AFTER the action succeeds.
 */
export async function logAudit(req, action, opts = {}) {
    try {
        const actorRole = req.adminId ? 'admin' : req.mailUserId ? 'mail_user' : req.userId ? 'client' : 'system';
        const actorId = req.adminId ?? req.userId ?? null;
        const ip = req.ip ?? req.socket?.remoteAddress ?? null;
        await query(`INSERT INTO audit_log (actor_id, actor_role, actor_name, action, target_type, target_id, ip_address, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [
            actorId,
            actorRole,
            req.actorName ?? null,
            action,
            opts.targetType ?? null,
            opts.targetId != null ? String(opts.targetId) : null,
            ip,
            JSON.stringify(opts.metadata ?? {}),
        ]);
    }
    catch (err) {
        console.error('audit log write failed:', err.message);
    }
}
/**
 * Revoke the current request's session token by inserting its jti into the
 * blocklist until its natural expiry. Used by logout endpoints.
 */
export async function revokeCurrentToken(req) {
    if (!req.jti)
        return;
    const expiresAt = req.tokenExp ? new Date(req.tokenExp * 1000) : new Date(Date.now() + 24 * 60 * 60 * 1000);
    await query(`INSERT INTO token_blocklist (jti, expires_at) VALUES ($1, $2)
     ON CONFLICT (jti) DO NOTHING`, [req.jti, expiresAt]);
}
//# sourceMappingURL=audit.js.map