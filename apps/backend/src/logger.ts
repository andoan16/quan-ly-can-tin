import log4js from 'log4js';
import { config } from './config';

const isDev = config.nodeEnv !== 'production';
const logLevel = isDev ? 'debug' : 'info';

log4js.configure({
  appenders: {
    // Console với màu sắc — tiện khi dev
    console: {
      type: 'console',
      layout: { type: 'pattern', pattern: '%[%d{yyyy-MM-dd hh:mm:ss.SSS} [%p] %c -%] %m' },
    },
    // File log tổng của ứng dụng
    appFile: {
      type: 'dateFile',
      filename: 'logs/app.log',
      pattern: 'yyyy-MM-dd',
      alwaysIncludePattern: true,
      keepFileExt: true,
      numBackups: 14,
      layout: { type: 'pattern', pattern: '%d{yyyy-MM-dd hh:mm:ss.SSS} [%p] %c - %m' },
    },
    // File log riêng cho SQL (Prisma query) — dễ truy tìm
    sqlFile: {
      type: 'dateFile',
      filename: 'logs/sql.log',
      pattern: 'yyyy-MM-dd',
      alwaysIncludePattern: true,
      keepFileExt: true,
      numBackups: 14,
      layout: { type: 'pattern', pattern: '%d{yyyy-MM-dd hh:mm:ss.SSS} [%p] %c - %m' },
    },
    // File log riêng cho lỗi
    errorFile: {
      type: 'dateFile',
      filename: 'logs/error.log',
      pattern: 'yyyy-MM-dd',
      alwaysIncludePattern: true,
      keepFileExt: true,
      numBackups: 30,
      layout: { type: 'pattern', pattern: '%d{yyyy-MM-dd hh:mm:ss.SSS} [%p] %c - %m' },
    },
    // Filter route error -> errorFile
    errorFilter: { type: 'logLevelFilter', appender: 'errorFile', level: 'error' },
    // Filter SQL -> sqlFile
    sqlFilter: { type: 'categoryFilter', appender: 'sqlFile', category: 'prisma' },
  },
  categories: {
    // Category riêng cho Prisma/SQL — chỉ ghi ra sqlFile + console khi dev
    prisma: {
      appenders: isDev ? ['sqlFile', 'console'] : ['sqlFile'],
      level: logLevel,
    },
    // Category mặc định — app log + error log + console
    default: {
      appenders: isDev ? ['console', 'appFile', 'errorFilter'] : ['appFile', 'errorFilter'],
      level: logLevel,
    },
  },
});

export const logger = log4js.getLogger('app');
export const sqlLogger = log4js.getLogger('prisma');
export const httpLogger = log4js.getLogger('http');
export const errorLogger = log4js.getLogger('error');

// Graceful shutdown cho log4js
process.on('SIGTERM', () => {
  log4js.shutdown(() => process.exit(0));
});
process.on('SIGINT', () => {
  log4js.shutdown(() => process.exit(0));
});

export default log4js;