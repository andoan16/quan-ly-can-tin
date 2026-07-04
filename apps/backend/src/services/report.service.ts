import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';

export type SortableField = 'revenue' | 'quantity' | 'profit' | 'productName';

export interface ProductSalesParams {
  from?: string;
  to?: string;
  categoryId?: string;
  page?: number;
  size?: number;
  sortBy?: SortableField;
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

// Raw SQL row types — keys phải khớp chính xác với alias trong SQL (camelCase, có quote)
interface ProductSalesAggRow {
  productId: string;
  productCode: string;
  productName: string;
  categoryName: string | null;
  unitName: string | null;
  totalQuantity: string;
  totalRevenue: string;
  totalCost: string;
  totalProfit: string;
  profitMargin: string;
  orderCount: string;
}

interface DailySalesAggRow {
  date: string;
  revenue: string;
  cost: string;
  profit: string;
  ordercount: string;
  itemquantity: string;
}

interface SummaryAggRow {
  total_revenue: string;
  total_cost: string;
  total_profit: string;
  total_quantity: string;
  total_orders: string;
  product_count: string;
  day_count: string;
}

const SORT_COLUMN_MAP: Record<SortableField, string> = {
  revenue: 'totalRevenue',
  quantity: 'totalQuantity',
  profit: 'totalProfit',
  productName: 'productName',
};

const r2 = (v: number) => Math.round(v * 100) / 100;

const reportService = {
  // ── Báo cáo theo sản phẩm — raw SQL GROUP BY, DB làm aggregation + pagination ──
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

    // Build WHERE clause cho orders (date filter) — chỉ tính đơn COMPLETED
    const conditions: string[] = [`o.status = 'COMPLETED'`];
    const queryParams: Prisma.Sql[] = [];

    if (from) {
      queryParams.push(Prisma.sql`${from}::date`);
      conditions.push(`o."createdAt" >= ${from}::date`);
    }
    if (to) {
      queryParams.push(Prisma.sql`${to}::date`);
      conditions.push(`o."createdAt" <= ${to}::date + interval '1 day' - interval '1 millisecond'`);
    }
    if (categoryId) {
      queryParams.push(Prisma.sql`${categoryId}::uuid`);
      conditions.push(`p."categoryId" = ${categoryId}::uuid`);
    }

    const whereClause = conditions.join(' AND ');
    const sortColumn = SORT_COLUMN_MAP[sortBy] || 'totalRevenue';
    const sortDirSql = sortDir === 'asc' ? 'ASC' : 'DESC';
    const offset = (page - 1) * size;

    // Query 1: paginated rows (chỉ lấy 1 page)
    const rowsQuery = Prisma.sql`
      SELECT
        p.id AS "productId",
        p.code AS "productCode",
        p.name AS "productName",
        cat.name AS "categoryName",
        u.name AS "unitName",
        SUM(oi.quantity) AS "totalQuantity",
        SUM(oi.quantity * oi."unitPrice") AS "totalRevenue",
        SUM(oi.quantity * oi."costPriceAtSale") AS "totalCost",
        SUM(oi.quantity * oi."unitPrice") - SUM(oi.quantity * oi."costPriceAtSale") AS "totalProfit",
        CASE WHEN SUM(oi.quantity * oi."unitPrice") > 0
          THEN (SUM(oi.quantity * oi."unitPrice") - SUM(oi.quantity * oi."costPriceAtSale")) / SUM(oi.quantity * oi."unitPrice") * 100
          ELSE 0 END AS "profitMargin",
        COUNT(DISTINCT oi."orderId") AS "orderCount"
      FROM order_items oi
      JOIN orders o ON oi."orderId" = o.id
      JOIN products p ON oi."productId" = p.id
      LEFT JOIN categories cat ON p."categoryId" = cat.id
      LEFT JOIN units u ON p."unitId" = u.id
      WHERE ${Prisma.raw(whereClause)}
      GROUP BY p.id, p.code, p.name, cat.name, u.name
      ORDER BY ${Prisma.raw(`"${sortColumn}" ${sortDirSql}`)}
      LIMIT ${size} OFFSET ${offset}
    `;

    // Query 2: summary (tính trên ALL rows, không paginate)
    const summaryQuery = Prisma.sql`
      SELECT
        COALESCE(SUM(rev), 0) AS total_revenue,
        COALESCE(SUM(cost), 0) AS total_cost,
        COALESCE(SUM(rev - cost), 0) AS total_profit,
        COALESCE(SUM(qty), 0) AS total_quantity,
        COUNT(DISTINCT order_id) AS total_orders,
        COUNT(DISTINCT product_id) AS product_count
      FROM (
        SELECT
          oi."productId" AS product_id,
          oi."orderId" AS order_id,
          oi.quantity AS qty,
          oi.quantity * oi."unitPrice" AS rev,
          oi.quantity * oi."costPriceAtSale" AS cost
        FROM order_items oi
        JOIN orders o ON oi."orderId" = o.id
        JOIN products p ON oi."productId" = p.id
        WHERE ${Prisma.raw(whereClause)}
      ) sub
    `;

    // Query 3: total count (cho pagination)
    const countQuery = Prisma.sql`
      SELECT COUNT(DISTINCT oi."productId") AS cnt
      FROM order_items oi
      JOIN orders o ON oi."orderId" = o.id
      JOIN products p ON oi."productId" = p.id
      WHERE ${Prisma.raw(whereClause)}
    `;

    const [rowsResult, summaryResult, countResult] = await Promise.all([
      prisma.$queryRaw<ProductSalesAggRow[]>(rowsQuery),
      prisma.$queryRaw<SummaryAggRow[]>(summaryQuery),
      prisma.$queryRaw<{ cnt: bigint }[]>(countQuery),
    ]);

    const total = Number(countResult[0]?.cnt ?? 0);

    if (total === 0 || rowsResult.length === 0) {
      return {
        items: [] as ProductSalesRow[],
        summary: {
          totalRevenue: 0, totalCost: 0, totalProfit: 0,
          totalQuantity: 0, totalOrders: 0, productCount: 0,
        } as ProductSalesSummary,
        total: 0, page, size,
      };
    }

    const items: ProductSalesRow[] = rowsResult.map((r) => ({
      productId: r.productId,
      productCode: r.productCode,
      productName: r.productName,
      categoryName: r.categoryName,
      unitName: r.unitName,
      totalQuantity: Number(r.totalQuantity),
      totalRevenue: r2(Number(r.totalRevenue)),
      totalCost: r2(Number(r.totalCost)),
      totalProfit: r2(Number(r.totalProfit)),
      profitMargin: r2(Number(r.profitMargin)),
      orderCount: Number(r.orderCount),
    }));

    const s = summaryResult[0];
    const summary: ProductSalesSummary = {
      totalRevenue: r2(Number(s?.total_revenue ?? 0)),
      totalCost: r2(Number(s?.total_cost ?? 0)),
      totalProfit: r2(Number(s?.total_profit ?? 0)),
      totalQuantity: Number(s?.total_quantity ?? 0),
      totalOrders: Number(s?.total_orders ?? 0),
      productCount: Number(s?.product_count ?? 0),
    };

    return { items, summary, total, page, size };
  },

