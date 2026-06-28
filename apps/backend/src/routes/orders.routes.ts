import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { authMiddleware, requireRole } from '../middleware/auth';
import { createOrderSchema } from '../schemas/order.schema';
import { validate } from '../middleware/validate';
import { orderService } from '../services/order.service';

export const orderRouter = Router();
orderRouter.use(authMiddleware);

orderRouter.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const size = Math.max(1, Math.min(100, Number(req.query.size) || 20));
    const from = typeof req.query.from === 'string' ? req.query.from : undefined;
    const to = typeof req.query.to === 'string' ? req.query.to : undefined;
    const data = await orderService.list({ page, size, from, to });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

orderRouter.get('/:id', async (req, res, next) => {
  try {
    const order = await orderService.getById(req.params.id);
    res.json({ success: true, data: order });
  } catch (err) {
    next(err);
  }
});

orderRouter.post('/', requireRole('ADMIN', 'MANAGER', 'CASHIER'), validate(createOrderSchema), async (req, res, next) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }
    const order = await orderService.create({ ...req.body, cashierId: userId });
    res.status(201).json({ success: true, data: order });
  } catch (err) {
    next(err);
  }
});