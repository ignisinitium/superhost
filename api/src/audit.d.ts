import type { AuthRequest } from './middleware/auth.js';
/**
 * Record a mutating action in the audit_log. Never throws — auditing must not
 * break the request it is recording. Call AFTER the action succeeds.
 */
export declare function logAudit(req: AuthRequest, action: string, opts?: {
    targetType?: string;
    targetId?: string | number;
    metadata?: Record<string, unknown>;
}): Promise<void>;
/**
 * Revoke the current request's session token by inserting its jti into the
 * blocklist until its natural expiry. Used by logout endpoints.
 */
export declare function revokeCurrentToken(req: AuthRequest): Promise<void>;
//# sourceMappingURL=audit.d.ts.map