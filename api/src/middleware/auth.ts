import express from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { query } from '../db.js';

export interface AuthRequest extends express.Request {
  adminId?: number;
  userId?: number;
  mailUserId?: number;
  jti?: string;
  tokenExp?: number;
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('FATAL: JWT_SECRET environment variable is not set. Refusing to start.');
  }
  return secret;
}

/**
 * Sign a JWT that carries a unique `jti` so it can later be revoked via the
 * token_blocklist table. Use this for every login/session token.
 */
export function signSessionToken(
  payload: Record<string, unknown>,
  expiresIn: string | number,
): string {
  const options = { expiresIn } as jwt.SignOptions;
  return jwt.sign({ ...payload, jti: crypto.randomUUID() }, getJwtSecret(), options);
}

/** True if this token's jti has been revoked (logout / forced invalidation). */
async function isRevoked(jti: string | undefined): Promise<boolean> {
  if (!jti) return false;
  try {
    const r = await query('SELECT 1 FROM token_blocklist WHERE jti = $1', [jti]);
    return (r.rowCount ?? 0) > 0;
  } catch {
    // Never hard-fail auth on a blocklist lookup error.
    return false;
  }
}

export const authenticateAdmin = async (req: AuthRequest, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: 'Authorization header missing' });

  const token = authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Token missing' });

  try {
    const decoded = jwt.verify(token, getJwtSecret()) as { id: number; role: string; jti?: string; exp?: number };

    // Strict role check: only 'admin' tokens may access admin routes
    if (!decoded.role || decoded.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied: admin role required' });
    }

    if (!decoded.id || !Number.isInteger(decoded.id)) {
      return res.status(401).json({ message: 'Invalid token payload' });
    }

    if (await isRevoked(decoded.jti)) {
      return res.status(401).json({ message: 'Session has been revoked' });
    }

    req.adminId = decoded.id;
    if (decoded.jti) req.jti = decoded.jti;
    if (decoded.exp) req.tokenExp = decoded.exp;
    next();
  } catch (err) {
    res.status(401).json({ message: 'Invalid or expired token' });
  }
};

/**
 * Full hosting-client auth. ONLY accepts role 'client'.
 *
 * mail_user tokens (issued by /api/mail-auth/login from a single mailbox
 * password) must NOT satisfy this — doing so would let anyone holding one
 * mailbox password take over the entire hosting account's files, databases,
 * DNS, etc. Mailbox tokens are handled by authenticateClientOrMail on the
 * narrow set of spam/quarantine routes only.
 */
export const authenticateClient = async (req: AuthRequest, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: 'Authorization header missing' });

  const token = authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Token missing' });

  try {
    const decoded = jwt.verify(token, getJwtSecret()) as { id: number; role: string; jti?: string; exp?: number };

    if (decoded.role !== 'client') {
      return res.status(403).json({ message: 'Access denied: client role required' });
    }

    if (!decoded.id || !Number.isInteger(decoded.id)) {
      return res.status(401).json({ message: 'Invalid token payload' });
    }

    if (await isRevoked(decoded.jti)) {
      return res.status(401).json({ message: 'Session has been revoked' });
    }

    req.userId = decoded.id;
    if (decoded.jti) req.jti = decoded.jti;
    if (decoded.exp) req.tokenExp = decoded.exp;
    next();
  } catch (err) {
    res.status(401).json({ message: 'Invalid or expired token' });
  }
};

/**
 * Auth for the email/spam surface that both full clients and single-mailbox
 * users may reach. Accepts 'client' and 'mail_user'.
 *
 * For mail_user tokens, req.mailUserId identifies the one mailbox they own;
 * route handlers MUST constrain every operation to that mailbox (req.userId
 * is the owning account, used only to resolve the domain join). Full clients
 * have req.mailUserId undefined and may operate across all their mailboxes.
 */
export const authenticateClientOrMail = async (req: AuthRequest, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: 'Authorization header missing' });

  const token = authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Token missing' });

  try {
    const decoded = jwt.verify(token, getJwtSecret()) as { id: number; role: string; mailUserId?: number; jti?: string; exp?: number };

    if (decoded.role !== 'client' && decoded.role !== 'mail_user') {
      return res.status(403).json({ message: 'Access denied' });
    }

    if (!decoded.id || !Number.isInteger(decoded.id)) {
      return res.status(401).json({ message: 'Invalid token payload' });
    }

    if (await isRevoked(decoded.jti)) {
      return res.status(401).json({ message: 'Session has been revoked' });
    }

    req.userId = decoded.id;
    if (decoded.jti) req.jti = decoded.jti;
    if (decoded.exp) req.tokenExp = decoded.exp;
    if (decoded.role === 'mail_user') {
      if (!decoded.mailUserId || !Number.isInteger(decoded.mailUserId)) {
        return res.status(401).json({ message: 'Invalid token payload' });
      }
      req.mailUserId = decoded.mailUserId;
    }
    next();
  } catch (err) {
    res.status(401).json({ message: 'Invalid or expired token' });
  }
};
