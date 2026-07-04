import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';
import { logger } from '../logger';

export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      logger.warn(`Validation failed: ${req.method} ${req.originalUrl} — ${JSON.stringify(result.error.flatten().fieldErrors)}`);
      res.status(400).json({ message: 'Validation error', errors: result.error.flatten() });
      return;
    }
    req.body = result.data;
    next();
  };
}