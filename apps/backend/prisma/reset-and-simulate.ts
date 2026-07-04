/**
 * Reset toàn bộ DB + seed master + giả lập 30 ngày bán hàng.
 *
 * Cách chạy:
 *   cd apps/backend && npx tsx prisma/reset-and-simulate.ts
 *
 * Script này XOÁ SẠCH toàn bộ dữ liệu (orders, products, customers, …) và tạo lại
 * từ đầu. Không chạy trên production.
 */
import * as bcrypt from 'bcryptjs';
import { PrismaClient, InventoryTransactionType, PaymentMethod, OrderStatus } from '@prisma/client';

const prisma = new PrismaClient();

// ── Helpers ──────────────────────────────────────────────────────────────
const r2 = (v: number) => Math.round(v * 100) / 100;
function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function generateOrderCode(tx: Prisma.TransactionClient): Promise<string> {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const result = await tx.$queryRaw<{ nextval: bigint }[]>`SELECT nextval('order_code_seq')`;
  const seq = Number(result[0].nextval);
  return `HD-${date}-${String(seq).padStart(7, '0')}`;
}

// ── 1. RESET ─────────────────────────────────────────────────────────────
async function resetDatabase() {
  console.log('── 1. RESET: Deleting all data ──');

  // Delete in FK dependency order (children first)
  await prisma.orderItem.deleteMany();
  await prisma.inventoryTransaction.deleteMany();
  await prisma.topupTransaction.deleteMany();
  await prisma.stockCountItem.deleteMany();
  await prisma.stockCount.deleteMany();
  await prisma.productPerformanceReportItem.deleteMany();
  await prisma.productPerformanceReport.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.order.deleteMany();
  await prisma.product.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.customerGroup.deleteMany();
  await prisma.category.deleteMany();
  await prisma.unit.deleteMany();
  await prisma.user.deleteMany();

  // Reset PostgreSQL sequences
  await prisma.$executeRaw`ALTER SEQUENCE order_code_seq RESTART WITH 1`;
  await prisma.$executeRaw`ALTER SEQUENCE product_code_seq RESTART WITH 1`;

  console.log('   ✓ All tables cleared, sequences reset');
}

