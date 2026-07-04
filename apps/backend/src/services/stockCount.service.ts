import { prisma } from '../prisma';
import { InventoryTransactionType } from '@prisma/client';
import { logger } from '../logger';

export const stockCountService = {
  // Tạo phiên kiểm kê — lấy tất cả sản phẩm cơ bản (không phải bundle) với tồn kho hiện tại
  async create(data: { note?: string; createdBy: string }) {
    const products = await prisma.product.findMany({
      where: { isActive: true, parentProductId: null },
      orderBy: { code: 'asc' },
    });

    const result = await prisma.$transaction(async (tx) => {
      // Sinh mã kiểm kê: KK-YYYYMMDD-XXXX
      const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const count = await tx.stockCount.count();
      const code = `KK-${date}-${String(count + 1).padStart(4, '0')}`;

      const stockCount = await tx.stockCount.create({
        data: {
          code,
          note: data.note || null,
          createdBy: data.createdBy,
        },
      });

      // Tạo items cho từng sản phẩm — expectedQty = tồn kho hiện tại
      await tx.stockCountItem.createMany({
        data: products.map((p) => ({
          stockCountId: stockCount.id,
          productId: p.id,
          expectedQty: p.currentStock,
          actualQty: p.currentStock, // mặc định = expected, sẽ cập nhật khi nhập số thực
          difference: 0,
        })),
      });

      return stockCount;
    });

    logger.info(`StockCount created: id=${result.id} code=${result.code} items=${products.length} by=${data.createdBy}`);
    return result;
  },

  // Lấy chi tiết phiên kiểm kê + items
  async getById(id: string) {
    return prisma.stockCount.findUnique({
      where: { id },
      include: {
        items: {
          include: { product: { include: { unit: true, category: true } } },
          orderBy: { product: { code: 'asc' } },
        },
        createdByUser: { select: { id: true, fullName: true } },
      },
    });
  },

  // Danh sách phiên kiểm kê
  async list(params: { page: number; size: number }) {
    const skip = (params.page - 1) * params.size;
    const [items, total] = await Promise.all([
      prisma.stockCount.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: params.size,
        include: {
          createdByUser: { select: { id: true, fullName: true } },
          _count: { select: { items: true } },
        },
      }),
      prisma.stockCount.count(),
    ]);
    return { items, total, page: params.page, size: params.size };
  },

  // Cập nhật số thực cho 1 item — tính difference
  async updateItem(itemId: string, actualQty: number) {
    const item = await prisma.stockCountItem.findUniqueOrThrow({
      where: { id: itemId },
      include: { stockCount: true },
    });

    if (item.stockCount.countedAt && new Date(item.stockCount.countedAt).getTime() < Date.now()) {
      throw new Error('Phiên kiểm kê đã hoàn thành, không thể chỉnh sửa');
    }

    const expected = Number(item.expectedQty);
    const difference = Math.round((actualQty - expected) * 100) / 100;

    return prisma.stockCountItem.update({
      where: { id: itemId },
      data: {
        actualQty,
        difference,
      },
    });
  },

  // Hoàn tất kiểm kê — cập nhật tồn kho thực + tạo inventory transactions
  async finalize(id: string, userId: string) {
    logger.info(`StockCount finalize START: id=${id} by=${userId}`);

    return prisma.$transaction(async (tx) => {
      const stockCount = await tx.stockCount.findUniqueOrThrow({
        where: { id },
        include: { items: true },
      });

      // Kiểm tra chưa hoàn tất
      if (stockCount.countedAt) {
        throw new Error('Phiên kiểm kê đã hoàn thành');
      }

      let adjustedCount = 0;

      for (const item of stockCount.items) {
        const expected = Number(item.expectedQty);
        const actual = Number(item.actualQty);
        const difference = actual - expected;

        if (Math.abs(difference) < 0.001) continue; // Không lệch → skip

        // Cập nhật tồn kho
        await tx.product.update({
          where: { id: item.productId },
          data: { currentStock: actual },
        });

        // Tạo inventory transaction
        await tx.inventoryTransaction.create({
          data: {
            type: InventoryTransactionType.COUNT,
            productId: item.productId,
            quantity: difference,
            stockBefore: expected,
            stockAfter: actual,
            reason: `Kiểm kê ${stockCount.code}: ${difference > 0 ? 'thừa' : 'thiếu'} ${Math.abs(difference)}`,
            createdBy: userId,
          },
        });

        adjustedCount++;
      }

      // Đánh dấu hoàn tất
      const updated = await tx.stockCount.update({
        where: { id },
        data: { countedAt: new Date() },
      });

      logger.info(`StockCount finalized: id=${id} adjusted=${adjustedCount} items`);
      return updated;
    });
  },

  async delete(id: string) {
    return prisma.stockCount.delete({ where: { id } });
  },
};