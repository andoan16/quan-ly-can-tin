import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { InventoryTransactionType } from '@prisma/client';

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

  async stockIn(input: { productId: string; quantity: number; unitId?: string; unitCost?: number; referenceNo?: string; reason?: string; createdBy: string }) {
    if (input.quantity <= 0) {
      throw new Error('Quantity must be positive');
    }
    return prisma.$transaction(async (tx) => {
      const product = await tx.product.findUniqueOrThrow({
        where: { id: input.productId },
        include: { unit: true, unitConversions: { include: { fromUnit: true, toUnit: true } } },
      });

      // Tính toán số lượng quy đổi và đơn vị ghi nhận
      let effectiveQty = input.quantity;
      let unitLabel = product.unit?.name || '';
      let conversionInfo: string | undefined;

      if (input.unitId && input.unitId !== product.unitId) {
        // Tìm conversion: fromUnitId = input.unitId, toUnitId = product.unitId
        const conversion = product.unitConversions.find(
          (c) => c.fromUnitId === input.unitId && c.toUnitId === product.unitId
        );
        if (!conversion) {
          // Thử tìm chiều ngược lại
          const reverse = product.unitConversions.find(
            (c) => c.toUnitId === input.unitId && c.fromUnitId === product.unitId
          );
          if (reverse) {
            // input.unitId là toUnit (đơn vị nhỏ), product.unitId là fromUnit (đơn vị lớn)
            // VD: product.unitId = THUNG, input.unitId = CHAI, factor = 24
            // → effectiveQty = input.quantity / factor
            const factor = Number(reverse.factor);
            if (factor === 0) throw new Error('Conversion factor cannot be zero');
            effectiveQty = input.quantity / factor;
            unitLabel = reverse.fromUnit.name;
            conversionInfo = `${input.quantity} ${reverse.toUnit.name} = ${effectiveQty} ${reverse.fromUnit.name}`;
          } else {
            throw new Error(`No unit conversion found for product ${product.code} from unit ${input.unitId}`);
          }
        } else {
          // input.unitId là fromUnit (đơn vị lớn), product.unitId là toUnit (đơn vị nhỏ)
          // VD: input.unitId = THUNG, product.unitId = CHAI, factor = 24
          // → effectiveQty = input.quantity * factor
          effectiveQty = input.quantity * Number(conversion.factor);
          unitLabel = conversion.toUnit.name;
          conversionInfo = `${input.quantity} ${conversion.fromUnit.name} = ${effectiveQty} ${conversion.toUnit.name}`;
        }
      }

      const newStock = Number(product.currentStock) + effectiveQty;
      await tx.product.update({ where: { id: input.productId }, data: { currentStock: newStock } });

      // Nếu có unitCost và có quy đổi, tính lại unitCost theo đơn vị cơ bản
      let unitCostNote: string | undefined;
      if (input.unitCost && conversionInfo) {
        const costPerBaseUnit = input.unitCost / effectiveQty * input.quantity;
        const fromUnitName = product.unitConversions.find(c => c.fromUnitId === input.unitId)?.fromUnit.name || '';
        unitCostNote = ` (Giá nhập: ${input.unitCost.toLocaleString('vi-VN')}₫/${fromUnitName} → ${Math.round(costPerBaseUnit).toLocaleString('vi-VN')}₫/${unitLabel})`;
      }

      const reasonText = [input.reason || 'Nhập kho', conversionInfo, unitCostNote].filter(Boolean).join(' | ');

      return tx.inventoryTransaction.create({
        data: {
          type: InventoryTransactionType.IN,
          productId: input.productId,
          quantity: effectiveQty,
          stockBefore: product.currentStock,
          stockAfter: newStock,
          referenceNo: input.referenceNo,
          reason: reasonText,
          createdBy: input.createdBy,
        },
        include: { product: true },
      });
    });
  },

  async stockOut(input: { productId: string; quantity: number; referenceNo?: string; reason: string; createdBy: string }) {
    if (input.quantity <= 0) {
      throw new Error('Quantity must be positive');
    }
    return prisma.$transaction(async (tx) => {
      const product = await tx.product.findUniqueOrThrow({ where: { id: input.productId } });
      if (Number(product.currentStock) < input.quantity) {
        throw new Error(`Insufficient stock for ${product.name}`);
      }
      const newStock = Number(product.currentStock) - input.quantity;
      await tx.product.update({ where: { id: input.productId }, data: { currentStock: newStock } });
      return tx.inventoryTransaction.create({
        data: {
          type: InventoryTransactionType.OUT,
          productId: input.productId,
          quantity: -input.quantity,
          stockBefore: product.currentStock,
          stockAfter: newStock,
          referenceNo: input.referenceNo,
          reason: input.reason,
          createdBy: input.createdBy,
        },
        include: { product: true },
      });
    });
  },

  async adjust(input: { productId: string; newStock: number; reason: string; createdBy: string }) {
    if (input.newStock < 0) {
      throw new Error('Stock cannot be negative');
    }
    return prisma.$transaction(async (tx) => {
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
  },
};