import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { authMiddleware, requireRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { z } from 'zod';
import { logger } from '../logger';

const categorySchema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(100),
  prefix: z.string().min(1).max(10).regex(/^[A-Z0-9]+$/, 'Prefix chỉ chứa chữ HOA và số'),
  note: z.string().optional(),
  isActive: z.boolean().optional().default(true),
});

const uuidParam = z.object({ id: z.string().uuid() });

export const categoryRouter = Router();
categoryRouter.use(authMiddleware);

// GET /categories — list all (with optional search)
categoryRouter.get('/', async (req, res, next) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;

    if (!search) {
      const items = await prisma.category.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
      res.json({ success: true, data: items });
      return;
    }

    const like = `%${search.replace(/%/g, '\\%').replace(/_/g, '\\_')}%`;
    const ids = await prisma.$queryRaw<{ id: string }[]>`
      SELECT c.id FROM categories c
      WHERE c."isActive" = true
        AND (unaccent(c.code) ILIKE unaccent(${like}) OR unaccent(c.name) ILIKE unaccent(${like}) OR unaccent(c.prefix) ILIKE unaccent(${like}))
      ORDER BY c.name ASC
    `;
    const items = ids.length
      ? await prisma.category.findMany({ where: { id: { in: ids.map(i => i.id) } }, orderBy: { name: 'asc' } })
      : [];
    res.json({ success: true, data: items });
  } catch (err) {
    next(err);
  }
});

// GET /categories/all — list all including inactive
categoryRouter.get('/all', async (_req, res, next) => {
  try {
    const items = await prisma.category.findMany({ orderBy: { name: 'asc' } });
    res.json({ success: true, data: items });
  } catch (err) {
    next(err);
  }
});

// POST /categories — create
categoryRouter.post('/', requireRole('ADMIN', 'MANAGER'), validate(categorySchema), async (req, res, next) => {
  try {
    const item = await prisma.category.create({ data: req.body });
    logger.info(`Category created: id=${item.id} code="${item.code}" name="${item.name}" by=${req.user?.username}`);
    res.status(201).json({ success: true, data: item });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      res.status(409).json({ message: 'Mã hoặc prefix đã tồn tại' });
      return;
    }
    next(err);
  }
});

// PATCH /categories/:id — update
categoryRouter.patch('/:id', requireRole('ADMIN', 'MANAGER'), validate(categorySchema.partial()), async (req, res, next) => {
  try {
    const { id } = uuidParam.parse(req.params);
    const item = await prisma.category.update({ where: { id }, data: req.body });
    logger.info(`Category updated: id=${id} by=${req.user?.username}`);
    res.json({ success: true, data: item });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      res.status(409).json({ message: 'Mã hoặc prefix đã tồn tại' });
      return;
    }
    next(err);
  }
});

// DELETE /categories/:id — deactivate
categoryRouter.delete('/:id', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const { id } = uuidParam.parse(req.params);
    await prisma.category.update({ where: { id }, data: { isActive: false } });
    logger.info(`Category deactivated (soft delete): id=${id} by=${req.user?.username}`);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});