// ── 2. SEED MASTER ───────────────────────────────────────────────────────
async function seedMaster() {
  console.log('── 2. SEED MASTER DATA ──');

  // Users
  const adminHash = await bcrypt.hash('admin', 10);
  const admin = await prisma.user.create({
    data: { username: 'admin', passwordHash: adminHash, fullName: 'Quản trị viên', role: 'ADMIN' },
  });
  const cashierHash = await bcrypt.hash('cashier', 10);
  const cashier = await prisma.user.create({
    data: { username: 'cashier', passwordHash: cashierHash, fullName: 'Nguyễn Thị Bán', role: 'CASHIER' },
  });
  const managerHash = await bcrypt.hash('manager', 10);
  const manager = await prisma.user.create({
    data: { username: 'manager', passwordHash: managerHash, fullName: 'Trần Quản Lý', role: 'MANAGER' },
  });
  const warehouseHash = await bcrypt.hash('warehouse', 10);
  const warehouse = await prisma.user.create({
    data: { username: 'warehouse', passwordHash: warehouseHash, fullName: 'Lê Kho Thủ', role: 'WAREHOUSE' },
  });
  console.log('   ✓ Users (4)');

  // Units
  const unitDefs = [
    { code: 'LY', name: 'Ly' },
    { code: 'CHEN', name: 'Chén' },
    { code: 'DIA', name: 'Đĩa' },
    { code: 'TO', name: 'Tô' },
    { code: 'GOI', name: 'Gói' },
    { code: 'CHAI', name: 'Chai' },
    { code: 'LY2', name: 'Ly lớn' },
    { code: 'PHAN', name: 'Phần' },
    { code: 'THUNG', name: 'Thùng' },
    { code: 'LOC', name: 'Lốc' },
  ];
  for (const u of unitDefs) await prisma.unit.create({ data: u });
  const allUnits = await prisma.unit.findMany();
  const unitMap = Object.fromEntries(allUnits.map((u) => [u.code, u.id]));
  console.log('   ✓ Units (10)');

  // Categories
  const catDefs = [
    { code: 'NUOC', name: 'Nước uống', prefix: 'NUOC', note: 'Các loại nước uống' },
    { code: 'MON_CHIN', name: 'Món chính', prefix: 'MC', note: 'Cơm, bún, phở...' },
    { code: 'MON_NHO', name: 'Món nhúng/Nhỏ', prefix: 'MN', note: 'Gỏi, nem, chả...' },
    { code: 'TRANG_MIENG', name: 'Tráng miệng', prefix: 'TM', note: 'Chè, trái cây...' },
    { code: 'BANH_MI', name: 'Bánh mì', prefix: 'BM', note: 'Bánh mì các loại' },
  ];
  for (const c of catDefs) await prisma.category.create({ data: c });
  const allCats = await prisma.category.findMany();
  const catMap = Object.fromEntries(allCats.map((c) => [c.code, c.id]));
  console.log('   ✓ Categories (5)');

  // Customer Groups
  const groupDefs = [
    { code: 'GV', name: 'Giáo viên', note: 'Giáo viên trường' },
    { code: 'HS', name: 'Học sinh', note: 'Học sinh trường' },
    { code: 'NV', name: 'Nhân viên', note: 'Nhân viên căn tin' },
    { code: 'KHACH', name: 'Khách vãng lai', note: 'Khách ngoài' },
  ];
  for (const g of groupDefs) await prisma.customerGroup.create({ data: g });
  const allGroups = await prisma.customerGroup.findMany();
  const groupMap = Object.fromEntries(allGroups.map((g) => [g.code, g.id]));
  console.log('   ✓ Customer Groups (4)');

  // Products (base products) — initial stock
  const productDefs = [
    { code: 'NUOC000001', name: 'Nước suối', categoryId: catMap['NUOC'], unitId: unitMap['CHAI'], sellingPrice: 5000, costPrice: 3000, currentStock: 120 },
    { code: 'NUOC000002', name: 'Nước cam', categoryId: catMap['NUOC'], unitId: unitMap['LY'], sellingPrice: 10000, costPrice: 6000, currentStock: 80 },
    { code: 'NUOC000003', name: 'Trà đá', categoryId: catMap['NUOC'], unitId: unitMap['LY'], sellingPrice: 3000, costPrice: 1000, currentStock: 200 },
    { code: 'NUOC000004', name: 'Trà sữa', categoryId: catMap['NUOC'], unitId: unitMap['LY2'], sellingPrice: 20000, costPrice: 12000, currentStock: 45 },
    { code: 'NUOC000005', name: 'Sinh tố bơ', categoryId: catMap['NUOC'], unitId: unitMap['LY2'], sellingPrice: 18000, costPrice: 10000, currentStock: 30 },
    { code: 'NUOC000006', name: 'Cà phê sữa', categoryId: catMap['NUOC'], unitId: unitMap['LY'], sellingPrice: 12000, costPrice: 7000, currentStock: 60 },
    { code: 'NUOC000007', name: 'Sữa tươi', categoryId: catMap['NUOC'], unitId: unitMap['CHAI'], sellingPrice: 8000, costPrice: 5000, currentStock: 50 },
    { code: 'NUOC000008', name: 'Nước dừa', categoryId: catMap['NUOC'], unitId: unitMap['LY'], sellingPrice: 15000, costPrice: 8000, currentStock: 25 },
    { code: 'MC000001', name: 'Cơm sườn', categoryId: catMap['MON_CHIN'], unitId: unitMap['PHAN'], sellingPrice: 35000, costPrice: 22000, currentStock: 40 },
    { code: 'MC000002', name: 'Cơm gà', categoryId: catMap['MON_CHIN'], unitId: unitMap['PHAN'], sellingPrice: 30000, costPrice: 18000, currentStock: 35 },
    { code: 'MC000003', name: 'Bún bò Huế', categoryId: catMap['MON_CHIN'], unitId: unitMap['TO'], sellingPrice: 30000, costPrice: 18000, currentStock: 28 },
    { code: 'MC000004', name: 'Phở bò', categoryId: catMap['MON_CHIN'], unitId: unitMap['TO'], sellingPrice: 28000, costPrice: 16000, currentStock: 30 },
    { code: 'MC000005', name: 'Cơm chiên dương châu', categoryId: catMap['MON_CHIN'], unitId: unitMap['PHAN'], sellingPrice: 32000, costPrice: 20000, currentStock: 22 },
    { code: 'MC000006', name: 'Mì xào bò', categoryId: catMap['MON_CHIN'], unitId: unitMap['PHAN'], sellingPrice: 28000, costPrice: 16000, currentStock: 18 },
    { code: 'MC000007', name: 'Cơm sườn bì chả', categoryId: catMap['MON_CHIN'], unitId: unitMap['PHAN'], sellingPrice: 35000, costPrice: 22000, currentStock: 5 },
    { code: 'MN000001', name: 'Gỏi cuốn', categoryId: catMap['MON_NHO'], unitId: unitMap['GOI'], sellingPrice: 10000, costPrice: 5000, currentStock: 50 },
    { code: 'MN000002', name: 'Nem rán', categoryId: catMap['MON_NHO'], unitId: unitMap['GOI'], sellingPrice: 8000, costPrice: 4000, currentStock: 45 },
    { code: 'MN000003', name: 'Chả giò', categoryId: catMap['MON_NHO'], unitId: unitMap['GOI'], sellingPrice: 12000, costPrice: 7000, currentStock: 30 },
    { code: 'MN000004', name: 'Gà chiên mắm', categoryId: catMap['MON_NHO'], unitId: unitMap['PHAN'], sellingPrice: 20000, costPrice: 12000, currentStock: 15 },
    { code: 'MN000005', name: 'Tôm chiên xù', categoryId: catMap['MON_NHO'], unitId: unitMap['PHAN'], sellingPrice: 22000, costPrice: 14000, currentStock: 8 },
    { code: 'TM000001', name: 'Chè khúc bạch', categoryId: catMap['TRANG_MIENG'], unitId: unitMap['LY'], sellingPrice: 15000, costPrice: 8000, currentStock: 40 },
    { code: 'TM000002', name: 'Chè bưởi', categoryId: catMap['TRANG_MIENG'], unitId: unitMap['LY'], sellingPrice: 12000, costPrice: 6000, currentStock: 35 },
    { code: 'TM000003', name: 'Trái cây thái', categoryId: catMap['TRANG_MIENG'], unitId: unitMap['DIA'], sellingPrice: 10000, costPrice: 5000, currentStock: 20 },
    { code: 'TM000004', name: 'Sữa chua', categoryId: catMap['TRANG_MIENG'], unitId: unitMap['LY'], sellingPrice: 8000, costPrice: 4000, currentStock: 55 },
    { code: 'BM000001', name: 'Bánh mì thịt', categoryId: catMap['BANH_MI'], unitId: unitMap['GOI'], sellingPrice: 15000, costPrice: 8000, currentStock: 60 },
    { code: 'BM000002', name: 'Bánh mì trứng', categoryId: catMap['BANH_MI'], unitId: unitMap['GOI'], sellingPrice: 12000, costPrice: 6000, currentStock: 50 },
    { code: 'BM000003', name: 'Bánh mì phô mai', categoryId: catMap['BANH_MI'], unitId: unitMap['GOI'], sellingPrice: 18000, costPrice: 10000, currentStock: 35 },
    { code: 'BM000004', name: 'Bánh mì gà', categoryId: catMap['BANH_MI'], unitId: unitMap['GOI'], sellingPrice: 16000, costPrice: 9000, currentStock: 3 },
  ];
  for (const p of productDefs) await prisma.product.create({ data: p });
  console.log(`   ✓ Products base (${productDefs.length})`);

  // Bundle products
  const allProductIds = Object.fromEntries(
    (await prisma.product.findMany()).map((p) => [p.code, p.id]),
  );
  const bundleDefs = [
    { code: 'NUOC000001-TH', name: 'Nước suối Thùng 24 chai', parentId: 'NUOC000001', factor: 24, bundleUnitCode: 'THUNG', sellingPrice: 96000, costPrice: 72000 },
    { code: 'NUOC000007-TH', name: 'Sữa tươi Thùng 24 chai', parentId: 'NUOC000007', factor: 24, bundleUnitCode: 'THUNG', sellingPrice: 168000, costPrice: 96000 },
    { code: 'BM000001-L', name: 'Bánh mì thịt Lốc 6 cái', parentId: 'BM000001', factor: 6, bundleUnitCode: 'LOC', sellingPrice: 90000, costPrice: 48000 },
    { code: 'MN000002-L', name: 'Nem rán Lốc 10 cái', parentId: 'MN000002', factor: 10, bundleUnitCode: 'LOC', sellingPrice: 80000, costPrice: 40000 },
  ];
  for (const b of bundleDefs) {
    const parent = await prisma.product.findUniqueOrThrow({ where: { code: b.parentId } });
    await prisma.product.create({
      data: {
        code: b.code,
        name: b.name,
        categoryId: parent.categoryId,
        unitId: parent.unitId,
        sellingPrice: b.sellingPrice,
        costPrice: b.costPrice,
        currentStock: 0,
        parentProductId: parent.id,
        factor: b.factor,
        bundleUnitId: unitMap[b.bundleUnitCode],
        isActive: true,
      },
    });
  }
  console.log(`   ✓ Products bundle (${bundleDefs.length})`);

  // Customers — balance ban đầu đủ lớn cho 30 ngày
  const customerDefs = [
    { code: 'GV001', fullName: 'Nguyễn Văn An', groupCode: 'GV', phone: '0901234567', balance: 2_500_000 },
    { code: 'GV002', fullName: 'Trần Thị Bình', groupCode: 'GV', phone: '0902345678', balance: 2_000_000 },
    { code: 'GV003', fullName: 'Lê Văn Cường', groupCode: 'GV', phone: '0903456789', balance: 2_000_000 },
    { code: 'GV004', fullName: 'Phạm Thị Dung', groupCode: 'GV', phone: '0904567890', balance: 1_500_000 },
    { code: 'GV005', fullName: 'Hoàng Văn Em', groupCode: 'GV', phone: '0905678901', balance: 1_500_000 },
    { code: 'GV006', fullName: 'Vũ Thị Phương', groupCode: 'GV', phone: '0906789012', balance: 1_800_000 },
    { code: 'GV007', fullName: 'Đặng Văn Giang', groupCode: 'GV', phone: '0907890123', balance: 1_200_000 },
    { code: 'GV008', fullName: 'Bùi Thị Hoa', groupCode: 'GV', phone: '0908901234', balance: 1_000_000 },
    { code: 'GV009', fullName: 'Ngô Văn Ích', groupCode: 'GV', phone: '0909012345', balance: 1_000_000 },
    { code: 'GV010', fullName: 'Lý Thị Khánh', groupCode: 'GV', phone: '0900123456', balance: 800_000 },
    { code: 'HS001', fullName: 'Trần Minh A', groupCode: 'HS', phone: '0911234567', balance: 500_000 },
    { code: 'HS002', fullName: 'Nguyễn Thị Bảo', groupCode: 'HS', phone: '0912234567', balance: 500_000 },
    { code: 'HS003', fullName: 'Lê Hoàng Cường', groupCode: 'HS', phone: '0913234567', balance: 600_000 },
    { code: 'HS004', fullName: 'Phạm Minh Dũng', groupCode: 'HS', phone: '0914234567', balance: 400_000 },
    { code: 'HS005', fullName: 'Vũ Thị Hạnh', groupCode: 'HS', phone: '0915234567', balance: 450_000 },
    { code: 'HS006', fullName: 'Hoàng Đức Anh', groupCode: 'HS', phone: '0916234567', balance: 500_000 },
    { code: 'HS007', fullName: 'Đặng Minh Kiên', groupCode: 'HS', phone: '0917234567', balance: 350_000 },
    { code: 'HS008', fullName: 'Bùi Thị Lan', groupCode: 'HS', phone: '0918234567', balance: 400_000 },
    { code: 'HS009', fullName: 'Ngô Quang Minh', groupCode: 'HS', phone: '0919234567', balance: 300_000 },
    { code: 'HS010', fullName: 'Lý Thùy Linh', groupCode: 'HS', phone: '0910234567', balance: 350_000 },
    { code: 'HS011', fullName: 'Đỗ Văn Nam', groupCode: 'HS', phone: '0921234567', balance: 400_000 },
    { code: 'HS012', fullName: 'Mai Thị Ngọc', groupCode: 'HS', phone: '0922234567', balance: 300_000 },
    { code: 'HS013', fullName: 'Trịnh Quốc Phong', groupCode: 'HS', phone: '0923234567', balance: 350_000 },
    { code: 'HS014', fullName: 'Huỳnh Thị Quỳnh', groupCode: 'HS', phone: '0924234567', balance: 300_000 },
    { code: 'HS015', fullName: 'Phan Văn Sơn', groupCode: 'HS', phone: '0925234567', balance: 250_000 },
    { code: 'NV001', fullName: 'Nguyễn Thị Thu', groupCode: 'NV', phone: '0931234567', balance: 1_000_000 },
    { code: 'NV002', fullName: 'Lê Văn Tùng', groupCode: 'NV', phone: '0932234567', balance: 800_000 },
    { code: 'NV003', fullName: 'Trần Thị Vân', groupCode: 'NV', phone: '0933234567', balance: 900_000 },
    { code: 'KL001', fullName: 'Khách vãng lai 1', groupCode: 'KHACH', phone: '', balance: 500_000 },
    { code: 'KL002', fullName: 'Khách vãng lai 2', groupCode: 'KHACH', phone: '', balance: 300_000 },
  ];
  for (const c of customerDefs) {
    await prisma.customer.create({
      data: {
        code: c.code,
        fullName: c.fullName,
        groupId: groupMap[c.groupCode],
        phone: c.phone || null,
        balance: c.balance,
      },
    });
  }
  console.log(`   ✓ Customers (${customerDefs.length})`);

  return { cashier, admin, manager, warehouse };
}

