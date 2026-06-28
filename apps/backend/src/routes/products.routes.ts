import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { authMiddleware, requireRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { z } from 'zod';

const productSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  categoryId: z.preprocess((v) => v === '' ? null : v, z.string().uuid().nullable().optional()),
  unitId: z.preprocess((v) => v === '' ? null : v, z.string().uuid().nullable().optional()),
  sellingPrice: z.coerce.number().nonnegative(),
  costPrice: z.coerce.number().nonnegative(),
  currentStock: z.coerce.number().nonnegative().default(0),
  isActive: z.boolean().optional().default(true),
});

const uuidParam = z.object({ id: z.string().uuid() });

export const productRouter = Router();
productRouter.use(authMiddleware);

productRouter.get('/', async (req, res, next) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const categoryId = typeof req.query.categoryId === 'string' ? req.query.categoryId : undefined;
    const page = Math.max(1, Number(req.query.page) || 1);
    const size = Math.max(1, Math.min(100, Number(req.query.size) || 20));
    const skip = (page - 1) * size;
    const where: Prisma.ProductWhereInput = {};
    if (search) {
      where.OR = [
        { code: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (categoryId) where.categoryId = categoryId;

    const [items, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: { category: true, unit: true, unitConversions: { include: { fromUnit: true, toUnit: true } } },
        skip,
        take: size,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.product.count({ where }),
    ]);
    res.json({ success: true, data: { items, total, page, size } });
  } catch (err) {
    next(err);
  }
});

productRouter.get('/low-stock', async (_req, res, next) => {
  try {
    const items = await prisma.product.findMany({
      where: { currentStock: { lte: 10 }, isActive: true },
      include: { category: true, unit: true },
      orderBy: { currentStock: 'asc' },
    });
    res.json({ success: true, data: items });
  } catch (err) {
    next(err);
  }
});

productRouter.post('/', requireRole('ADMIN', 'MANAGER'), validate(productSchema), async (req, res, next) => {
  try {
    const item = await prisma.product.create({ data: req.body, include: { category: true, unit: true } });
    res.status(201).json({ success: true, data: item });
  } catch (err) {
    next(err);
  }
});

productRouter.patch('/:id', requireRole('ADMIN', 'MANAGER'), validate(productSchema.partial()), async (req, res, next) => {
  try {
    const { id } = uuidParam.parse(req.params);
    const item = await prisma.product.update({
      where: { id },
      data: req.body,
      include: { category: true, unit: true },
    });
    res.json({ success: true, data: item });
  } catch (err) {
    next(err);
  }
});

productRouter.delete('/:id', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const { id } = uuidParam.parse(req.params);
    await prisma.product.update({ where: { id }, data: { isActive: false } });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// --- Unit Conversion endpoints ---

const conversionSchema = z.object({
  fromUnitId: z.string().uuid(),
  toUnitId: z.string().uuid(),
  factor: z.coerce.number().positive(),
});

// GET /products/:id/conversions — lấy danh sách UnitConversion của product
productRouter.get('/:id/conversions', async (req, res, next) => {
  try {
    const { id } = uuidParam.parse(req.params);
    const items = await prisma.unitConversion.findMany({
      where: { productId: id },
      include: { fromUnit: true, toUnit: true },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ success: true, data: items });
  } catch (err) {
    next(err);
  }
});

// POST /products/:id/conversions — tạo UnitConversion mới
productRouter.post('/:id/conversions', requireRole('ADMIN', 'MANAGER'), validate(conversionSchema), async (req, res, next) => {
  try {
    const { id } = uuidParam.parse(req.params);
    const { fromUnitId, toUnitId, factor } = req.body;
    const item = await prisma.unitConversion.create({
      data: { productId: id, fromUnitId, toUnitId, factor },
      include: { fromUnit: true, toUnit: true },
    });
    res.status(201).json({ success: true, data: item });
  } catch (err) {
    next(err);
  }
});

// DELETE /products/:id/conversions/:conversionId — xóa UnitConversion
productRouter.delete('/:id/conversions/:conversionId', requireRole('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const { id, conversionId } = z.object({ id: z.string().uuid(), conversionId: z.string().uuid() }).parse(req.params);
    await prisma.unitConversion.delete({ where: { id: conversionId, productId: id } });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});