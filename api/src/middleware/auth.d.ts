import express from 'express';
export interface AuthRequest extends express.Request {
    adminId?: number;
    userId?: number;
    mailUserId?: number;
    jti?: string;
    tokenExp?: number;
}
/**
 * Sign a JWT that carries a unique `jti` so it can later be revoked via the
 * token_blocklist table. Use this for every login/session token.
 */
export declare function signSessionToken(payload: Record<string, unknown>, expiresIn: string | number): string;
export declare const authenticateAdmin: (req: AuthRequest, res: express.Response, next: express.NextFunction) => Promise<express.Response<any, Record<string, any>> | undefined>;
/**
 * Full hosting-client auth. ONLY accepts role 'client'.
 *
 * mail_user tokens (issued by /api/mail-auth/login from a single mailbox
 * password) must NOT satisfy this — doing so would let anyone holding one
 * mailbox password take over the entire hosting account's files, databases,
 * DNS, etc. Mailbox tokens are handled by authenticateClientOrMail on the
 * narrow set of spam/quarantine routes only.
 */
export declare const authenticateClient: (req: AuthRequest, res: express.Response, next: express.NextFunction) => Promise<express.Response<any, Record<string, any>> | undefined>;
/**
 * Auth for the email/spam surface that both full clients and single-mailbox
 * users may reach. Accepts 'client' and 'mail_user'.
 *
 * For mail_user tokens, req.mailUserId identifies the one mailbox they own;
 * route handlers MUST constrain every operation to that mailbox (req.userId
 * is the owning account, used only to resolve the domain join). Full clients
 * have req.mailUserId undefined and may operate across all their mailboxes.
 */
export declare const authenticateClientOrMail: (req: AuthRequest, res: express.Response, next: express.NextFunction) => Promise<express.Response<any, Record<string, any>> | undefined>;
//# sourceMappingURL=auth.d.ts.map