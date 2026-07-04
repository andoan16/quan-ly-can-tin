import { Router } from 'express';
import { authMiddleware, requireRole } from '../middleware/auth';
import { reportService } from '../services/report.service';
import { logger } from '../logger';

export const reportRouter = Router();
reportRouter.use(authMiddleware);

// GET /api/v1/reports/product-sales?from=&to=&categoryId=&page=&size=&sortBy=&sortDir=
reportRouter.get('/product-sales', requireRole('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const { from, to } = req.query;
    // Validate date params
    if (typeof from === 'string' && isNaN(Date.parse(from))) {
      res.status(400).json({ success: false, message: 'Invalid "from" date format. Use YYYY-MM-DD.' });
      return;
    }
    if (typeof to === 'string' && isNaN(Date.parse(to))) {
      res.status(400).json({ success: false, message: 'Invalid "to" date format. Use YYYY-MM-DD.' });
      return;
    }
    const data = await reportService.productSales({
      from: typeof req.query.from === 'string' ? req.query.from : undefined,
      to: typeof req.query.to === 'string' ? req.query.to : undefined,
      categoryId: typeof req.query.categoryId === 'string' ? req.query.categoryId : undefined,
      page: Math.max(1, Number(req.query.page) || 1),
      size: Math.max(1, Math.min(100, Number(req.query.size) || 20)),
      sortBy: (['revenue', 'quantity', 'profit', 'productName'].includes(req.query.sortBy as string)
        ? req.query.sortBy
        : 'revenue') as 'revenue' | 'quantity' | 'profit' | 'productName',
      sortDir: req.query.sortDir === 'asc' ? 'asc' : 'desc',
    });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// ── Saved reports (persist snapshots) ──────────────────────────────────────

// POST /api/v1/reports/saved — save current report as snapshot
reportRouter.post('/saved', requireRole('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const { name, from, to, categoryId } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ success: false, message: 'name is required' });
      return;
    }
    const report = await reportService.saveReport({
      name: name.trim(),
      from: from || undefined,
      to: to || undefined,
      categoryId: categoryId || undefined,
      createdBy: req.user!.userId,
    });
    logger.info(`Report saved: id=${report.id} name="${name.trim()}" by=${req.user?.username}`);
    res.status(201).json({ success: true, data: report });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/reports/saved — list saved reports
reportRouter.get('/saved', requireRole('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const size = Math.max(1, Math.min(100, Number(req.query.size) || 20));
    const data = await reportService.listReports(page, size);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/reports/saved/:id — get a saved report with items
reportRouter.get('/saved/:id', requireRole('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const report = await reportService.getReport(req.params.id);
    if (!report) {
      res.status(404).json({ success: false, message: 'Report not found' });
      return;
    }
    res.json({ success: true, data: report });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/reports/saved/:id — delete a saved report
reportRouter.delete('/saved/:id', requireRole('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    await reportService.deleteReport(req.params.id);
    logger.info(`Report deleted: id=${req.params.id} by=${req.user?.username}`);
    res.json({ success: true, message: 'Deleted' });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/reports/daily-sales?from=&to= — báo cáo doanh thu theo ngày
reportRouter.get('/daily-sales', requireRole('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const { from, to } = req.query;
    if (typeof from === 'string' && isNaN(Date.parse(from))) {
      res.status(400).json({ success: false, message: 'Invalid "from" date format. Use YYYY-MM-DD.' });
      return;
    }
    if (typeof to === 'string' && isNaN(Date.parse(to))) {
      res.status(400).json({ success: false, message: 'Invalid "to" date format. Use YYYY-MM-DD.' });
      return;
    }
    const data = await reportService.dailySales({
      from: typeof from === 'string' ? from : undefined,
      to: typeof to === 'string' ? to : undefined,
    });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});