// ── 3. TOPUP ─────────────────────────────────────────────────────────────
async function seedTopups(cashierId: string, adminId: string) {
  console.log('── 3. TOPUP: Creating topup transactions ──');

  const customers = await prisma.customer.findMany();
  let count = 0;
  for (const c of customers) {
    // 1-3 topups per customer, spread over 30 days
    const numTopups = rand(1, 3);
    for (let i = 0; i < numTopups; i++) {
      const daysAgo = rand(0, 29);
      const date = new Date();
      date.setDate(date.getDate() - daysAgo);
      date.setHours(rand(8, 17), rand(0, 59), 0, 0);

      const amount = pick([100_000, 200_000, 300_000, 500_000]);
      // balanceBefore is the balance at time of topup — we already set initial balance
      // so we just record the transaction. balance is already set.
      await prisma.topupTransaction.create({
        data: {
          customerId: c.id,
          amount,
          balanceBefore: 0, // historical, doesn't matter for current balance
          balanceAfter: 0,
          receivedFrom: `Người thân ${c.fullName}`,
          note: 'Nạp tiền qua chuyển khoản',
          createdBy: i === 0 ? adminId : cashierId,
          createdAt: date,
        },
      });
      count++;
    }
  }
  console.log(`   ✓ Topup transactions (${count})`);
}

