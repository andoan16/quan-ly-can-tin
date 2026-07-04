import { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import { errorLogger } from '../logger';

interface AppError extends Error {
  status?: number;
  statusCode?: number;
}

/**
 * Sanitize error message — không expose UUID, internal IDs trong production.
 * Thay UUID bằng placeholder "[ID]" để không leak thông tin nội bộ.
 */
function sanitizeMessage(msg: string): string {
  // Thay UUID (8-4-4-4-12 hex) bằng [ID]
  return msg.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '[ID]');
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  let status = 500;
  let message = 'Internal server error';

  if (err instanceof Error) {
    const appErr = err as AppError;
    status = appErr.status || appErr.statusCode || 500;
    // Only expose error details in development
    if (config.nodeEnv !== 'production' || status < 500) {
      message = appErr.message || message;
    }
  }

  // Business logic errors (throw new Error('...')) should be 400, not 500
  if (status === 500 && err instanceof Error) {
    const msg = err.message || '';
    const businessPatterns = [
      'Insufficient stock',
      'Product ',
      'not found',
      'Quantity must be',
      'Invalid payment method',
      'Bundle cần',
      'Category not found',
      'Chưa chọn người mua',
      'Số dư không đủ',
      'Lý do hủy đơn',
      'đã bị hủy',
      'đã hoàn thành',
      'Không thể hủy',
      'Không tìm thấy',
    ];
    if (businessPatterns.some((p) => msg.includes(p))) {
      status = 400;
      message = msg;
    }
  }

  // Trong production, sanitize business error messages — không expose UUID
  if (config.nodeEnv === 'production' && status < 500) {
    message = sanitizeMessage(message);
  }

  // Ghi log lỗi — lỗi 5xx ghi stack, lỗi business (4xx) chỉ ghi message
  if (status >= 500) {
    errorLogger.error(`${req.method} ${req.originalUrl} -> ${status}`, err instanceof Error ? err.stack || err.message : err);
  } else {
    errorLogger.warn(`${req.method} ${req.originalUrl} -> ${status} ${message}`);
  }

  res.status(status).json({ success: false, message });
}