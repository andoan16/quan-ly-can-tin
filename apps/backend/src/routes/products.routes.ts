import { Router } from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { authMiddleware, requireRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { z } from 'zod';
import { searchProducts } from '../utils/unaccent';
import { logger } from '../logger';

// Multer: parse file upload từ form-data (memory storage — không ghi đĩa)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

const productInclude = {
  category: true,
  unit: true,
  bundleUnit: true,
  parentProduct: { select: { id: true, code: true, name: true, unit: true, currentStock: true } },
  variants: { include: { bundleUnit: true } },
};

// Schema cho product thường (không bundle)
const productSchema = z.object({
  code: z.string().min(1).optional(),
  name: z.string().min(1),
  categoryId: z.preprocess((v) => v === '' ? null : v, z.string().uuid().nullable().optional()),
  unitId: z.preprocess((v) => v === '' ? null : v, z.string().uuid().nullable().optional()),
  sellingPrice: z.coerce.number().nonnegative(),
  costPrice: z.coerce.number().nonnegative(),
  currentStock: z.coerce.number().nonnegative().default(0),
  isActive: z.boolean().optional().default(true),
  // Bundle fields — used when creating a bundled product (auto-creates base + bundle)
  hasBundle: z.boolean().optional().default(false),
  bundleUnitId: z.preprocess((v) => v === '' ? null : v, z.string().uuid().nullable().optional()),
  factor: z.coerce.number().positive().nullable().optional(),
  bundleSellingPrice: z.coerce.number().nonnegative().optional(), // giá bán nguyên thùng
  bundleCostPrice: z.coerce.number().nonnegative().optional(),     // giá nhập nguyên thùng
  bundleName: z.string().optional(),                               // VD: "Mì tôm Thùng 30 gói"
  unitPriceOverride: z.coerce.number().nonnegative().optional(),    // giá bán gói (override sellingPrice if provided)
});

const uuidParam = z.object({ id: z.string().uuid() });

/**
 * Generate next product code: prefix + 6-digit zero-padded sequence.
 * Dùng PostgreSQL sequence để tránh race condition khi 2 user tạo cùng lúc.
 */
async function generateProductCode(categoryId: string | null): Promise<string> {
  const result = await prisma.$queryRaw<{ nextval: bigint }[]>`SELECT nextval('product_code_seq')`;
  const seq = Number(result[0].nextval);

  if (!categoryId) {
    return `GEN${String(seq).padStart(6, '0')}`;
  }

  const category = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!category) throw new Error('Category not found');

  return `${category.prefix}${String(seq).padStart(6, '0')}`;
}

export const productRouter = Router();
productRouter.use(authMiddleware);