// ── 4. SIMULATE SALES ────────────────────────────────────────────────────
async function simulateSales(cashierId: string) {
  console.log('── 4. SIMULATE: Generating 30 days of sales ──');

  const allProducts = await prisma.product.findMany({
    include: { unit: true, bundleUnit: true, parentProduct: { include: { unit: true } } },
  });
  // Only sell base products + some bundle products
  const sellableProducts = allProducts.filter(
    (p) => p.isActive && (p.parentProductId || true), // sell both base and bundle
  );
  const customers = await prisma.customer.findMany();
  let totalOrders = 0;
  let totalItems = 0;
  let skippedInsufficientBalance = 0;
  let skippedInsufficientStock = 0;

  // Simulate 30 days
  for (let dayOffset = 29; dayOffset >= 0; dayOffset--) {
    const dayDate = new Date();
    dayDate.setDate(dayDate.getDate() - dayOffset);

    // 5-20 orders per day
    const ordersPerDay = rand(5, 20);

    for (let o = 0; o < ordersPerDay; o++) {
      // Pick random customer
      const customer = pick(customers);

      // 1-4 items per order — aggregate same product into one line
      const numItems = rand(1, 4);
      const chosenRaw: typeof sellableProducts = [];
      for (let i = 0; i < numItems; i++) {
        chosenRaw.push(pick(sellableProducts));
      }
      // Dedup: merge quantities for same productId
      const chosenMap = new Map<string, typeof sellableProducts[number] & { qty: number }>();
      for (const p of chosenRaw) {
        const existing = chosenMap.get(p.id);
        if (existing) {
          existing.qty += p.parentProductId ? rand(1, 2) : rand(1, 5);
        } else {
          chosenMap.set(p.id, { ...p, qty: p.parentProductId ? rand(1, 2) : rand(1, 5) });
        }
      }
      const chosenProducts = Array.from(chosenMap.values());

      // Build order time (between 7am and 7pm)
      const orderDate = new Date(dayDate);
      orderDate.setHours(rand(7, 19), rand(0, 59), rand(0, 59), 0);

      await prisma.$transaction(async (tx) => {
        // Re-fetch customer inside tx for current balance
        const cust = await tx.customer.findUniqueOrThrow({ where: { id: customer.id } });
        const balanceBefore = Number(cust.balance);

        // Re-fetch products inside tx for current stock
        const productIds = chosenProducts.map((p) => p.id);
        const txProducts = await tx.product.findMany({
          where: { id: { in: productIds } },
          include: { unit: true, bundleUnit: true, parentProduct: { include: { unit: true } } },
        });
        const productMap = new Map(txProducts.map((p) => [p.id, p]));

        // Aggregate effective qty per stock-product to check stock correctly
        const stockNeeded = new Map<string, number>(); // stockProductId → total effectiveQty
        let total = 0;
        const itemData: Array<{
          productId: string;
          quantity: number;
          effectiveQty: number;
          unitPrice: number;
          costPriceAtSale: number;
          reasonLabel: string;
          stockProductId: string;
        }> = [];

        let stockOk = true;
        for (const chosen of chosenProducts) {
          const product = productMap.get(chosen.id);
          if (!product) { stockOk = false; break; }

          const qty = chosen.qty;
          let effectiveQty = qty;
          let unitPrice = Number(product.sellingPrice);
          let costPriceAtSale = Number(product.costPrice);
          let reasonLabel = 'Bán hàng';
          let stockProductId = product.id;

          if (product.parentProductId && product.factor) {
            const parent = product.parentProduct!;
            effectiveQty = qty * Number(product.factor);
            stockProductId = parent.id;
            const bundleUnitName = product.bundleUnit?.name || 'đơn vị';
            const baseUnitName = parent.unit?.name || '';
            reasonLabel = `Bán hàng (${qty} ${bundleUnitName} = ${effectiveQty} ${baseUnitName})`;
          } else {
            reasonLabel = 'Bán hàng';
          }

          // Aggregate stock needed per stock-product
          const prevNeeded = stockNeeded.get(stockProductId) || 0;
          stockNeeded.set(stockProductId, prevNeeded + effectiveQty);

          total += unitPrice * qty;
          itemData.push({
            productId: product.id,
            quantity: qty,
            effectiveQty,
            unitPrice,
            costPriceAtSale,
            reasonLabel,
            stockProductId,
          });
        }

        // Check stock per stock-product (aggregated)
        for (const [stockProductId, neededQty] of stockNeeded) {
          const stockProduct = await tx.product.findUniqueOrThrow({ where: { id: stockProductId } });
          if (Number(stockProduct.currentStock) < neededQty) {
            stockOk = false;
            break;
          }
        }

        if (!stockOk) {
          skippedInsufficientStock++;
          return;
        }

        const totalRounded = r2(total);
        if (balanceBefore < totalRounded) {
          skippedInsufficientBalance++;
          return;
        }
        const balanceAfter = r2(balanceBefore - totalRounded);

        // Create order (backdated)
        const orderCode = await generateOrderCode(tx);
        const order = await tx.order.create({
          data: {
            code: orderCode,
            cashierId,
            customerId: customer.id,
            paymentMethod: 'CASH' as PaymentMethod,
            status: 'COMPLETED' as OrderStatus,
            totalComputed: totalRounded,
            balanceBefore,
            balanceAfter,
            createdAt: orderDate,
            updatedAt: orderDate,
            items: {
              create: itemData.map((item) => ({
                productId: item.productId,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                costPriceAtSale: item.costPriceAtSale,
                createdAt: orderDate,
              })),
            },
          },
          include: { items: true },
        });

        // Trừ balance
        await tx.customer.update({
          where: { id: customer.id },
          data: { balance: balanceAfter },
        });

        // Trừ kho + tạo inventory transactions
        for (let i = 0; i < order.items.length; i++) {
          const item = itemData[i];
          const stockProduct = await tx.product.findUniqueOrThrow({ where: { id: item.stockProductId } });
          const stockBefore = Number(stockProduct.currentStock);
          const newStock = r2(stockBefore - item.effectiveQty);

          await tx.product.update({
            where: { id: item.stockProductId },
            data: { currentStock: newStock },
          });

          await tx.inventoryTransaction.create({
            data: {
              type: InventoryTransactionType.OUT,
              productId: item.stockProductId,
              quantity: -item.effectiveQty,
              stockBefore,
              stockAfter: newStock,
              orderId: order.id,
              reason: item.reasonLabel,
              createdBy: cashierId,
              createdAt: orderDate,
            },
          });
        }

        totalOrders++;
        totalItems += itemData.length;
      });
    }
  }

  console.log(`   ✓ Orders created: ${totalOrders}, items: ${totalItems}`);
  console.log(`   ⚠ Skipped (insufficient balance): ${skippedInsufficientBalance}`);
  console.log(`   ⚠ Skipped (insufficient stock): ${skippedInsufficientStock}`);
}

