import { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../prisma';
import { InventoryTransactionType } from '@prisma/client';
import { logger } from '../logger';

type PaymentMethod = 'CASH' | 'TRANSFER';

interface CreateOrderItemInput {
  productId: string;
  quantity: number;
}

interface CreateOrderInput {
  cashierId: string;
  customerId?: string;
  paymentMethod?: PaymentMethod; // deprecated — luôn CASH, giữ cho backward-compat
  note?: string;
  items: CreateOrderItemInput[];
}

// Sinh mã đơn dạng HD-YYYYMMDD-XXXXXXX — dùng PostgreSQL sequence để không trùng
async function generateOrderCode(tx: Prisma.TransactionClient): Promise<string> {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const result = await tx.$queryRaw<{ nextval: bigint }[]>`SELECT nextval('order_code_seq')`;
  const seq = Number(result[0].nextval);
  // Đệm 7 số để đủ không gian cho hàng triệu đơn
  return `HD-${date}-${String(seq).padStart(7, '0')}`;
}

export const orderService = {
  async list(params: { page: number; size: number; from?: string; to?: string; status?: string; search?: string }) {
    const skip = (params.page - 1) * params.size;
    const where: Prisma.OrderWhereInput = {};
    if (params.from || params.to) {
      where.createdAt = {};
      if (params.from) where.createdAt.gte = new Date(params.from!);
      if (params.to) {
        // End of day so orders created during the day are included
        const endOfDay = new Date(params.to!);
        endOfDay.setUTCHours(23, 59, 59, 999);
        where.createdAt.lte = endOfDay;
      }
    }
    if (params.status) {
      where.status = params.status as 'COMPLETED' | 'CANCELLED';
    }
    // Tìm kiếm theo mã đơn hoặc tên khách hàng
    if (params.search?.trim()) {
      const s = params.search.trim();
      where.OR = [
        { code: { contains: s, mode: 'insensitive' } },
        { customer: { fullName: { contains: s, mode: 'insensitive' } } },
      ];
    }
    const [items, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: { customer: true, cashier: { select: { id: true, fullName: true } }, items: { include: { product: true } } },
        skip,
        take: params.size,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.order.count({ where }),
    ]);
    return { items, total, page: params.page, size: params.size };
  },

  async getById(id: string) {
    return prisma.order.findUnique({
      where: { id },
      include: { customer: true, cashier: { select: { id: true, fullName: true } }, items: { include: { product: true } } },
    });
  },

  async create(input: CreateOrderInput) {
    // Bắt buộc chọn người mua — không bán khách lẻ
    if (!input.customerId) {
      throw new Error('Chưa chọn người mua. Người mua phải có tài khoản để trừ tiền.');
    }

    // Validate quantities
    for (const item of input.items) {
      if (item.quantity <= 0) {
        throw new Error(`Quantity must be positive for product ${item.productId}`);
      }
    }

    logger.info(`Order create START: cashier=${input.cashierId} customer=${input.customerId} items=${input.items.length}`);

    return prisma.$transaction(async (tx) => {
      // Fetch customer để kiểm tra số dư
      const customer = await tx.customer.findUniqueOrThrow({
        where: { id: input.customerId! },
      });
      const balanceBefore = Number(customer.balance);

      // Fetch products INSIDE the transaction with bundle info
      const productIds = input.items.map((i) => i.productId);
      const products = await tx.product.findMany({
        where: { id: { in: productIds } },
        include: { unit: true, bundleUnit: true, parentProduct: { include: { unit: true } } },
      });
      const productMap = new Map(products.map((p) => [p.id, p]));

      // Validate all products exist, calculate effective qty & unit price, aggregate stock needed
      let total = 0;
      const itemData: Array<{
        productId: string;
        quantity: number;        // Số lượng theo đơn vị bán (VD: 2 Thùng)
        effectiveQty: number;     // Số lượng quy đổi về ĐVT cơ bản (VD: 48 Chai) — dùng để trừ kho
        unitPrice: number;         // Giá theo đơn vị bán (VD: giá 1 Thùng)
        costPriceAtSale: number;   // Giá vốn theo đơn vị bán
        reasonLabel: string;
        stockProductId: string;    // ID của product cần trừ kho (parent cho bundle, self cho base)
      }> = [];

      // Aggregate effective qty per stock-product để kiểm tra stock chính xác
      // khi nhiều item cùng product (hoặc cùng parent cho bundle) trong 1 order
      const stockNeeded = new Map<string, number>(); // stockProductId → tổng effectiveQty
      const stockProductNames = new Map<string, string>(); // stockProductId → tên hiển thị (cho error msg)

      for (const item of input.items) {
        const product = productMap.get(item.productId);
        if (!product) throw new Error(`Product ${item.productId} not found`);

        let effectiveQty = item.quantity;
        let unitPrice = Number(product.sellingPrice);
        let costPriceAtSale = Number(product.costPrice);
        let reasonLabel = 'Bán hàng';
        let stockProductId = item.productId;

        // Nếu là bundle product (có parentProductId) → quy đổi về sản phẩm cơ bản
        if (product.parentProductId && product.factor) {
          const parentProduct = product.parentProduct!;
          effectiveQty = item.quantity * Number(product.factor);
          unitPrice = Number(product.sellingPrice); // Giá bundle (VD: 96.000₫/Thùng)
          costPriceAtSale = Number(product.costPrice); // Giá vốn bundle
          const bundleUnitName = product.bundleUnit?.name || 'đơn vị';
          const baseUnitName = parentProduct.unit?.name || product.unit?.name || '';
          reasonLabel = `Bán hàng (${item.quantity} ${bundleUnitName} = ${effectiveQty} ${baseUnitName})`;
          stockProductId = parentProduct.id;
          stockProductNames.set(stockProductId, `${parentProduct.name} (${baseUnitName})`);
        } else {
          stockProductNames.set(stockProductId, product.name);
        }

        // Aggregate stock needed
        const prevNeeded = stockNeeded.get(stockProductId) || 0;
        stockNeeded.set(stockProductId, prevNeeded + effectiveQty);

        total += unitPrice * item.quantity;
        itemData.push({
          productId: item.productId,
          quantity: item.quantity,
          effectiveQty,
          unitPrice,
          costPriceAtSale,
          reasonLabel,
          stockProductId,
        });
      }

      // Kiểm tra stock cho từng stock-product (aggregated) — tránh vượt kho khi
      // nhiều item cùng product trong 1 order
      for (const [stockProductId, neededQty] of stockNeeded) {
        const stockProduct = products.find(
          (p) => p.id === stockProductId || p.parentProductId === stockProductId,
        );
        // Fetch fresh stock inside transaction
        const stockRow = await tx.product.findUniqueOrThrow({ where: { id: stockProductId } });
        const available = Number(stockRow.currentStock);
        if (available < neededQty) {
          const displayName = stockProductNames.get(stockProductId) || stockRow.name;
          logger.warn(`Order REJECTED: insufficient stock — product="${stockRow.name}" stock=${available} need=${neededQty}`);
          throw new Error(`Insufficient stock for ${displayName}: ${available} available, need ${neededQty}`);
        }
      }

      // Kiểm tra số dư tài khoản
      const totalRounded = Math.round(total * 100) / 100;
      if (balanceBefore < totalRounded) {
        logger.warn(`Order REJECTED: insufficient balance — customer=${customer.fullName} balance=${balanceBefore} need=${totalRounded}`);
        throw new Error(`Số dư không đủ: ${customer.fullName} có ${balanceBefore.toLocaleString('vi-VN')}₫, cần ${totalRounded.toLocaleString('vi-VN')}₫`);
      }
      const balanceAfter = Math.round((balanceBefore - totalRounded) * 100) / 100;

      const order = await tx.order.create({
        data: {
          code: await generateOrderCode(tx),
          cashierId: input.cashierId,
          customerId: input.customerId || null,
          paymentMethod: 'CASH', // luôn CASH — thanh toán qua tài khoản
          totalComputed: total,
          balanceBefore,
          balanceAfter,
          note: input.note,
          items: {
            create: itemData.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,           // Số lượng theo đơn vị bán (VD: 2 Thùng) — nhất quán với unitPrice
              unitPrice: item.unitPrice,          // Giá theo đơn vị bán (VD: 96,000₫/Thùng)
              costPriceAtSale: item.costPriceAtSale,  // Giá vốn theo đơn vị bán (VD: 120,000₫/Thùng) — nhất quán với quantity
            })),
          },
        },
        include: { items: { include: { product: true } }, customer: true },
      });

      // Trừ số dư tài khoản
      await tx.customer.update({
        where: { id: customer.id },
        data: { balance: balanceAfter },
      });

      // Trừ kho — luôn fetch fresh stock trước khi trừ (tránh stale stockBefore
      // khi nhiều item cùng stock-product trong 1 order)
      for (let i = 0; i < order.items.length; i++) {
        const orderItem = order.items[i];
        const inputItem = itemData[i];

        const stockProductId = inputItem.stockProductId;
        const stockRow = await tx.product.findUniqueOrThrow({ where: { id: stockProductId } });
        const stockBefore = Number(stockRow.currentStock);

        const newStock = stockBefore - inputItem.effectiveQty;
        await tx.product.update({
          where: { id: stockProductId },
          data: { currentStock: newStock },
        });

        await tx.inventoryTransaction.create({
          data: {
            type: InventoryTransactionType.OUT,
            productId: stockProductId,
            quantity: -inputItem.effectiveQty,
            stockBefore,
            stockAfter: newStock,
            orderId: order.id,
            reason: inputItem.reasonLabel,
            createdBy: input.cashierId,
          },
        });
      }

      logger.info(`Order created OK: code=${order.code} total=${totalRounded} balanceBefore=${balanceBefore} balanceAfter=${balanceAfter} items=${order.items.length}`);
      return order;
    });
  },

  // ── Hủy/hoàn đơn hàng ──────────────────────────────────────────────────
  // Hoàn tiền cho khách + hoàn lại tồn kho. Chỉ hủy được đơn COMPLETED.
  async cancel(input: { orderId: string; cancelledBy: string; reason: string }) {
    if (!input.reason?.trim()) {
      throw new Error('Lý do hủy đơn là bắt buộc');
    }

    logger.info(`Order cancel START: orderId=${input.orderId} by=${input.cancelledBy} reason="${input.reason}"`);

    return prisma.$transaction(async (tx) => {
      const order = await tx.order.findUniqueOrThrow({
        where: { id: input.orderId },
        include: {
          items: { include: { product: { include: { parentProduct: true, unit: true, bundleUnit: true } } } },
          customer: true,
        },
      });

      if (order.status === 'CANCELLED') {
        throw new Error('Đơn hàng đã bị hủy trước đó');
      }
      if (!order.customerId) {
        throw new Error('Không thể hủy đơn không có khách hàng');
      }

      // 1. Hoàn tiền cho khách
      const refundAmount = Number(order.totalComputed);
      const customer = await tx.customer.findUniqueOrThrow({ where: { id: order.customerId } });
      const currentBalance = Number(customer.balance);
      const newBalance = Math.round((currentBalance + refundAmount) * 100) / 100;

      await tx.customer.update({
        where: { id: order.customerId },
        data: { balance: newBalance },
      });

      // 2. Hoàn lại tồn kho cho từng item
      for (const item of order.items) {
        const product = item.product;
        let stockProductId: string;
        let effectiveQty = Number(item.quantity);

        // Nếu là bundle → quy đổi về sản phẩm cơ bản
        if (product.parentProductId && product.factor) {
          stockProductId = product.parentProductId;
          effectiveQty = Number(item.quantity) * Number(product.factor);
        } else {
          stockProductId = item.productId;
        }

        const stockProduct = await tx.product.findUniqueOrThrow({ where: { id: stockProductId } });
        const stockBefore = Number(stockProduct.currentStock);
        const stockAfter = stockBefore + effectiveQty;

        await tx.product.update({
          where: { id: stockProductId },
          data: { currentStock: stockAfter },
        });

        await tx.inventoryTransaction.create({
          data: {
            type: InventoryTransactionType.IN,
            productId: stockProductId,
            quantity: effectiveQty,
            stockBefore,
            stockAfter,
            orderId: order.id,
            reason: `Hoàn đơn ${order.code}: ${input.reason}`,
            createdBy: input.cancelledBy,
          },
        });
      }

      // 3. Đánh dấu đơn đã hủy
      const updated = await tx.order.update({
        where: { id: input.orderId },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelledBy: input.cancelledBy,
          cancelReason: input.reason,
        },
        include: { customer: true, items: { include: { product: true } } },
      });

      logger.info(`Order cancelled OK: code=${order.code} refund=${refundAmount} customerBalance=${currentBalance}→${newBalance} items=${order.items.length}`);
      return updated;
    });
  },
};