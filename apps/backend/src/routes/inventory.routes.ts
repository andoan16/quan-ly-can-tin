import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { InventoryTransactionType } from '@prisma/client';
import { authMiddleware, requireRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { z } from 'zod';
import { inventoryService } from '../services/inventory.service';

const VALID_TRANSACTION_TYPES = Object.values(InventoryTransactionType);

const stockInSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.coerce.number().positive(),
  unitCost: z.coerce.number().nonnegative().optional(),
  referenceNo: z.string().optional(),
  reason: z.string().optional(),
});

const stockOutSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.coerce.number().positive(),
  referenceNo: z.string().optional(),
  reason: z.string().min(1),
});

const adjustSchema = z.object({
  productId: z.string().uuid(),
  newStock: z.coerce.number().nonnegative(),
  reason: z.string().min(1),
});

export const inventoryRouter = Router();
inventoryRouter.use(authMiddleware);

inventoryRouter.get('/transactions', async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const size = Math.max(1, Math.min(100, Number(req.query.size) || 20));
    const productId = typeof req.query.productId === 'string' ? req.query.productId : undefined;
    const type = typeof req.query.type === 'string' ? req.query.type : undefined;
    if (type && !VALID_TRANSACTION_TYPES.includes(type as InventoryTransactionType)) {
      res.status(400).json({ message: `Invalid type. Must be one of: ${VALID_TRANSACTION_TYPES.join(', ')}` });
      return;
    }
    const data = await inventoryService.listTransactions({ page, size, productId, type });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

inventoryRouter.post('/stock-in', requireRole('ADMIN', 'MANAGER', 'WAREHOUSE'), validate(stockInSchema), async (req, res, next) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }
    const trx = await inventoryService.stockIn({ ...req.body, createdBy: userId });
    res.status(201).json({ success: true, data: trx });
  } catch (err) {
    next(err);
  }
});

inventoryRouter.post('/stock-out', requireRole('ADMIN', 'MANAGER', 'WAREHOUSE'), validate(stockOutSchema), async (req, res, next) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }
    const trx = await inventoryService.stockOut({ ...req.body, createdBy: userId });
    res.status(201).json({ success: true, data: trx });
  } catch (err) {
    next(err);
  }
});

inventoryRouter.post('/adjust', requireRole('ADMIN', 'MANAGER'), validate(adjustSchema), async (req, res, next) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }
    const trx = await inventoryService.adjust({ ...req.body, createdBy: userId });
    res.status(201).json({ success: true, data: trx });
  } catch (err) {
    next(err);
  }
});