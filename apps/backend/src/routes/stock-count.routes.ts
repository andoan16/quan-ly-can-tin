import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware, requireRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { stockCountService } from '../services/stockCount.service';

const updateItemSchema = z.object({
  actualQty: z.coerce.number().nonnegative(),
});

export const stockCountRouter = Router();
stockCountRouter.use(authMiddleware);

// Tạo phiên kiểm kê mới
stockCountRouter.post('/', requireRole('ADMIN', 'MANAGER', 'WAREHOUSE'), async (req, res, next) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }
    const result = await stockCountService.create({
      note: req.body?.note,
      createdBy: userId,
    });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// Danh sách phiên kiểm kê
stockCountRouter.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const size = Math.max(1, Math.min(100, Number(req.query.size) || 20));
    const data = await stockCountService.list({ page, size });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// Chi tiết phiên kiểm kê
stockCountRouter.get('/:id', async (req, res, next) => {
  try {
    const result = await stockCountService.getById(req.params.id);
    if (!result) {
      res.status(404).json({ success: false, message: 'Không tìm thấy phiên kiểm kê' });
      return;
    }
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// Cập nhật số thực cho 1 item
stockCountRouter.patch('/:id/items/:itemId', requireRole('ADMIN', 'MANAGER', 'WAREHOUSE'), validate(updateItemSchema), async (req, res, next) => {
  try {
    const result = await stockCountService.updateItem(req.params.itemId, req.body.actualQty);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// Hoàn tất kiểm kê — cập nhật tồn kho
stockCountRouter.post('/:id/finalize', requireRole('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }
    const result = await stockCountService.finalize(req.params.id, userId);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// Xóa phiên kiểm kê
stockCountRouter.delete('/:id', requireRole('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    await stockCountService.delete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});