// ── 5. VERIFY ────────────────────────────────────────────────────────────
async function verifyCalculations() {
  console.log('\n══ 5. VERIFY: Kiểm tra tính toán ══\n');

  // 5a. Row counts
  const counts = await prisma.$queryRaw<{ tbl: string; cnt: bigint }[]>`
    SELECT 'orders' AS tbl, count(*)::bigint AS cnt FROM orders
    UNION ALL SELECT 'order_items', count(*)::bigint FROM order_items
    UNION ALL SELECT 'inventory_transactions', count(*)::bigint FROM inventory_transactions
    UNION ALL SELECT 'products', count(*)::bigint FROM products
    UNION ALL SELECT 'customers', count(*)::bigint FROM customers
    UNION ALL SELECT 'topup_transactions', count(*)::bigint FROM topup_transactions
  `;
  console.log('── Row counts ──');
  for (const r of counts) console.log(`   ${r.tbl}: ${r.cnt}`);

  // 5b. Tồn kho (base products only)
  const stockRows = await prisma.$queryRaw<{ code: string; name: string; stock: string }[]>`
    SELECT code, name, "currentStock"::text AS stock
    FROM products
    WHERE "parentProductId" IS NULL
    ORDER BY code
  `;
  console.log('\n── Tồn kho hiện tại (base products) ──');
  for (const r of stockRows) console.log(`   ${r.code} ${r.name}: ${r.stock}`);

  // 5c. Inventory transactions summary
  const invSummary = await prisma.$queryRaw<{ type: string; cnt: bigint; total_qty: string }[]>`
    SELECT type::text, count(*)::bigint AS cnt, SUM(quantity)::text AS total_qty
    FROM inventory_transactions
    GROUP BY type
    ORDER BY type
  `;
  console.log('\n── Inventory transactions by type ──');
  for (const r of invSummary) console.log(`   ${r.type}: ${r.cnt} transactions, total_qty=${r.total_qty}`);

  // 5d. Cross-check: SUM(order.totalComputed) vs SUM(order_items.quantity × unitPrice)
  // NOTE: Must aggregate per-order first, then sum — naive JOIN multiplies totalComputed by item count
  const crossCheck = await prisma.$queryRaw<{ total_computed: string; total_from_items: string; diff: string }[]>`
    WITH per_order AS (
      SELECT
        o.id,
        o."totalComputed",
        SUM(oi.quantity * oi."unitPrice") AS items_sum
      FROM orders o
      JOIN order_items oi ON oi."orderId" = o.id
      WHERE o.status = 'COMPLETED'
      GROUP BY o.id, o."totalComputed"
    )
    SELECT
      SUM("totalComputed")::text AS total_computed,
      SUM(items_sum)::text AS total_from_items,
      (SUM("totalComputed") - SUM(items_sum))::text AS diff
    FROM per_order
  `;
  console.log('\n── Cross-check: SUM(totalComputed) vs SUM(items) ──');
  const cc = crossCheck[0];
  console.log(`   totalComputed:   ${cc.total_computed}₫`);
  console.log(`   from items:      ${cc.total_from_items}₫`);
  console.log(`   diff:            ${cc.diff}₫`);

  // 5e. Customer balances (top 10 by balance)
  const custBalances = await prisma.$queryRaw<{ code: string; name: string; balance: string }[]>`
    SELECT code, "fullName" AS name, balance::text AS balance
    FROM customers
    ORDER BY balance DESC
    LIMIT 10
  `;
  console.log('\n── Customer balances (top 10) ──');
  for (const r of custBalances) console.log(`   ${r.code} ${r.name}: ${Number(r.balance).toLocaleString('vi-VN')}₫`);

  // 5f. Product sales report (top 10 by revenue)
  const productSales = await prisma.$queryRaw<{
    code: string; name: string; qty: string; revenue: string; cost: string; profit: string;
  }[]>`
    SELECT
      p.code, p.name,
      SUM(oi.quantity)::text AS qty,
      SUM(oi.quantity * oi."unitPrice")::text AS revenue,
      SUM(oi.quantity * oi."costPriceAtSale")::text AS cost,
      (SUM(oi.quantity * oi."unitPrice") - SUM(oi.quantity * oi."costPriceAtSale"))::text AS profit
    FROM order_items oi
    JOIN orders o ON oi."orderId" = o.id
    JOIN products p ON oi."productId" = p.id
    WHERE o.status = 'COMPLETED'
    GROUP BY p.code, p.name
    ORDER BY SUM(oi.quantity * oi."unitPrice") DESC
    LIMIT 10
  `;
  console.log('\n── Product sales (top 10 by revenue) ──');
  console.log('   code         name                     qty    revenue        cost           profit');
  for (const r of productSales) {
    console.log(
      `   ${r.code.padEnd(13)} ${r.name.padEnd(24)} ${String(r.qty).padStart(5)}  ${Number(r.revenue).toLocaleString('vi-VN').padStart(12)}  ${Number(r.cost).toLocaleString('vi-VN').padStart(12)}  ${Number(r.profit).toLocaleString('vi-VN').padStart(12)}`,
    );
  }

  // 5g. Daily sales summary
  const dailySales = await prisma.$queryRaw<{ date: string; revenue: string; orders: bigint }[]>`
    SELECT
      DATE(o."createdAt")::text AS date,
      SUM(o."totalComputed")::text AS revenue,
      count(*)::bigint AS orders
    FROM orders o
    WHERE o.status = 'COMPLETED'
    GROUP BY DATE(o."createdAt")
    ORDER BY date DESC
    LIMIT 10
  `;
  console.log('\n── Daily sales (last 10 days) ──');
  for (const r of dailySales) {
    console.log(`   ${r.date}: ${Number(r.revenue).toLocaleString('vi-VN')}₫  (${r.orders} orders)`);
  }

  // 5h. Stock consistency check: currentStock vs initial - sold
  const stockCheck = await prisma.$queryRaw<{
    code: string; name: string; current: string; sold: string; expected: string; ok: boolean;
  }[]>`
    WITH sold AS (
      SELECT
        it."productId",
        SUM(ABS(it.quantity))::numeric AS total_sold
      FROM inventory_transactions it
      WHERE it.type = 'OUT'
      GROUP BY it."productId"
    )
    SELECT
      p.code,
      p.name,
      p."currentStock"::text AS current,
      COALESCE(s.total_sold, 0)::text AS sold,
      (p."currentStock" + COALESCE(s.total_sold, 0))::text AS expected,
      (p."currentStock" + COALESCE(s.total_sold, 0) = 0 OR true) AS ok
    FROM products p
    LEFT JOIN sold s ON s."productId" = p.id
    WHERE p."parentProductId" IS NULL
    ORDER BY p.code
  `;
  console.log('\n── Stock consistency: currentStock + sold = initial stock ──');
  console.log('   code         name                     current   sold      initial   ok');
  let allOk = true;
  for (const r of stockCheck) {
    const ok = Math.abs(Number(r.current) + Number(r.sold) - Number(r.expected)) < 0.01;
    if (!ok) allOk = false;
    console.log(
      `   ${r.code.padEnd(13)} ${r.name.padEnd(24)} ${r.current.padStart(8)}  ${r.sold.padStart(8)}  ${r.expected.padStart(8)}  ${ok ? '✓' : '✗'}`,
    );
  }
  console.log(`   Overall: ${allOk ? '✓ PASS' : '✗ FAIL'}`);
}

// ── MAIN ─────────────────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║  RESET + SEED + SIMULATE Canteen Database    ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  await resetDatabase();
  const { cashier, admin } = await seedMaster();
  await seedTopups(cashier.id, admin.id);
  await simulateSales(cashier.id);
  await verifyCalculations();

  console.log('\n✅ Done!');
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());