  // ── Saved reports (persist snapshots to DB) ──────────────────────────

  async saveReport(params: {
    name: string;
    from?: string;
    to?: string;
    categoryId?: string;
    createdBy: string;
  }) {
    // Fetch ALL items for snapshot — dùng raw SQL không paginate
    const allData = await this.productSales({
      from: params.from,
      to: params.to,
      categoryId: params.categoryId,
      page: 1,
      size: 999999, // fetch all
    });

    const report = await prisma.productPerformanceReport.create({
      data: {
        name: params.name,
        from: params.from ? new Date(params.from) : null,
        to: params.to ? new Date(params.to) : null,
        categoryId: params.categoryId ?? null,
        totalRevenue: allData.summary.totalRevenue,
        totalCost: allData.summary.totalCost,
        totalProfit: allData.summary.totalProfit,
        totalQuantity: allData.summary.totalQuantity,
        totalOrders: allData.summary.totalOrders,
        productCount: allData.summary.productCount,
        createdBy: params.createdBy,
        items: {
          create: allData.items.map((item) => ({
            productId: item.productId,
            productCode: item.productCode,
            productName: item.productName,
            categoryName: item.categoryName,
            unitName: item.unitName,
            totalQuantity: item.totalQuantity,
            totalRevenue: item.totalRevenue,
            totalCost: item.totalCost,
            totalProfit: item.totalProfit,
            profitMargin: item.profitMargin,
            orderCount: item.orderCount,
          })),
        },
      },
      include: { items: true },
    });

    return report;
  },