productRouter.get('/', async (req, res, next) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const categoryId = typeof req.query.categoryId === 'string' ? req.query.categoryId : undefined;
    const page = Math.max(1, Number(req.query.page) || 1);
    const size = Math.max(1, Math.min(100, Number(req.query.size) || 20));

    const result = await searchProducts({ search, categoryId, page, size });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

productRouter.get('/low-stock', async (_req, res, next) => {
  try {
    const items = await prisma.product.findMany({
      where: { currentStock: { lte: 10 }, isActive: true, parentProductId: null },
      include: productInclude,
      orderBy: { currentStock: 'asc' },
    });
    res.json({ success: true, data: items });
  } catch (err) {
    next(err);
  }
});

// POST /products — auto-generate code, auto-create base+bundle if hasBundle=true
productRouter.post('/', requireRole('ADMIN', 'MANAGER'), validate(productSchema), async (req, res, next) => {
  try {
    const data = { ...req.body };
    const hasBundle = !!data.hasBundle;

    // Generate base product code
    const baseCode = data.code || await generateProductCode(data.categoryId ?? null);

    // Calculate base sellingPrice: if unitPriceOverride provided, use it; otherwise use sellingPrice
    const baseSellingPrice = data.unitPriceOverride ?? data.sellingPrice;

    if (!hasBundle) {
      // Simple product — no bundle
      const item = await prisma.product.create({
        data: {
          code: baseCode,
          name: data.name,
          categoryId: data.categoryId || null,
          unitId: data.unitId || null,
          sellingPrice: data.sellingPrice,
          costPrice: data.costPrice,
          currentStock: data.currentStock,
          isActive: data.isActive,
        },
        include: productInclude,
      });
      logger.info(`Product created (simple): id=${item.id} code="${item.code}" name="${item.name}" by=${req.user?.username}`);
      res.status(201).json({ success: true, data: item });
      return;
    }

    // Has bundle — create base + bundle in a transaction
    if (!data.bundleUnitId || !data.factor) {
      res.status(400).json({ message: 'Bundle cần bundleUnitId và factor' });
      return;
    }

    // Fetch unit names for auto-naming
    const [baseUnit, bundleUnitObj] = await Promise.all([
      data.unitId ? prisma.unit.findUnique({ where: { id: data.unitId } }) : null,
      prisma.unit.findUnique({ where: { id: data.bundleUnitId } }),
    ]);
    const baseUnitName = baseUnit?.name || '';
    const bundleUnitName = bundleUnitObj?.name || '';

    // Auto-generate bundle name: "Mì modern Thùng 30 Gói"
    const autoBundleName = `${data.name} ${bundleUnitName} ${data.factor} ${baseUnitName}`.trim();

    const result = await prisma.$transaction(async (tx) => {
      // 1. Create base product (bán lẻ: Gói)
      const base = await tx.product.create({
        data: {
          code: baseCode,
          name: data.name,
          categoryId: data.categoryId || null,
          unitId: data.unitId || null,
          sellingPrice: baseSellingPrice,
          costPrice: data.bundleCostPrice ? Number(data.bundleCostPrice) / Number(data.factor) : data.costPrice,
          currentStock: 0, // stock starts at 0, will be filled via stock-in
          isActive: data.isActive,
        },
      });

      // 2. Create bundle product (nhập kho: Thùng)
      const bundle = await tx.product.create({
        data: {
          code: `${baseCode}-TH`,
          name: data.bundleName?.trim() || autoBundleName,
          categoryId: data.categoryId || null,
          unitId: data.unitId || null, // same base unit
          sellingPrice: data.bundleSellingPrice || (baseSellingPrice * Number(data.factor)),
          costPrice: data.bundleCostPrice || data.costPrice,
          currentStock: 0,
          isActive: data.isActive,
          parentProductId: base.id,
          factor: Number(data.factor),
          bundleUnitId: data.bundleUnitId,
        },
        include: productInclude,
      });

      return { base, bundle };
    });

    // Return the bundle (which includes parentProduct)
    const bundleItem = await prisma.product.findUnique({
      where: { id: result.bundle.id },
      include: productInclude,
    });
    logger.info(`Product created (bundle): base=${result.base.id} bundle=${result.bundle.id} code="${result.bundle.code}" name="${result.bundle.name}" by=${req.user?.username}`);
    res.status(201).json({ success: true, data: bundleItem });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      res.status(409).json({ message: 'Mã sản phẩm đã tồn tại' });
      return;
    }
    next(err);
  }
});

// GET /products/next-code?categoryId=... — preview next auto-generated code
productRouter.get('/next-code', async (req, res, next) => {
  try {
    const categoryId = typeof req.query.categoryId === 'string' ? req.query.categoryId : null;
    const code = await generateProductCode(categoryId);
    res.json({ success: true, data: { code } });
  } catch (err) {
    next(err);
  }
});

