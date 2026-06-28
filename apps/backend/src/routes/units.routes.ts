import { Router } from 'express';
import { prisma } from '../prisma';
import { authMiddleware } from '../middleware/auth';

export const unitRouter = Router();
unitRouter.use(authMiddleware);

unitRouter.get('/', async (_req, res, next) => {
  try {
    const items = await prisma.unit.findMany({ orderBy: { name: 'asc' } });
    res.json({ success: true, data: items });
  } catch (err) {
    next(err);
  }
});