  async listReports(page = 1, size = 20) {
    const [items, total] = await Promise.all([
      prisma.productPerformanceReport.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * size,
        take: size,
        include: { createdByUser: { select: { id: true, fullName: true } } },
      }),
      prisma.productPerformanceReport.count(),
    ]);
    return { items, total, page, size };
  },

  async getReport(id: string) {
    return prisma.productPerformanceReport.findUnique({
      where: { id },
      include: { items: { orderBy: { totalRevenue: 'desc' } } },
    });
  },

  async deleteReport(id: string) {
    return prisma.productPerformanceReport.delete({ where: { id } });
  },

  // ── Báo cáo doanh thu theo ngày — raw SQL GROUP BY DATE ──────────────
  async dailySales(params: { from?: string; to?: string }) {
    const conditions: string[] = [`o.status = 'COMPLETED'`];

    if (params.from) {
      conditions.push(`o."createdAt" >= ${params.from}::date`);
    }
    if (params.to) {
      conditions.push(`o."createdAt" <= ${params.to}::date + interval '1 day' - interval '1 millisecond'`);
    }

    const whereClause = conditions.join(' AND ');

    // Query 1: daily aggregation — GROUP BY DATE
    const rowsQuery = Prisma.sql`
      SELECT
        DATE(o."createdAt") AS date,
        SUM(o."totalComputed") AS revenue,
        SUM(oi.quantity * oi."costPriceAtSale") AS cost,
        SUM(o."totalComputed") - SUM(oi.quantity * oi."costPriceAtSale") AS profit,
        COUNT(DISTINCT o.id) AS ordercount,
        SUM(oi.quantity) AS itemquantity
      FROM orders o
      JOIN order_items oi ON oi."orderId" = o.id
      WHERE ${Prisma.raw(whereClause)}
      GROUP BY DATE(o."createdAt")
      ORDER BY date ASC
    `;

    // Query 2: summary
    const summaryQuery = Prisma.sql`
      SELECT
        COALESCE(SUM(rev), 0) AS total_revenue,
        COALESCE(SUM(cost), 0) AS total_cost,
        COALESCE(SUM(profit), 0) AS total_profit,
        COUNT(DISTINCT order_id) AS total_orders,
        COALESCE(SUM(qty), 0) AS total_quantity,
        COUNT(DISTINCT dt) AS day_count
      FROM (
        SELECT
          DATE(o."createdAt") AS dt,
          o.id AS order_id,
          o."totalComputed" AS rev,
          oi.quantity AS qty,
          oi.quantity * oi."costPriceAtSale" AS cost,
          o."totalComputed" - oi.quantity * oi."costPriceAtSale" AS profit
        FROM orders o
        JOIN order_items oi ON oi."orderId" = o.id
        WHERE ${Prisma.raw(whereClause)}
      ) sub
    `;

    const [rowsResult, summaryResult] = await Promise.all([
      prisma.$queryRaw<DailySalesAggRow[]>(rowsQuery),
      prisma.$queryRaw<SummaryAggRow[]>(summaryQuery),
    ]);

    const items = rowsResult.map((r) => ({
      date: new Date(r.date).toISOString().slice(0, 10),
      revenue: r2(Number(r.revenue)),
      cost: r2(Number(r.cost)),
      profit: r2(Number(r.profit)),
      orderCount: Number(r.ordercount),
      itemQuantity: Number(r.itemquantity),
    }));

    const s = summaryResult[0];
    const summary = {
      totalRevenue: r2(Number(s?.total_revenue ?? 0)),
      totalCost: r2(Number(s?.total_cost ?? 0)),
      totalProfit: r2(Number(s?.total_profit ?? 0)),
      totalOrders: Number(s?.total_orders ?? 0),
      totalQuantity: Number(s?.total_quantity ?? 0),
      dayCount: Number(s?.day_count ?? 0),
    };

    return { items, summary };
  },
};

export { reportService };