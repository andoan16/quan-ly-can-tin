import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { authMiddleware } from '../middleware/auth';

export const customerGroupRouter = Router();
customerGroupRouter.use(authMiddleware);

customerGroupRouter.get('/', async (req, res, next) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;

    if (!search) {
      const items = await prisma.customerGroup.findMany({ orderBy: { name: 'asc' } });
      res.json({ success: true, data: items });
      return;
    }

    const like = `%${search.replace(/%/g, '\\%').replace(/_/g, '\\_')}%`;
    const ids = await prisma.$queryRaw<{ id: string }[]>`
      SELECT cg.id FROM customer_groups cg
      WHERE unaccent(cg.code) ILIKE unaccent(${like}) OR unaccent(cg.name) ILIKE unaccent(${like})
      ORDER BY cg.name ASC
    `;
    const items = ids.length
      ? await prisma.customerGroup.findMany({ where: { id: { in: ids.map(i => i.id) } }, orderBy: { name: 'asc' } })
      : [];
    res.json({ success: true, data: items });
  } catch (err) {
    next(err);
  }
});