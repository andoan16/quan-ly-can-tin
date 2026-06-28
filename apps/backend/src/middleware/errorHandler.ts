import { Request, Response, NextFunction } from 'express';
import { config } from '../config';

interface AppError extends Error {
  status?: number;
  statusCode?: number;
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  let status = 500;
  let message = 'Internal server error';

  if (err instanceof Error) {
    const appErr = err as AppError;
    status = appErr.status || appErr.statusCode || 500;
    // Only expose error details in development
    if (config.nodeEnv !== 'production' || status < 500) {
      message = appErr.message || message;
    }
  }

  res.status(status).json({ success: false, message });
}