import { Router } from 'express';
import { authMiddleware, requireRole } from '../middleware/auth';
import { reportService } from '../services/report.service';

export const reportRouter = Router();
reportRouter.use(authMiddleware);

// GET /api/v1/reports/product-sales?from=&to=&categoryId=&page=&size=&sortBy=&sortDir=
reportRouter.get('/product-sales', requireRole('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const data = await reportService.productSales({
      from: typeof req.query.from === 'string' ? req.query.from : undefined,
      to: typeof req.query.to === 'string' ? req.query.to : undefined,
      categoryId: typeof req.query.categoryId === 'string' ? req.query.categoryId : undefined,
      page: Math.max(1, Number(req.query.page) || 1),
      size: Math.max(1, Math.min(100, Number(req.query.size) || 20)),
      sortBy: (['revenue', 'quantity', 'profit', 'name'].includes(req.query.sortBy as string)
        ? req.query.sortBy
        : 'revenue') as 'revenue' | 'quantity' | 'profit' | 'name',
      sortDir: req.query.sortDir === 'asc' ? 'asc' : 'desc',
    });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});