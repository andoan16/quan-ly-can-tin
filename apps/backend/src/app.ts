import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import { authRouter } from './routes/auth.routes';
import { customerRouter } from './routes/customers.routes';
import { customerGroupRouter } from './routes/customer-groups.routes';
import { productRouter } from './routes/products.routes';
import { categoryRouter } from './routes/categories.routes';
import { unitRouter } from './routes/units.routes';
import { orderRouter } from './routes/orders.routes';
import { inventoryRouter } from './routes/inventory.routes';
import { reportRouter } from './routes/reports.routes';
import { stockCountRouter } from './routes/stock-count.routes';
import { feedbackRouter } from './routes/feedback.routes';
import { errorHandler } from './middleware/errorHandler';
import { httpLogger } from './logger';

// HTTP request logger middleware — ghi method, path, status code, thời gian xử lý
export function requestLogger(req: express.Request, res: express.Response, next: express.NextFunction) {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    httpLogger.log(level, `${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`);
  });
  next();
}

export function createApp() {
  const app = express();

  // Railway proxy gửi X-Forwarded-For — cần trust proxy để express-rate-limit
  // xác định IP đúng và không throw ValidationError
  app.set('trust proxy', 1);

  app.use(requestLogger);
  app.use(cors({ origin: config.allowedOrigins, credentials: true }));

  // Body size limit — chống DoS bằng payload lớn
  app.use(express.json({ limit: '256kb' }));

  // Rate limiting toàn cục — 200 req/phút/IP
  const apiLimiter = rateLimit({
    windowMs: 60_000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Quá nhiều yêu cầu. Vui lòng thử lại sau.' },
  });
  app.use('/api/', apiLimiter);

  // Rate limiting cho login — 5 lần/phút/IP (chống brute force)
  const loginLimiter = rateLimit({
    windowMs: 60_000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Quá nhiều lần đăng nhập thất bại. Vui lòng thử lại sau 1 phút.' },
  });

  // Health check — Railway healthcheck path /api/v1/health
  app.get('/health', (_req, res) => res.json({ ok: true }));
  app.get('/api/v1/health', (_req, res) => res.json({ ok: true }));

  app.use('/api/v1/auth', loginLimiter, authRouter);
  app.use('/api/v1/customer-groups', customerGroupRouter);
  app.use('/api/v1/customers', customerRouter);
  app.use('/api/v1/categories', categoryRouter);
  app.use('/api/v1/products', productRouter);
  app.use('/api/v1/units', unitRouter);
  app.use('/api/v1/orders', orderRouter);
  app.use('/api/v1/inventory', inventoryRouter);
  app.use('/api/v1/reports', reportRouter);
  app.use('/api/v1/stock-counts', stockCountRouter);
  app.use('/api/v1/feedback', feedbackRouter);

  app.use(errorHandler);

  return app;
}