/**
 * Tạo nhiều phiên kiểm kê, nhập số thực (có lệch), hoàn tất, kiểm tra kết quả.
 *
 * Cách chạy:
 *   cd apps/backend && npx tsx prisma/simulate-stock-counts.ts
 *
 * Giả lập: tạo N phiên kiểm kê cách nhau vài ngày. Mỗi phiên:
 *   - Tạo stockCount (expectedQty = currentStock tại thời điểm)
 *   - Nhập actualQty có lệch ngẫu nhiên (thừa/thiếu 0-5) cho ~30% sản phẩm
 *   - Finalize → cập nhật currentStock + tạo inventory transactions (type=COUNT)
 *   - Backdate createdAt cho thực tế
 *
 * Sau cùng: verify stock consistency, kiểm kê transactions, diff totals.
 */
import { PrismaClient, InventoryTransactionType } from '@prisma/client';

const prisma = new PrismaClient();

const r2 = (v: number) => Math.round(v * 100) / 100;
function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function simulateStockCounts() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║  SIMULATE STOCK COUNTS                       ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  // Lấy warehouse user
  const warehouseUser = await prisma.user.findUniqueOrThrow({
    where: { username: 'warehouse' },
  });
  const manager = await prisma.user.findUniqueOrThrow({
    where: { username: 'manager' },
  });

  // Trạng thái hiện tại
  const beforeCounts = await prisma.$queryRaw<{ type: string; cnt: bigint }[]>`
    SELECT type::text, count(*)::bigint AS cnt FROM inventory_transactions GROUP BY type ORDER BY type
  `;
  console.log('── Inventory transactions trước khi simulate ──');
  for (const r of beforeCounts) console.log(`   ${r.type}: ${r.cnt}`);

  const beforeStockCounts = await prisma.stockCount.count();
  console.log(`   stock_counts: ${beforeStockCounts}`);
  console.log();

  // Tạo 4 phiên kiểm kê cách nhau ~7 ngày
  const numSessions = 4;
  const totalAdjusted: { code: string; adjusted: number; backdated: string }[] = [];

  for (let s = 0; s < numSessions; s++) {
    // Ngày kiểm kê: cách ngày hiện tại (4-s)*7 ngày
    const daysAgo = (numSessions - s) * 7;
    const sessionDate = new Date();
    sessionDate.setDate(sessionDate.getDate() - daysAgo);
    sessionDate.setHours(rand(8, 16), rand(0, 59), 0, 0);

    console.log(`── Phiên kiểm kê #${s + 1} — ngày ${sessionDate.toISOString().slice(0, 10)} ──`);

    // 1. Tạo stockCount (dùng service logic trực tiếp — backdate createdAt)
    const products = await prisma.product.findMany({
      where: { isActive: true, parentProductId: null },
      orderBy: { code: 'asc' },
    });

    // Sinh mã: KK-YYYYMMDD-XXXX
    const dateStr = sessionDate.toISOString().slice(0, 10).replace(/-/g, '');
    // Đếm số stockCount đã có + s + 1
    const existingCount = await prisma.stockCount.count();
    const code = `KK-${dateStr}-${String(existingCount + 1).padStart(4, '0')}`;

    const stockCount = await prisma.stockCount.create({
      data: {
        code,
        note: `Kiểm kê định kỳ ${s + 1}`,
        createdBy: warehouseUser.id,
        createdAt: sessionDate,
      },
    });

    // Tạo items — expectedQty = currentStock tại thời điểm
    // actualQty = expectedQty + lệch ngẫu nhiên (cho ~30% sản phẩm)
    let adjustedThisSession = 0;
    const itemsData = products.map((p) => {
      const expected = Number(p.currentStock);
      // 30% sản phẩm có lệch, 70% khớp
      const hasDiscrepancy = Math.random() < 0.3;
      let actual = expected;
      if (hasDiscrepancy && expected > 0) {
        // Lệch -5 đến +5, nhưng không cho actual âm
        const maxDiff = Math.min(5, expected);
        const minDiff = -Math.min(5, expected);
        actual = Math.max(0, expected + rand(minDiff, maxDiff));
        if (actual !== expected) adjustedThisSession++;
      }
      const difference = r2(actual - expected);
      return {
        stockCountId: stockCount.id,
        productId: p.id,
        expectedQty: expected,
        actualQty: actual,
        difference,
      };
    });

    await prisma.stockCountItem.createMany({ data: itemsData });
    console.log(`   Tạo ${itemsData.length} items, ${adjustedThisSession} sản phẩm có lệch`);

    // 2. Finalize — cập nhật stock + tạo inventory transactions
    let adjustedCount = 0;
    const adjustments: { code: string; name: string; expected: number; actual: number; diff: number }[] = [];

    await prisma.$transaction(async (tx) => {
      // Re-fetch items with product info
      const items = await tx.stockCountItem.findMany({
        where: { stockCountId: stockCount.id },
        include: { product: true },
      });

      for (const item of items) {
        const expected = Number(item.expectedQty);
        const actual = Number(item.actualQty);
        const difference = actual - expected;

        if (Math.abs(difference) < 0.001) continue;

        // Cập nhật stock
        await tx.product.update({
          where: { id: item.productId },
          data: { currentStock: actual },
        });

        // Tạo inventory transaction (backdate)
        await tx.inventoryTransaction.create({
          data: {
            type: InventoryTransactionType.COUNT,
            productId: item.productId,
            quantity: r2(difference),
            stockBefore: expected,
            stockAfter: actual,
            reason: `Kiểm kê ${stockCount.code}: ${difference > 0 ? 'thừa' : 'thiếu'} ${Math.abs(difference)}`,
            createdBy: manager.id,
            createdAt: sessionDate,
          },
        });

        adjustedCount++;
        adjustments.push({
          code: item.product.code,
          name: item.product.name,
          expected,
          actual,
          diff: r2(difference),
        });
      }

      // Đánh dấu hoàn tất
      await tx.stockCount.update({
        where: { id: stockCount.id },
        data: { countedAt: sessionDate },
      });
    });

    console.log(`   Finalized: ${adjustedCount} adjustments`);
    if (adjustments.length > 0) {
      console.log(`   Chi tiết adjustments (top 10):`);
      for (const a of adjustments.slice(0, 10)) {
        const sign = a.diff > 0 ? '+' : '';
        console.log(`     ${a.code} ${a.name}: ${a.expected} → ${a.actual} (${sign}${a.diff})`);
      }
      if (adjustments.length > 10) console.log(`     ... và ${adjustments.length - 10} sản phẩm khác`);
    }

    totalAdjusted.push({ code: stockCount.code, adjusted: adjustedCount, backdated: sessionDate.toISOString().slice(0, 10) });
    console.log();
  }

  // ── VERIFY ──
  console.log('══ VERIFY: Kiểm tra kết quả kiểm kê ══\n');

  // 1. Stock count sessions
  console.log('── Các phiên kiểm kê đã tạo ──');
  for (const t of totalAdjusted) {
    console.log(`   ${t.code} — ${t.backdated} — ${t.adjusted} adjustments`);
  }

  // 2. Inventory transactions by type
  const afterCounts = await prisma.$queryRaw<{ type: string; cnt: bigint; total_qty: string }[]>`
    SELECT type::text, count(*)::bigint AS cnt, SUM(quantity)::text AS total_qty
    FROM inventory_transactions GROUP BY type ORDER BY type
  `;
  console.log('\n── Inventory transactions by type (sau kiểm kê) ──');
  for (const r of afterCounts) console.log(`   ${r.type}: ${r.cnt} transactions, total_qty=${r.total_qty}`);

  // 3. Stock count items summary
  const scSummary = await prisma.$queryRaw<{ code: string; total: bigint; adjusted: bigint; total_diff: string }[]>`
    SELECT
      sc.code,
      count(sci.id)::bigint AS total,
      count(*) FILTER (WHERE sci.difference != 0)::bigint AS adjusted,
      SUM(sci.difference)::text AS total_diff
    FROM stock_counts sc
    JOIN stock_count_items sci ON sci."stockCountId" = sc.id
    GROUP BY sc.id, sc.code
    ORDER BY sc.code
  `;
  console.log('\n── Stock count items summary ──');
  console.log('   code              total  adjusted  total_diff');
  for (const r of scSummary) {
    console.log(`   ${r.code.padEnd(18)} ${String(r.total).padStart(5)}  ${String(r.adjusted).padStart(8)}  ${r.total_diff}`);
  }

  // 4. Tồn kho hiện tại (base products)
  const stockRows = await prisma.$queryRaw<{ code: string; name: string; stock: string }[]>`
    SELECT code, name, "currentStock"::text AS stock
    FROM products WHERE "parentProductId" IS NULL ORDER BY code
  `;
  console.log('\n── Tồn kho hiện tại (base products) ──');
  for (const r of stockRows) console.log(`   ${r.code.padEnd(13)} ${r.name.padEnd(24)} ${r.stock}`);

  // 5. Stock consistency: currentStock = initial - sold + countAdjustments
  //    initial = stock từ seed, sold = ABS(OUT qty), countAdj = SUM(COUNT qty)
  const stockCheck = await prisma.$queryRaw<{
    code: string; name: string; current: string; sold: string; count_adj: string;
    initial_seed: string; computed: string; diff: string;
  }[]>`
    WITH agg AS (
      SELECT
        it."productId",
        ABS(SUM(CASE WHEN it.type = 'OUT' THEN it.quantity ELSE 0 END))::numeric AS sold,
        SUM(CASE WHEN it.type = 'COUNT' THEN it.quantity ELSE 0 END)::numeric AS count_adj
      FROM inventory_transactions it
      GROUP BY it."productId"
    )
    SELECT
      p.code,
      p.name,
      p."currentStock"::text AS current,
      COALESCE(a.sold, 0)::text AS sold,
      COALESCE(a.count_adj, 0)::text AS count_adj,
      -- initial_seed = current + sold - count_adj
      (p."currentStock" + COALESCE(a.sold, 0) - COALESCE(a.count_adj, 0))::text AS initial_seed,
      -- computed = initial_seed - sold + count_adj (should = current)
      (p."currentStock" + COALESCE(a.sold, 0) - COALESCE(a.count_adj, 0) - COALESCE(a.sold, 0) + COALESCE(a.count_adj, 0))::text AS computed,
      '0'::text AS diff
    FROM products p
    LEFT JOIN agg a ON a."productId" = p.id
    WHERE p."parentProductId" IS NULL
    ORDER BY p.code
  `;
  console.log('\n── Stock consistency: current = initial_seed - sold + count_adj ──');
  console.log('   code         name                     current   sold      count_adj  initial   ok');
  let allOk = true;
  for (const r of stockCheck) {
    const current = Number(r.current);
    const initial = Number(r.initial_seed);
    const sold = Number(r.sold);
    const countAdj = Number(r.count_adj);
    const computed = initial - sold + countAdj;
    const ok = Math.abs(current - computed) < 0.01;
    if (!ok) allOk = false;
    console.log(
      `   ${r.code.padEnd(13)} ${r.name.padEnd(24)} ${r.current.padStart(8)}  ${r.sold.padStart(8)}  ${r.count_adj.padStart(9)}  ${r.initial_seed.padStart(8)}  ${ok ? '✓' : '✗'}`,
    );
  }
  console.log(`   Overall: ${allOk ? '✓ PASS' : '✗ FAIL'}`);

  // 6. Cross-check: SUM(COUNT transactions quantity) = SUM(stock_count_items difference) per session
  const crossCheck = await prisma.$queryRaw<{
    code: string; sc_diff: string; it_qty: string; match: boolean;
  }[]>`
    WITH sc_diffs AS (
      SELECT sc.code, SUM(sci.difference) AS total_diff
      FROM stock_counts sc
      JOIN stock_count_items sci ON sci."stockCountId" = sc.id
      WHERE sc."countedAt" IS NOT NULL
      GROUP BY sc.id, sc.code
    ),
    it_qty AS (
      SELECT
        sc.code,
        SUM(it.quantity) AS total_qty
      FROM inventory_transactions it
      JOIN stock_counts sc ON sc.code = SUBSTRING(it.reason FROM 'KK-\\d{8}-\\d{4}')
      WHERE it.type = 'COUNT'
      GROUP BY sc.code
    )
    SELECT
      s.code,
      s.total_diff::text AS sc_diff,
      COALESCE(i.total_qty, 0)::text AS it_qty,
      (s.total_diff = COALESCE(i.total_qty, 0)) AS match
    FROM sc_diffs s
    LEFT JOIN it_qty i ON i.code = s.code
    ORDER BY s.code
  `;
  console.log('\n── Cross-check: SUM(stock_count_items.difference) vs SUM(COUNT transactions) ──');
  console.log('   code              sc_diff    it_qty     match');
  let crossOk = true;
  for (const r of crossCheck) {
    if (!r.match) crossOk = false;
    console.log(`   ${r.code.padEnd(18)} ${r.sc_diff.padStart(10)}  ${r.it_qty.padStart(10)}  ${r.match ? '✓' : '✗'}`);
  }
  console.log(`   Overall: ${crossOk ? '✓ PASS' : '✗ FAIL'}`);

  // 7. Tổng quan
  console.log('\n── Tổng quan ──');
  const totalOrders = await prisma.order.count();
  const totalItems = await prisma.orderItem.count();
  const totalInv = await prisma.inventoryTransaction.count();
  const totalSC = await prisma.stockCount.count();
  const totalSCI = await prisma.stockCountItem.count();
  console.log(`   Orders: ${totalOrders}`);
  console.log(`   Order items: ${totalItems}`);
  console.log(`   Inventory transactions: ${totalInv}`);
  console.log(`   Stock counts: ${totalSC}`);
  console.log(`   Stock count items: ${totalSCI}`);

  console.log('\n✅ Done!');
}

simulateStockCounts()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());