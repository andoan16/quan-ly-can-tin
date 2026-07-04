import { config } from './config';
import { createApp } from './app';
import { logger } from './logger';
import { prisma } from './prisma';
import type { Server } from 'http';

async function bootstrap() {
  const app = createApp();
  const server = app.listen(config.port, () => {
    logger.info(`Canteen API running at http://localhost:${config.port} [${config.nodeEnv}]`);
  });

  // Graceful shutdown — đợi connection rỗi, ngắt Prisma, thoát
  let shuttingDown = false;

  const shutdown = (signal: string) => {
    if (shuttingDown) return; // tránh gọi 2 lần
    shuttingDown = true;
    logger.info(`${signal} received — shutting down gracefully...`);

    // Timeout fallback: nếu sau 10s chưa xong, force exit
    const forceExit = setTimeout(() => {
      logger.error('Graceful shutdown timeout — force exit');
      process.exit(1);
    }, 10_000);
    forceExit.unref();

    server.close(async (err) => {
      if (err) {
        logger.error('Error closing HTTP server', err);
      } else {
        logger.info('HTTP server closed — all connections drained');
      }

      try {
        await prisma.$disconnect();
        logger.info('Prisma disconnected');
      } catch (e) {
        logger.error('Prisma disconnect error', e);
      }

      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  logger.error('Failed to start server', err);
  process.exit(1);
});