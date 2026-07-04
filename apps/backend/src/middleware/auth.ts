import { Request, Response, NextFunction } from 'express';
import * as jwt from 'jsonwebtoken';
import { config } from '../config';
import { logger } from '../logger';

export interface AuthRequest extends Request {
  user?: { userId: string; username: string; role: string };
}

// Augment Express Request to include `user` property
declare global {
  namespace Express {
    interface Request {
      user?: { userId: string; username: string; role: string };
    }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    logger.warn(`Auth 401: ${req.method} ${req.originalUrl} — missing/invalid Bearer header`);
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }
  const token = header.split(' ')[1];
  try {
    const payload = jwt.verify(token, config.jwtSecret) as { userId: string; username: string; role: string };
    req.user = payload;
    next();
  } catch {
    logger.warn(`Auth 401: ${req.method} ${req.originalUrl} — invalid/expired token`);
    res.status(401).json({ message: 'Invalid token' });
  }
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      logger.warn(`Auth 403: ${req.method} ${req.originalUrl} — role "${req.user?.role || 'none'}" not in [${roles.join(',')}] (user=${req.user?.username || 'unknown'})`);
      res.status(403).json({ message: 'Forbidden' });
      return;
    }
    next();
  };
}