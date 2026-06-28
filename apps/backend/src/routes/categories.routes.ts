import { Router } from 'express';
import { prisma } from '../prisma';
import { authMiddleware } from '../middleware/auth';

export const categoryRouter = Router();
categoryRouter.use(authMiddleware);

categoryRouter.get('/', async (_req, res, next) => {
  try {
    const items = await prisma.category.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
    res.json({ success: true, data: items });
  } catch (err) {
    next(err);
  }
});