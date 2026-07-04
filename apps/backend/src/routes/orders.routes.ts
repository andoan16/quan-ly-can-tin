import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware, requireRole } from '../middleware/auth';
import { createOrderSchema } from '../schemas/order.schema';
import { validate } from '../middleware/validate';
import { orderService } from '../services/order.service';

const cancelSchema = z.object({
  reason: z.string().min(1, 'Lý do hủy đơn là bắt buộc').max(500),
});

export const orderRouter = Router();
orderRouter.use(authMiddleware);

orderRouter.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const size = Math.max(1, Math.min(100, Number(req.query.size) || 20));
    const from = typeof req.query.from === 'string' ? req.query.from : undefined;
    const to = typeof req.query.to === 'string' ? req.query.to : undefined;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    // Validate date params
    if (from && isNaN(Date.parse(from))) {
      res.status(400).json({ success: false, message: 'Invalid "from" date format. Use YYYY-MM-DD.' });
      return;
    }
    if (to && isNaN(Date.parse(to))) {
      res.status(400).json({ success: false, message: 'Invalid "to" date format. Use YYYY-MM-DD.' });
      return;
    }
    if (status && !['COMPLETED', 'CANCELLED'].includes(status)) {
      res.status(400).json({ success: false, message: 'Invalid status. Must be COMPLETED or CANCELLED.' });
      return;
    }
    const data = await orderService.list({ page, size, from, to, status, search });
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

// Hủy/hoàn đơn hàng
orderRouter.post('/:id/cancel', requireRole('ADMIN', 'MANAGER'), validate(cancelSchema), async (req, res, next) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }
    const order = await orderService.cancel({
      orderId: req.params.id,
      cancelledBy: userId,
      reason: req.body.reason,
    });
    res.json({ success: true, data: order });
  } catch (err) {
    next(err);
  }
});