// POST /products/import — import hàng loạt từ file xlsx
// Cột Excel: mã | tên | danh mục(prefix) | đơn vị(code) | giá bán | giá nhập | tồn kho | hoạt động
productRouter.post('/import', requireRole('ADMIN', 'MANAGER'), upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ message: 'Vui lòng chọn file xlsx' });
      return;
    }

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
    interface ProductRow {
      code: string;
      name: string;
      categoryPrefix?: string;
      unitCode?: string;
      sellingPrice: number;
      costPrice: number;
      currentStock: number;
      isActive: boolean;
    }
    const mapped: ProductRow[] = [];
    const errors: { row: number; message: string }[] = [];

    rows.forEach((row, idx) => {
      const lineNo = idx + 2; // dòng 1 là header
      const code = String(row['mã'] ?? row['code'] ?? row['ma'] ?? '').trim();
      const name = String(row['tên'] ?? row['name'] ?? row['ten'] ?? '').trim();
      const categoryPrefix = String(row['danh mục'] ?? row['category'] ?? row['danh muc'] ?? '').trim();
      const unitCode = String(row['đơn vị'] ?? row['unit'] ?? row['don vi'] ?? '').trim();
      const sellingPrice = Number(row['giá bán'] ?? row['sellingPrice'] ?? row['gia ban'] ?? 0);
      const costPrice = Number(row['giá nhập'] ?? row['costPrice'] ?? row['gia nhap'] ?? 0);
      const currentStock = Number(row['tồn kho'] ?? row['currentStock'] ?? row['ton kho'] ?? 0);
      const activeRaw = row['hoạt động'] ?? row['isActive'] ?? row['hoat dong'] ?? '';
      const isActive = activeRaw === '' ? true : ['true', '1', 'yes', 'có'].includes(String(activeRaw).toLowerCase().trim());

      if (!code) {
        errors.push({ row: lineNo, message: 'Thiếu mã sản phẩm' });
        return;
      }
      if (!name) {
        errors.push({ row: lineNo, message: 'Thiếu tên sản phẩm' });
        return;
      }
      if (isNaN(sellingPrice) || sellingPrice < 0) {
        errors.push({ row: lineNo, message: 'Giá bán không hợp lệ' });
        return;
      }
      if (isNaN(costPrice) || costPrice < 0) {
        errors.push({ row: lineNo, message: 'Giá nhập không hợp lệ' });
        return;
      }
      mapped.push({
        code,
        name,
        categoryPrefix: categoryPrefix || undefined,
        unitCode: unitCode || undefined,
        sellingPrice,
        costPrice,
        currentStock: isNaN(currentStock) ? 0 : currentStock,
        isActive,
      });
    });

    if (mapped.length === 0) {
      res.status(400).json({
        success: false,
        message: 'Không có dòng hợp lệ để import',
        errors,
      });
      return;
    }

    // Lấy trước categories và units để map prefix/code → id
    const [categories, units] = await Promise.all([
      prisma.category.findMany({ select: { id: true, prefix: true } }),
      prisma.unit.findMany({ select: { id: true, code: true } }),
    ]);
    const categoryMap = new Map(categories.map((c) => [c.prefix.toUpperCase(), c.id]));
    const unitMap = new Map(units.map((u) => [u.code.toUpperCase(), u.id]));

    const result = await prisma.$transaction(async (tx) => {
      const existingProducts = await tx.product.findMany({
        where: { code: { in: mapped.map((r) => r.code) } },
        select: { id: true, code: true },
      });
      const existingMap = new Map(existingProducts.map((p) => [p.code, p.id]));

      let created = 0;
      let updated = 0;

      for (const row of mapped) {
        const categoryId = row.categoryPrefix ? categoryMap.get(row.categoryPrefix.toUpperCase()) ?? null : null;
        const unitId = row.unitCode ? unitMap.get(row.unitCode.toUpperCase()) ?? null : null;

        if (existingMap.has(row.code)) {
          await tx.product.update({
            where: { id: existingMap.get(row.code)! },
            data: {
              name: row.name,
              categoryId: categoryId || null,
              unitId: unitId || null,
              sellingPrice: row.sellingPrice,
              costPrice: row.costPrice,
              currentStock: row.currentStock,
              isActive: row.isActive,
            },
          });
          updated++;
        } else {
          await tx.product.create({
            data: {
              code: row.code,
              name: row.name,
              categoryId: categoryId || null,
              unitId: unitId || null,
              sellingPrice: row.sellingPrice,
              costPrice: row.costPrice,
              currentStock: row.currentStock,
              isActive: row.isActive,
            },
          });
          created++;
        }
      }

      return { created, updated };
    });

    logger.info(`Product import: ${result.created} created, ${result.updated} updated, ${mapped.length}/${rows.length} rows by=${req.user?.username}`);

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

productRouter.patch('/:id', requireRole('ADMIN', 'MANAGER'), validate(productSchema.partial()), async (req, res, next) => {
  try {
    const { id } = uuidParam.parse(req.params);
    // Don't allow code change — code is auto-generated
    const { code: _code, hasBundle: _hb, bundleUnitId: _bu, factor: _f, bundleSellingPrice: _bsp, bundleCostPrice: _bcp, bundleName: _bn, unitPriceOverride: _upo, ...updateData } = req.body;
    const item = await prisma.product.update({
      where: { id },
      data: updateData,
      include: productInclude,
    });
    logger.info(`Product updated: id=${id} by=${req.user?.username}`);
    res.json({ success: true, data: item });
  } catch (err) {
    next(err);
  }
});

productRouter.delete('/:id', requireRole('ADMIN'), async (req, res, next) => {
  try {
    const { id } = uuidParam.parse(req.params);
    await prisma.product.update({ where: { id }, data: { isActive: false } });
    logger.info(`Product deactivated (soft delete): id=${id} by=${req.user?.username}`);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});