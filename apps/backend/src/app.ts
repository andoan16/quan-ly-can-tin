import express from 'express';
import cors from 'cors';
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
import { errorHandler } from './middleware/errorHandler';

export function createApp() {
  const app = express();

  app.use(cors({ origin: config.allowedOrigins, credentials: true }));
  app.use(express.json());

  app.get('/health', (_req, res) => res.json({ ok: true }));

  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/customer-groups', customerGroupRouter);
  app.use('/api/v1/customers', customerRouter);
  app.use('/api/v1/categories', categoryRouter);
  app.use('/api/v1/products', productRouter);
  app.use('/api/v1/units', unitRouter);
  app.use('/api/v1/orders', orderRouter);
  app.use('/api/v1/inventory', inventoryRouter);
  app.use('/api/v1/reports', reportRouter);

  app.use(errorHandler);

  return app;
}