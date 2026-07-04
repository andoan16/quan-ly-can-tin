import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware, requireRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { feedbackService } from '../services/feedback.service';

const feedbackTypeSchema = z.enum(['BUG', 'IMPROVEMENT']);
const feedbackStatusSchema = z.enum(['NEW', 'DONE']);

const createSchema = z.object({
  type: feedbackTypeSchema,
  content: z.string().min(1, 'Nội dung không được để trống'),
  status: feedbackStatusSchema.optional(),
});

const bulkUpdateItemSchema = z.object({
  id: z.string().uuid().optional(),
  type: feedbackTypeSchema,
  content: z.string().min(1, 'Nội dung không được để trống'),
  status: feedbackStatusSchema,
});

const bulkUpdateSchema = z.object({
  items: z.array(bulkUpdateItemSchema),
});

export const feedbackRouter = Router();
feedbackRouter.use(authMiddleware);

// Lấy danh sách feedback
feedbackRouter.get('/', async (req, res, next) => {
  try {
    const data = await feedbackService.list();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// Tạo mới 1 feedback
feedbackRouter.post('/', requireRole('ADMIN', 'MANAGER', 'CASHIER', 'WAREHOUSE'), validate(createSchema), async (req, res, next) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }
    const result = await feedbackService.create(req.body, userId);
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// Cập nhật hàng loạt (lưu toàn bộ bảng)
feedbackRouter.put('/', requireRole('ADMIN', 'MANAGER', 'CASHIER', 'WAREHOUSE'), validate(bulkUpdateSchema), async (req, res, next) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }
    const result = await feedbackService.bulkUpdate(req.body, userId);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// Xóa 1 feedback
feedbackRouter.delete('/:id', requireRole('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    await feedbackService.delete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});