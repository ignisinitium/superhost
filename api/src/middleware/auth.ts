import express from 'express';
import jwt from 'jsonwebtoken';

export interface AuthRequest extends express.Request {
  adminId?: number;
  userId?: number;
  mailUserId?: number;
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('FATAL: JWT_SECRET environment variable is not set. Refusing to start.');
  }
  return secret;
}

export const authenticateAdmin = (req: AuthRequest, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: 'Authorization header missing' });

  const token = authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Token missing' });

  try {
    const decoded = jwt.verify(token, getJwtSecret()) as { id: number; role: string };

    // Strict role check: only 'admin' tokens may access admin routes
    if (!decoded.role || decoded.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied: admin role required' });
    }

    if (!decoded.id || !Number.isInteger(decoded.id)) {
      return res.status(401).json({ message: 'Invalid token payload' });
    }

    req.adminId = decoded.id;
    next();
  } catch (err) {
    res.status(401).json({ message: 'Invalid or expired token' });
  }
};

export const authenticateClient = (req: AuthRequest, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: 'Authorization header missing' });

  const token = authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Token missing' });

  try {
    const decoded = jwt.verify(token, getJwtSecret()) as { id: number; role: string; mailUserId?: number };

    if (!decoded.role || (decoded.role !== 'client' && decoded.role !== 'mail_user')) {
      return res.status(403).json({ message: 'Access denied: client role required' });
    }

    if (!decoded.id || !Number.isInteger(decoded.id)) {
      return res.status(401).json({ message: 'Invalid token payload' });
    }

    req.userId = decoded.id;
    if (decoded.mailUserId) req.mailUserId = decoded.mailUserId;
    next();
  } catch (err) {
    res.status(401).json({ message: 'Invalid or expired token' });
  }
};
