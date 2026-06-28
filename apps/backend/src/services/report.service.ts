import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';

export interface ProductSalesParams {
  from?: string;
  to?: string;
  categoryId?: string;
  page?: number;
  size?: number;
  sortBy?: 'revenue' | 'quantity' | 'profit' | 'name';
  sortDir?: 'asc' | 'desc';
}

export interface ProductSalesRow {
  productId: string;
  productCode: string;
  productName: string;
  categoryName: string | null;
  unitName: string | null;
  totalQuantity: number;
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  profitMargin: number;
  orderCount: number;
}

export interface ProductSalesSummary {
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  totalQuantity: number;
  totalOrders: number;
  productCount: number;
}

const reportService = {
  async productSales(params: ProductSalesParams) {
    const {
      from,
      to,
      categoryId,
      page = 1,
      size = 20,
      sortBy = 'revenue',
      sortDir = 'desc',
    } = params;

    // Build date filter for orders
    const orderWhere: Prisma.OrderWhereInput = {};
    if (from || to) {
      orderWhere.createdAt = {};
      if (from) orderWhere.createdAt.gte = new Date(from);
      if (to) orderWhere.createdAt.lte = new Date(to);
    }

    // Build product filter for category
    const productWhere: Prisma.ProductWhereInput = {};
    if (categoryId) {
      productWhere.categoryId = categoryId;
    }

    // Fetch all matching order items with product info
    // We MUST calculate revenue = quantity * unitPrice per row, not SUM(unitPrice)
    const orderItems = await prisma.orderItem.findMany({
      where: {
        order: orderWhere,
        product: productWhere,
      },
      select: {
        productId: true,
        quantity: true,
        unitPrice: true,
        costPriceAtSale: true,
        orderId: true,
      },
    });

    if (orderItems.length === 0) {
      return {
        items: [] as ProductSalesRow[],
        summary: {
          totalRevenue: 0,
          totalCost: 0,
          totalProfit: 0,
          totalQuantity: 0,
          totalOrders: 0,
          productCount: 0,
        } as ProductSalesSummary,
        total: 0,
        page,
        size,
      };
    }

    // Aggregate in JS: group by productId, calculate SUM(qty * unitPrice), SUM(qty * costPriceAtSale)
    const grouped = new Map<string, {
      totalQuantity: number;
      totalRevenue: number;
      totalCost: number;
      orderIds: Set<string>;
    }>();

    const allOrderIds = new Set<string>();

    for (const item of orderItems) {
      const qty = Number(item.quantity);
      const unitPrice = Number(item.unitPrice);
      const costPrice = Number(item.costPriceAtSale);
      const lineRevenue = qty * unitPrice;
      const lineCost = qty * costPrice;

      allOrderIds.add(item.orderId);

      const existing = grouped.get(item.productId);
      if (existing) {
        existing.totalQuantity += qty;
        existing.totalRevenue += lineRevenue;
        existing.totalCost += lineCost;
        existing.orderIds.add(item.orderId);
      } else {
        grouped.set(item.productId, {
          totalQuantity: qty,
          totalRevenue: lineRevenue,
          totalCost: lineCost,
          orderIds: new Set([item.orderId]),
        });
      }
    }

    // Fetch product details
    const productIds = Array.from(grouped.keys());
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      include: { category: true, unit: true },
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    // Build rows
    const rows: ProductSalesRow[] = Array.from(grouped.entries()).map(([productId, agg]) => {
      const product = productMap.get(productId);
      const totalProfit = agg.totalRevenue - agg.totalCost;
      const profitMargin = agg.totalRevenue > 0 ? (totalProfit / agg.totalRevenue) * 100 : 0;

      return {
        productId,
        productCode: product?.code ?? '',
        productName: product?.name ?? '',
        categoryName: product?.category?.name ?? null,
        unitName: product?.unit?.name ?? null,
        totalQuantity: agg.totalQuantity,
        totalRevenue: Math.round(agg.totalRevenue * 100) / 100,
        totalCost: Math.round(agg.totalCost * 100) / 100,
        totalProfit: Math.round(totalProfit * 100) / 100,
        profitMargin: Math.round(profitMargin * 100) / 100,
        orderCount: agg.orderIds.size,
      };
    });

    // Sort
    const sortKey = sortBy as keyof ProductSalesRow;
    rows.sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      const aNum = Number(aVal) || 0;
      const bNum = Number(bVal) || 0;
      return sortDir === 'asc' ? aNum - bNum : bNum - aNum;
    });

    // Summary
    const summary: ProductSalesSummary = {
      totalRevenue: Math.round(rows.reduce((s, r) => s + r.totalRevenue, 0) * 100) / 100,
      totalCost: Math.round(rows.reduce((s, r) => s + r.totalCost, 0) * 100) / 100,
      totalProfit: Math.round(rows.reduce((s, r) => s + r.totalProfit, 0) * 100) / 100,
      totalQuantity: rows.reduce((s, r) => s + r.totalQuantity, 0),
      totalOrders: allOrderIds.size,
      productCount: rows.length,
    };

    // Paginate
    const total = rows.length;
    const start = (page - 1) * size;
    const paged = rows.slice(start, start + size);

    return { items: paged, summary, total, page, size };
  },
};

export { reportService };