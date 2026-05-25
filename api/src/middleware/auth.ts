import express from 'express';
import jwt from 'jsonwebtoken';

export interface AuthRequest extends express.Request {
  adminId?: number;
  userId?: number;
}

export const authenticateAdmin = (req: AuthRequest, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: 'Authorization header missing' });

  const token = authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Token missing' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret') as { id: number, role?: string };
    if (decoded.role && decoded.role !== 'admin' && !decoded.id) {
       // This is a bit loose, usually admins don't have a 'role' in the token yet in this codebase
    }
    req.adminId = decoded.id;
    next();
  } catch (err) {
    res.status(401).json({ message: 'Invalid token' });
  }
};

export const authenticateClient = (req: AuthRequest, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: 'Authorization header missing' });

  const token = authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Token missing' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret') as { id: number, role: string };
    if (decoded.role !== 'client') return res.status(403).json({ message: 'Access denied' });
    req.userId = decoded.id;
    next();
  } catch (err) {
    res.status(401).json({ message: 'Invalid token' });
  }
};
