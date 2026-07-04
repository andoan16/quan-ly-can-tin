import { Router } from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { prisma } from '../prisma';
import { authMiddleware, requireRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { z } from 'zod';
import { searchCustomers } from '../utils/unaccent';
import { logger } from '../logger';

// Multer: parse file upload từ form-data (memory storage — không ghi đĩa)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB — đủ cho 200+ dòng Excel
});

const createSchema = z.object({
  code: z.string().min(1),
  fullName: z.string().min(1),
  groupId: z.string().uuid().optional(),
  phone: z.string().optional(),
  isActive: z.boolean().optional().default(true),
});

const uuidParam = z.object({ id: z.string().uuid() });

// Schema nạp tiền
const topupSchema = z.object({
  amount: z.number().positive('Số tiền nạp phải > 0'),
  receivedFrom: z.string().optional(), // tên người thân gửi
  note: z.string().optional(),
});

// Schema điều chỉnh số dư (admin)
const adjustBalanceSchema = z.object({
  amount: z.number(), // có thể âm để trừ
  note: z.string().optional(),
});

export const customerRouter = Router();
customerRouter.use(authMiddleware);

customerRouter.get('/', async (req, res, next) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const page = Math.max(1, Number(req.query.page) || 1);
    const size = Math.max(1, Math.min(100, Number(req.query.size) || 20));

    const result = await searchCustomers({ search, page, size });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

customerRouter.post('/', requireRole('ADMIN', 'MANAGER'), validate(createSchema), async (req, res, next) => {
  try {
    const item = await prisma.customer.create({ data: req.body, include: { group: true } });
    logger.info(`Customer created: id=${item.id} code="${item.code}" name="${item.fullName}" by=${req.user?.username}`);
    res.status(201).json({ success: true, data: item });
  } catch (err) {
    next(err);
  }
});

customerRouter.patch('/:id', requireRole('ADMIN', 'MANAGER'), validate(createSchema.partial()), async (req, res, next) => {
  try {
    const { id } = uuidParam.parse(req.params);
    const item = await prisma.customer.update({
      where: { id },
      data: req.body,
      include: { group: true },
    });
    logger.info(`Customer updated: id=${id} by=${req.user?.username}`);
    res.json({ success: true, data: item });
  } catch (err) {
    next(err);
  }
});

customerRouter.delete('/:id', requireRole('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const { id } = uuidParam.parse(req.params);
    // Soft delete for consistency with products
    await prisma.customer.update({ where: { id }, data: { isActive: false } });
    logger.info(`Customer deactivated (soft delete): id=${id} by=${req.user?.username}`);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ── Nạp tiền vào tài khoản ──────────────────────────────
// POST /customers/:id/topup
customerRouter.post('/:id/topup', requireRole('ADMIN', 'MANAGER', 'CASHIER'), validate(topupSchema), async (req, res, next) => {
  try {
    const { id } = uuidParam.parse(req.params);
    const { amount, receivedFrom, note } = req.body;
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const result = await prisma.$transaction(async (tx) => {
      const customer = await tx.customer.findUniqueOrThrow({ where: { id } });
      const balanceBefore = Number(customer.balance);
      const balanceAfter = Math.round((balanceBefore + Number(amount)) * 100) / 100;

      await tx.customer.update({ where: { id }, data: { balance: balanceAfter } });
      const topup = await tx.topupTransaction.create({
        data: {
          customerId: id,
          amount: Number(amount),
          balanceBefore,
          balanceAfter,
          receivedFrom: receivedFrom || null,
          note: note || null,
          createdBy: userId,
        },
        include: { customer: true, createdByUser: { select: { id: true, fullName: true } } },
      });

      return topup;
    });

    logger.info(`Topup: customer=${id} amount=${amount} before=${result.balanceBefore} after=${result.balanceAfter} by=${req.user?.username}`);
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// POST /customers/import — import hàng loạt từ file xlsx
// Cột Excel: mã | họ tên | sđt | hoạt động (true/false, mặc định true)
customerRouter.post('/import', requireRole('ADMIN', 'MANAGER'), upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ message: 'Vui lòng chọn file xlsx' });
      return;
    }

    // Parse file Excel
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws) {
      res.status(400).json({ message: 'File Excel không có sheet nào' });
      return;
    }

    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
    if (rows.length === 0) {
      res.status(400).json({ message: 'File Excel không có dữ liệu' });
      return;
    }

    // Map hàng → object chuẩn hoá
    interface CustomerRow {
      code: string;
      fullName: string;
      phone?: string;
      isActive: boolean;
    }
    const mapped: CustomerRow[] = [];
    const errors: { row: number; message: string }[] = [];

    rows.forEach((row, idx) => {
      const lineNo = idx + 2; // dòng 1 là header
      // Hỗ trợ header tiếng Việt hoặc tiếng Anh
      const code = String(row['mã'] ?? row['code'] ?? row['ma'] ?? '').trim();
      const fullName = String(row['họ tên'] ?? row['fullName'] ?? row['ho ten'] ?? row['ten'] ?? '').trim();
      const phone = String(row['sđt'] ?? row['phone'] ?? row['sdt'] ?? '').trim();
      const activeRaw = row['hoạt động'] ?? row['isActive'] ?? row['hoat dong'] ?? '';
      const isActive = activeRaw === '' ? true : ['true', '1', 'yes', 'có', 'true ', 'True'].includes(String(activeRaw).toLowerCase().trim());

      if (!code) {
        errors.push({ row: lineNo, message: 'Thiếu mã người mua' });
        return;
      }
      if (!fullName) {
        errors.push({ row: lineNo, message: 'Thiếu họ tên' });
        return;
      }
      mapped.push({ code, fullName, phone: phone || undefined, isActive });
    });

    if (mapped.length === 0) {
      res.status(400).json({
        success: false,
        message: 'Không có dòng hợp lệ để import',
        errors,
      });
      return;
    }

    // Upsert theo code (tồn tại → update, chưa có → create)
    const result = await prisma.$transaction(async (tx) => {
      const existingCodes = await tx.customer.findMany({
        where: { code: { in: mapped.map((r) => r.code) } },
        select: { id: true, code: true },
      });
      const existingMap = new Map(existingCodes.map((c) => [c.code, c.id]));

      let created = 0;
      let updated = 0;

      for (const row of mapped) {
        if (existingMap.has(row.code)) {
          await tx.customer.update({
            where: { id: existingMap.get(row.code)! },
            data: {
              fullName: row.fullName,
              phone: row.phone ?? null,
              isActive: row.isActive,
            },
          });
          updated++;
        } else {
          await tx.customer.create({
            data: {
              code: row.code,
              fullName: row.fullName,
              phone: row.phone ?? null,
              isActive: row.isActive,
            },
          });
          created++;
        }
      }

      return { created, updated };
    });

    logger.info(`Customer import: ${result.created} created, ${result.updated} updated, ${mapped.length}/${rows.length} rows by=${req.user?.username}`);

    res.json({
      success: true,
      data: {
        total: rows.length,
        imported: mapped.length,
        created: result.created,
        updated: result.updated,
        skipped: rows.length - mapped.length,
        errors,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /customers/:id/topups — lịch sử nạp tiền
customerRouter.get('/:id/topups', async (req, res, next) => {
  try {
    const { id } = uuidParam.parse(req.params);
    const page = Math.max(1, Number(req.query.page) || 1);
    const size = Math.max(1, Math.min(100, Number(req.query.size) || 20));

    const [items, total] = await Promise.all([
      prisma.topupTransaction.findMany({
        where: { customerId: id },
        include: { createdByUser: { select: { id: true, fullName: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * size,
        take: size,
      }),
      prisma.topupTransaction.count({ where: { customerId: id } }),
    ]);

    res.json({ success: true, data: { items, total, page, size } });
  } catch (err) {
    next(err);
  }
});