import { Router } from 'express';
import { prisma } from '../prisma';
import { authMiddleware, requireRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { z } from 'zod';

const createSchema = z.object({
  code: z.string().min(1),
  fullName: z.string().min(1),
  groupId: z.string().uuid().optional(),
  phone: z.string().optional(),
  isActive: z.boolean().optional().default(true),
});

const uuidParam = z.object({ id: z.string().uuid() });

export const customerRouter = Router();
customerRouter.use(authMiddleware);

customerRouter.get('/', async (req, res, next) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const page = Math.max(1, Number(req.query.page) || 1);
    const size = Math.max(1, Math.min(100, Number(req.query.size) || 20));
    const skip = (page - 1) * size;
    const where = search
      ? {
          OR: [
            { code: { contains: search, mode: 'insensitive' as const } },
            { fullName: { contains: search, mode: 'insensitive' as const } },
            { phone: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};
    const [items, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        include: { group: true },
        skip,
        take: size,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.customer.count({ where }),
    ]);
    res.json({ success: true, data: { items, total, page, size } });
  } catch (err) {
    next(err);
  }
});

customerRouter.post('/', requireRole('ADMIN', 'MANAGER'), validate(createSchema), async (req, res, next) => {
  try {
    const item = await prisma.customer.create({ data: req.body, include: { group: true } });
    res.status(201).json({ success: true, data: item });
  } catch (err) {
    next(err);
  }
});

customerRouter.patch('/:id', requireRole('ADMIN', 'MANAGER'), validate(createSchema.partial()), async (req, res, next) => {
  try {
    const { id } = uuidParam.parse(req.params);
    const item = await prisma.customer.update({
      where: { id },
      data: req.body,
      include: { group: true },
    });
    res.json({ success: true, data: item });
  } catch (err) {
    next(err);
  }
});

customerRouter.delete('/:id', requireRole('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const { id } = uuidParam.parse(req.params);
    // Soft delete for consistency with products
    await prisma.customer.update({ where: { id }, data: { isActive: false } });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});