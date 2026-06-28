import { Router } from 'express';
import { prisma } from '../prisma';
import { authMiddleware } from '../middleware/auth';

export const customerGroupRouter = Router();
customerGroupRouter.use(authMiddleware);

customerGroupRouter.get('/', async (_req, res, next) => {
  try {
    const items = await prisma.customerGroup.findMany({ orderBy: { name: 'asc' } });
    res.json({ success: true, data: items });
  } catch (err) {
    next(err);
  }
});