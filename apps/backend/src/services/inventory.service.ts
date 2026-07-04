import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { InventoryTransactionType } from '@prisma/client';
import { logger } from '../logger';

const VALID_TRANSACTION_TYPES = Object.values(InventoryTransactionType);

export const inventoryService = {
  async listTransactions(params: { page: number; size: number; productId?: string; type?: string }) {
    const skip = (params.page - 1) * params.size;
    const where: Prisma.InventoryTransactionWhereInput = {};
    if (params.productId) where.productId = params.productId;
    if (params.type) {
      if (!VALID_TRANSACTION_TYPES.includes(params.type as InventoryTransactionType)) {
        throw new Error(`Invalid transaction type: ${params.type}. Must be one of: ${VALID_TRANSACTION_TYPES.join(', ')}`);
      }
      where.type = params.type as InventoryTransactionType;
    }
    const [items, total] = await Promise.all([
      prisma.inventoryTransaction.findMany({
        where,
        include: { product: true, createdByUser: { select: { id: true, fullName: true } } },
        skip,
        take: params.size,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.inventoryTransaction.count({ where }),
    ]);
    return { items, total, page: params.page, size: params.size };
  },

  async stockIn(input: { productId: string; quantity: number; unitCost?: number; referenceNo?: string; reason?: string; createdBy: string }) {
    if (input.quantity <= 0) {
      throw new Error('Quantity must be positive');
    }
    const result = await prisma.$transaction(async (tx) => {
      const product = await tx.product.findUniqueOrThrow({
        where: { id: input.productId },
        include: { unit: true, bundleUnit: true, parentProduct: { include: { unit: true } } },
      });

      let effectiveQty = input.quantity;
      let targetProductId = input.productId;
      let stockBefore = Number(product.currentStock);
      let reasonText = input.reason || 'Nhập kho';

      // Nếu là bundle product (có parentProductId) → quy đổi về sản phẩm cơ bản
      if (product.parentProductId && product.factor) {
        const parentProduct = product.parentProduct!;
        effectiveQty = input.quantity * Number(product.factor);
        targetProductId = parentProduct.id;
        // Lấy tồn kho từ parent product
        const parent = await tx.product.findUniqueOrThrow({ where: { id: parentProduct.id } });
        stockBefore = Number(parent.currentStock);
        const bundleUnitName = product.bundleUnit?.name || 'đơn vị';
        const baseUnitName = parentProduct.unit?.name || product.unit?.name || '';
        reasonText = `Nhập ${input.quantity} ${bundleUnitName} (${effectiveQty} ${baseUnitName})${input.reason ? ` | ${input.reason}` : ''}`;
      }

      const newStock = stockBefore + effectiveQty;
      await tx.product.update({ where: { id: targetProductId }, data: { currentStock: newStock } });

      // Nếu có unitCost và là bundle, tính giá theo đơn vị cơ bản
      if (input.unitCost && product.parentProductId && product.factor) {
        const costPerBaseUnit = input.unitCost / Number(product.factor);
        const baseUnitName = product.parentProduct?.unit?.name || product.unit?.name || '';
        reasonText += ` | Giá nhập: ${input.unitCost.toLocaleString('vi-VN')}₫/${product.bundleUnit?.name || 'đơn vị'} → ${Math.round(costPerBaseUnit).toLocaleString('vi-VN')}₫/${baseUnitName}`;
      }

      return tx.inventoryTransaction.create({
        data: {
          type: InventoryTransactionType.IN,
          productId: targetProductId,
          quantity: effectiveQty,
          stockBefore,
          stockAfter: newStock,
          referenceNo: input.referenceNo,
          reason: reasonText,
          createdBy: input.createdBy,
        },
        include: { product: true },
      });
    });
    logger.info(`Stock-IN: product=${input.productId} qty=${result.quantity} stockBefore=${result.stockBefore} stockAfter=${result.stockAfter} by=${input.createdBy}`);
    return result;
  },

  async stockOut(input: { productId: string; quantity: number; referenceNo?: string; reason: string; createdBy: string }) {
    if (input.quantity <= 0) {
      throw new Error('Quantity must be positive');
    }
    const result = await prisma.$transaction(async (tx) => {
      const product = await tx.product.findUniqueOrThrow({
        where: { id: input.productId },
        include: { unit: true, bundleUnit: true, parentProduct: { include: { unit: true } } },
      });

      let effectiveQty = input.quantity;
      let targetProductId = input.productId;
      let stockBefore = Number(product.currentStock);
      let reasonText = input.reason;

      // Nếu là bundle product (có parentProductId) → quy đổi về sản phẩm cơ bản
      if (product.parentProductId && product.factor) {
        const parentProduct = product.parentProduct!;
        effectiveQty = input.quantity * Number(product.factor);
        targetProductId = parentProduct.id;
        const parent = await tx.product.findUniqueOrThrow({ where: { id: parentProduct.id } });
        stockBefore = Number(parent.currentStock);
        if (stockBefore < effectiveQty) {
          logger.warn(`Stock-OUT REJECTED: insufficient stock — product="${parentProduct.name}" stock=${parent.currentStock} need=${effectiveQty}`);
          throw new Error(`Insufficient stock for ${parentProduct.name}: ${parent.currentStock} available, need ${effectiveQty}`);
        }
        const bundleUnitName = product.bundleUnit?.name || 'đơn vị';
        const baseUnitName = parentProduct.unit?.name || product.unit?.name || '';
        reasonText = `Xuất ${input.quantity} ${bundleUnitName} (${effectiveQty} ${baseUnitName}) | ${input.reason}`;
      } else {
        if (Number(product.currentStock) < effectiveQty) {
          logger.warn(`Stock-OUT REJECTED: insufficient stock — product="${product.name}" stock=${product.currentStock} need=${effectiveQty}`);
          throw new Error(`Insufficient stock for ${product.name}: ${product.currentStock} available`);
        }
      }

      const newStock = stockBefore - effectiveQty;
      await tx.product.update({ where: { id: targetProductId }, data: { currentStock: newStock } });
      return tx.inventoryTransaction.create({
        data: {
          type: InventoryTransactionType.OUT,
          productId: targetProductId,
          quantity: -effectiveQty,
          stockBefore,
          stockAfter: newStock,
          referenceNo: input.referenceNo,
          reason: reasonText,
          createdBy: input.createdBy,
        },
        include: { product: true },
      });
    });
    logger.info(`Stock-OUT: product=${input.productId} qty=${result.quantity} stockBefore=${result.stockBefore} stockAfter=${result.stockAfter} by=${input.createdBy}`);
    return result;
  },

  async adjust(input: { productId: string; newStock: number; reason: string; createdBy: string }) {
    if (input.newStock < 0) {
      throw new Error('Stock cannot be negative');
    }
    const result = await prisma.$transaction(async (tx) => {
      const product = await tx.product.findUniqueOrThrow({ where: { id: input.productId } });
      const delta = input.newStock - Number(product.currentStock);
      await tx.product.update({ where: { id: input.productId }, data: { currentStock: input.newStock } });
      return tx.inventoryTransaction.create({
        data: {
          type: InventoryTransactionType.ADJUSTMENT,
          productId: input.productId,
          quantity: delta,
          stockBefore: product.currentStock,
          stockAfter: input.newStock,
          reason: input.reason,
          createdBy: input.createdBy,
        },
        include: { product: true },
      });
    });
    logger.info(`Stock-ADJUST: product=${input.productId} newStock=${input.newStock} oldStock=${result.stockBefore} by=${input.createdBy} reason="${input.reason}"`);
    return result;
  },
};