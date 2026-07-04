import { PrismaClient } from '@prisma/client';
import { sqlLogger } from './logger';
import { config } from './config';

const isDev = config.nodeEnv !== 'production';

export const prisma = new PrismaClient({
  log: isDev
    ? [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'info' },
        { emit: 'event', level: 'warn' },
        { emit: 'event', level: 'error' },
      ]
    : [
        { emit: 'event', level: 'warn' },
        { emit: 'event', level: 'error' },
      ],
});

// Hook Prisma events vào log4js (category "prisma" -> sql.log + console khi dev)
if (isDev) {
  prisma.$on('query', (e: { query: string; params: string; duration: number }) => {
    sqlLogger.debug(`SQL: ${e.query} | params=${e.params} | ${e.duration}ms`);
  });
  prisma.$on('info', (e: { message: string }) => {
    sqlLogger.info(e.message);
  });
}

prisma.$on('warn', (e: { message: string }) => {
  sqlLogger.warn(e.message);
});

prisma.$on('error', (e: { message: string }) => {
  sqlLogger.error(e.message);
});