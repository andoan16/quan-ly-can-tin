import { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../prisma';
import { InventoryTransactionType } from '@prisma/client';

type PaymentMethod = 'CASH' | 'TRANSFER';

interface CreateOrderInput {
  cashierId: string;
  customerId?: string;
  paymentMethod: PaymentMethod;
  note?: string;
  items: { productId: string; quantity: number }[];
}

const VALID_PAYMENT_METHODS: PaymentMethod[] = ['CASH', 'TRANSFER'];

function generateOrderCode() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `HD-${date}-${rand}`;
}

export const orderService = {
  async list(params: { page: number; size: number; from?: string; to?: string }) {
    const skip = (params.page - 1) * params.size;
    const where: Prisma.OrderWhereInput = {};
    if (params.from || params.to) {
      where.createdAt = {};
      if (params.from) where.createdAt.gte = new Date(params.from!);
      if (params.to) where.createdAt.lte = new Date(params.to!);
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
    // Validate payment method
    if (!VALID_PAYMENT_METHODS.includes(input.paymentMethod)) {
      throw new Error(`Invalid payment method: ${input.paymentMethod}. Must be one of: ${VALID_PAYMENT_METHODS.join(', ')}`);
    }

    // Validate quantities
    for (const item of input.items) {
      if (item.quantity <= 0) {
        throw new Error(`Quantity must be positive for product ${item.productId}`);
      }
    }

    return prisma.$transaction(async (tx) => {
      // Fetch products INSIDE the transaction to prevent TOCTOU race
      const productIds = input.items.map((i) => i.productId);
      const products = await tx.product.findMany({ where: { id: { in: productIds } } });
      const productMap = new Map(products.map((p) => [p.id, p]));

      // Validate all products exist and have sufficient stock
      let total = 0;
      for (const item of input.items) {
        const product = productMap.get(item.productId);
        if (!product) throw new Error(`Product ${item.productId} not found`);
        if (Number(product.currentStock) < item.quantity) {
          throw new Error(`Insufficient stock for ${product.name}: ${product.currentStock} available`);
        }
        total += Number(product.sellingPrice) * item.quantity;
      }

      const order = await tx.order.create({
        data: {
          code: generateOrderCode(),
          cashierId: input.cashierId,
          customerId: input.customerId || null,
          paymentMethod: input.paymentMethod,
          totalComputed: total,
          note: input.note,
          items: {
            create: input.items.map((item) => {
              const product = productMap.get(item.productId)!;
              return {
                productId: item.productId,
                quantity: item.quantity,
                unitPrice: product.sellingPrice,
                costPriceAtSale: product.costPrice,
              };
            }),
          },
        },
        include: { items: true, customer: true },
      });

      for (const item of order.items) {
        // Re-fetch product inside loop to get fresh stock after prior updates
        const product = await tx.product.findUniqueOrThrow({ where: { id: item.productId } });
        const newStock = Number(product.currentStock) - Number(item.quantity);
        await tx.product.update({
          where: { id: item.productId },
          data: { currentStock: newStock },
        });
        await tx.inventoryTransaction.create({
          data: {
            type: InventoryTransactionType.OUT,
            productId: item.productId,
            quantity: -Number(item.quantity),
            stockBefore: product.currentStock,
            stockAfter: newStock,
            orderId: order.id,
            reason: 'Bán hàng',
            createdBy: input.cashierId,
          },
        });
      }

      return order;
    });
  },
};