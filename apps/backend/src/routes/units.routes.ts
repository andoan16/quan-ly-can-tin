import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { authMiddleware } from '../middleware/auth';

export const unitRouter = Router();
unitRouter.use(authMiddleware);

unitRouter.get('/', async (req, res, next) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;

    if (!search) {
      const items = await prisma.unit.findMany({ orderBy: { name: 'asc' } });
      res.json({ success: true, data: items });
      return;
    }

    const like = `%${search.replace(/%/g, '\\%').replace(/_/g, '\\_')}%`;
    const ids = await prisma.$queryRaw<{ id: string }[]>`
      SELECT u.id FROM units u
      WHERE unaccent(u.code) ILIKE unaccent(${like}) OR unaccent(u.name) ILIKE unaccent(${like})
      ORDER BY u.name ASC
    `;
    const items = ids.length
      ? await prisma.unit.findMany({ where: { id: { in: ids.map(i => i.id) } }, orderBy: { name: 'asc' } })
      : [];
    res.json({ success: true, data: items });
  } catch (err) {
    next(err);
  }
});