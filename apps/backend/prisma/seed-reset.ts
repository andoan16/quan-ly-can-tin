/**
 * Seed reset script — xoá toàn bộ dữ liệu bán hàng + sản phẩm, seed lại master data,
 * giả lập bán hàng qua orderService.create (đúng logic Cách B: trừ kho, inventory transactions),
 * và ghi báo cáo kỳ vọng để verify output tính toán.
 *
 * Chạy: npx tsx prisma/seed-reset.ts
 */
import * as bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { orderService } from '../src/services/order.service';

const prisma = new PrismaClient();

// Deterministic random để kết quả có thể tái tạo
const seededRandom = (seed: number) => {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
};

async function wipeAll() {
  console.log('🧹 Wiping all transactional + product data...');
  // Thứ tự FK: xoá con trước, cha sau
  await prisma.topupTransaction.deleteMany();
  await prisma.productPerformanceReportItem.deleteMany();
  await prisma.productPerformanceReport.deleteMany();
  await prisma.stockCountItem.deleteMany();
  await prisma.stockCount.deleteMany();
  await prisma.inventoryTransaction.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.product.deleteMany();
  await prisma.auditLog?.deleteMany?.().catch(() => {});
  console.log('  ✓ Wiped products, orders, order_items, inventory_transactions, stock_counts, reports, topups');
}

async function seedUsers() {
  const mk = async (u: string, name: string, role: any) =>
    prisma.user.upsert({
      where: { username: u },
      update: { fullName: name, role },
      create: { username: u, passwordHash: await bcrypt.hash(u, 10), fullName: name, role },
    });
  await mk('admin', 'Quản trị viên', 'ADMIN');
  const cashier = await mk('cashier', 'Nguyễn Thị Bán', 'CASHIER');
  await mk('manager', 'Trần Quản Lý', 'MANAGER');
  await mk('warehouse', 'Lê Kho Thủ', 'WAREHOUSE');
  return cashier;
}

async function seedMaster() {
  console.log('📦 Seeding master data...');

  // Units
  const units = [
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
  for (const u of units) await prisma.unit.upsert({ where: { code: u.code }, update: { name: u.name }, create: u });
  const allUnits = await prisma.unit.findMany();
  const unitMap = Object.fromEntries(allUnits.map(u => [u.code, u.id]));

  // Categories
  const categories = [
    { code: 'NUOC', name: 'Nước uống', prefix: 'NUOC', note: 'Các loại nước uống' },
    { code: 'MON_CHIN', name: 'Món chính', prefix: 'MC', note: 'Cơm, bún, phở...' },
    { code: 'MON_NHO', name: 'Món nhúng/Nhỏ', prefix: 'MN', note: 'Gỏi, nem, chả...' },
    { code: 'TRANG_MIENG', name: 'Tráng miệng', prefix: 'TM', note: 'Chè, trái cây...' },
    { code: 'BANH_MI', name: 'Bánh mì', prefix: 'BM', note: 'Bánh mì các loại' },
  ];
  for (const c of categories) await prisma.category.upsert({ where: { code: c.code }, update: { name: c.name, prefix: c.prefix }, create: c });
  const allCats = await prisma.category.findMany();
  const catMap = Object.fromEntries(allCats.map(c => [c.code, c.id]));

  // Customer groups + customers
  const groups = [
    { code: 'GV', name: 'Giáo viên', note: 'Giáo viên trường' },
    { code: 'HS', name: 'Học sinh', note: 'Học sinh trường' },
    { code: 'NV', name: 'Nhân viên', note: 'Nhân viên căn tin' },
    { code: 'KHACH', name: 'Khách vãng lai', note: 'Khách ngoài' },
  ];
  for (const g of groups) await prisma.customerGroup.upsert({ where: { code: g.code }, update: { name: g.name }, create: g });
  const allGroups = await prisma.customerGroup.findMany();
  const groupMap = Object.fromEntries(allGroups.map(g => [g.code, g.id]));

  const customers: any[] = [];
  const gvNames = ['Nguyễn Văn An', 'Trần Thị Bình', 'Lê Văn Cường', 'Phạm Thị Dung', 'Hoàng Văn Em', 'Vũ Thị Phương', 'Đặng Văn Giang', 'Bùi Thị Hoa'];
  gvNames.forEach((n, i) => customers.push({ code: `GV${String(i + 1).padStart(3, '0')}`, fullName: n, groupId: groupMap['GV'], phone: `090${1000000 + i}`, balance: 1000000 + i * 200000 }));
  const hsNames = ['Trần Minh A', 'Nguyễn Thị Bảo', 'Lê Hoàng Cường', 'Phạm Minh Dũng', 'Vũ Thị Hạnh', 'Hoàng Đức Anh', 'Đặng Minh Kiên', 'Bùi Thị Lan', 'Ngô Quang Minh', 'Lý Thùy Linh', 'Đỗ Văn Nam', 'Mai Thị Ngọc'];
  hsNames.forEach((n, i) => customers.push({ code: `HS${String(i + 1).padStart(3, '0')}`, fullName: n, groupId: groupMap['HS'], phone: `091${2000000 + i}`, balance: 500000 + i * 100000 }));
  customers.push({ code: 'NV001', fullName: 'Nguyễn Thị Thu', groupId: groupMap['NV'], phone: '0931234567', balance: 500000 });
  customers.push({ code: 'NV002', fullName: 'Lê Văn Tùng', groupId: groupMap['NV'], phone: '0932234567', balance: 450000 });
  // Không còn khách vãng lai (KL001/KL002) — tất cả phải có tài khoản
  for (const c of customers) await prisma.customer.upsert({ where: { code: c.code }, update: { fullName: c.fullName, groupId: c.groupId, balance: c.balance }, create: c });

  // ===== Products (clean, single coding scheme) =====
  // Mã: Category.prefix + 6-digit sequence
  const products = [
    // Nước uống — base (bán lẻ theo LY/CHAI)
    { code: 'NUOC000001', name: 'Nước suối', categoryId: catMap['NUOC'], unitId: unitMap['CHAI'], sellingPrice: 5000, costPrice: 3000, currentStock: 200 },
    { code: 'NUOC000002', name: 'Nước cam', categoryId: catMap['NUOC'], unitId: unitMap['LY'], sellingPrice: 10000, costPrice: 6000, currentStock: 120 },
    { code: 'NUOC000003', name: 'Trà đá', categoryId: catMap['NUOC'], unitId: unitMap['LY'], sellingPrice: 3000, costPrice: 1000, currentStock: 300 },
    { code: 'NUOC000004', name: 'Trà sữa', categoryId: catMap['NUOC'], unitId: unitMap['LY2'], sellingPrice: 20000, costPrice: 12000, currentStock: 60 },
    { code: 'NUOC000005', name: 'Sinh tố bơ', categoryId: catMap['NUOC'], unitId: unitMap['LY2'], sellingPrice: 18000, costPrice: 10000, currentStock: 40 },
    { code: 'NUOC000006', name: 'Cà phê sữa', categoryId: catMap['NUOC'], unitId: unitMap['LY'], sellingPrice: 12000, costPrice: 7000, currentStock: 80 },
    { code: 'NUOC000007', name: 'Sữa tươi', categoryId: catMap['NUOC'], unitId: unitMap['CHAI'], sellingPrice: 8000, costPrice: 5000, currentStock: 100 },
    { code: 'NUOC000008', name: 'Nước dừa', categoryId: catMap['NUOC'], unitId: unitMap['LY'], sellingPrice: 15000, costPrice: 8000, currentStock: 30 },
    // Món chính
    { code: 'MC000001', name: 'Cơm sườn', categoryId: catMap['MON_CHIN'], unitId: unitMap['PHAN'], sellingPrice: 35000, costPrice: 22000, currentStock: 60 },
    { code: 'MC000002', name: 'Cơm gà', categoryId: catMap['MON_CHIN'], unitId: unitMap['PHAN'], sellingPrice: 30000, costPrice: 18000, currentStock: 50 },
    { code: 'MC000003', name: 'Bún bò Huế', categoryId: catMap['MON_CHIN'], unitId: unitMap['TO'], sellingPrice: 30000, costPrice: 18000, currentStock: 40 },
    { code: 'MC000004', name: 'Phở bò', categoryId: catMap['MON_CHIN'], unitId: unitMap['TO'], sellingPrice: 28000, costPrice: 16000, currentStock: 40 },
    { code: 'MC000005', name: 'Cơm chiên dương châu', categoryId: catMap['MON_CHIN'], unitId: unitMap['PHAN'], sellingPrice: 32000, costPrice: 20000, currentStock: 30 },
    { code: 'MC000006', name: 'Mì xào bò', categoryId: catMap['MON_CHIN'], unitId: unitMap['PHAN'], sellingPrice: 28000, costPrice: 16000, currentStock: 25 },
    { code: 'MC000007', name: 'Cơm sườn bì chả', categoryId: catMap['MON_CHIN'], unitId: unitMap['PHAN'], sellingPrice: 38000, costPrice: 24000, currentStock: 15 },
    // Món nhỏ
    { code: 'MN000001', name: 'Gỏi cuốn', categoryId: catMap['MON_NHO'], unitId: unitMap['GOI'], sellingPrice: 10000, costPrice: 5000, currentStock: 80 },
    { code: 'MN000002', name: 'Nem rán', categoryId: catMap['MON_NHO'], unitId: unitMap['GOI'], sellingPrice: 8000, costPrice: 4000, currentStock: 60 },
    { code: 'MN000003', name: 'Chả giò', categoryId: catMap['MON_NHO'], unitId: unitMap['GOI'], sellingPrice: 12000, costPrice: 7000, currentStock: 40 },
    { code: 'MN000004', name: 'Gà chiên mắm', categoryId: catMap['MON_NHO'], unitId: unitMap['PHAN'], sellingPrice: 20000, costPrice: 12000, currentStock: 20 },
    { code: 'MN000005', name: 'Tôm chiên xù', categoryId: catMap['MON_NHO'], unitId: unitMap['PHAN'], sellingPrice: 22000, costPrice: 14000, currentStock: 12 },
    // Tráng miệng
    { code: 'TM000001', name: 'Chè khúc bạch', categoryId: catMap['TRANG_MIENG'], unitId: unitMap['LY'], sellingPrice: 15000, costPrice: 8000, currentStock: 50 },
    { code: 'TM000002', name: 'Chè bưởi', categoryId: catMap['TRANG_MIENG'], unitId: unitMap['LY'], sellingPrice: 12000, costPrice: 6000, currentStock: 40 },
    { code: 'TM000003', name: 'Trái cây thái', categoryId: catMap['TRANG_MIENG'], unitId: unitMap['DIA'], sellingPrice: 10000, costPrice: 5000, currentStock: 25 },
    { code: 'TM000004', name: 'Sữa chua', categoryId: catMap['TRANG_MIENG'], unitId: unitMap['LY'], sellingPrice: 8000, costPrice: 4000, currentStock: 70 },
    // Bánh mì
    { code: 'BM000001', name: 'Bánh mì thịt', categoryId: catMap['BANH_MI'], unitId: unitMap['GOI'], sellingPrice: 15000, costPrice: 8000, currentStock: 80 },
    { code: 'BM000002', name: 'Bánh mì trứng', categoryId: catMap['BANH_MI'], unitId: unitMap['GOI'], sellingPrice: 12000, costPrice: 6000, currentStock: 60 },
    { code: 'BM000003', name: 'Bánh mì phô mai', categoryId: catMap['BANH_MI'], unitId: unitMap['GOI'], sellingPrice: 18000, costPrice: 10000, currentStock: 40 },
    { code: 'BM000004', name: 'Bánh mì gà', categoryId: catMap['BANH_MI'], unitId: unitMap['GOI'], sellingPrice: 16000, costPrice: 9000, currentStock: 10 },
  ];

  for (const p of products) {
    await prisma.product.upsert({
      where: { code: p.code },
      update: {
        name: p.name,
        categoryId: p.categoryId,
        unitId: p.unitId,
        sellingPrice: p.sellingPrice,
        costPrice: p.costPrice,
        currentStock: p.currentStock,
        parentProductId: null,
        factor: null,
        bundleUnitId: null,
        isActive: true,
      },
      create: p,
    });
  }

  // ===== Bundle products (đóng gói: Thùng/Lốc) =====
  // Bundle code = baseCode + suffix. Stock = 0 (nằm ở parent). factor = số ĐVT cơ bản / 1 bundle ĐVT.
  const bundleDefs = [
    { baseCode: 'NUOC000001', suffix: '-TH', name: 'Nước suối Thùng 24 chai', bundleUnitCode: 'THUNG', factor: 24, sellingPrice: 96000, costPrice: 60000 },
    { baseCode: 'NUOC000007', suffix: '-TH', name: 'Sữa tươi Thùng 24 chai', bundleUnitCode: 'THUNG', factor: 24, sellingPrice: 168000, costPrice: 96000 },
    { baseCode: 'BM000001', suffix: '-L', name: 'Bánh mì thịt Lốc 6 cái', bundleUnitCode: 'LOC', factor: 6, sellingPrice: 90000, costPrice: 48000 },
    { baseCode: 'MN000002', suffix: '-L', name: 'Nem rán Lốc 10 cái', bundleUnitCode: 'LOC', factor: 10, sellingPrice: 80000, costPrice: 40000 },
  ];

  for (const b of bundleDefs) {
    const base = await prisma.product.findUniqueOrThrow({ where: { code: b.baseCode } });
    const code = `${b.baseCode}${b.suffix}`;
    await prisma.product.upsert({
      where: { code },
      update: {
        name: b.name,
        categoryId: base.categoryId,
        unitId: base.unitId,
        sellingPrice: b.sellingPrice,
        costPrice: b.costPrice,
        currentStock: 0,
        parentProductId: base.id,
        factor: b.factor,
        bundleUnitId: unitMap[b.bundleUnitCode],
        isActive: true,
      },
      create: {
        code,
        name: b.name,
        categoryId: base.categoryId!,
        unitId: base.unitId!,
        sellingPrice: b.sellingPrice,
        costPrice: b.costPrice,
        currentStock: 0,
        parentProductId: base.id,
        factor: b.factor,
        bundleUnitId: unitMap[b.bundleUnitCode],
        isActive: true,
      },
    });
  }

  console.log(`  ✓ ${products.length} base products + ${bundleDefs.length} bundle products`);
  return { allProducts: await prisma.product.findMany({ include: { category: true } }) };
}

async function simulateSales(cashierId: string, adminId: string, customers: any[]) {
  console.log('🛒 Simulating sales via orderService.create...');

  const allProducts = await prisma.product.findMany({ include: { category: true, parentProduct: true, bundleUnit: true } });
  const productMap = new Map(allProducts.map(p => [p.code, p]));

  // Chỉ bán sản phẩm base (POS bán lẻ theo ĐVT cơ bản). Bundle sẽ được test riêng.
  const sellableBaseCodes = allProducts.filter(p => !p.parentProductId).map(p => p.code);

  // Trọng số bán chạy
  const productWeights: Record<string, number> = {
    NUOC000003: 10, // Trà đá
    NUOC000001: 8,  // Nước suối
    BM000001: 7,    // Bánh mì thịt
    BM000002: 6,    // Bánh mì trứng
    MC000001: 6,    // Cơm sườn
    MC000002: 5,    // Cơm gà
    NUOC000002: 5,  // Nước cam
    NUOC000006: 5,  // Cà phê sữa
    MN000001: 4,    // Gỏi cuốn
    MN000002: 4,    // Nem rán
    MC000003: 4,    // Bún bò
    MC000004: 4,    // Phở bò
    TM000004: 4,    // Sữa chua
    NUOC000004: 3,  // Trà sữa
    NUOC000005: 3,  // Sinh tố bơ
    TM000001: 3,    // Chè khúc bạch
    TM000002: 3,    // Chè bưởi
    MC000005: 2,    // Cơm chiên
    BM000003: 2,    // Bánh mì phô mai
    MN000003: 2,    // Chả giò
    NUOC000007: 2,  // Sữa tươi
    NUOC000008: 2,  // Nước dừa
    MC000006: 2,    // Mì xào bò
    MC000007: 1,    // Cơm sườn bì chả
    MN000004: 1,    // Gà chiên mắm
    MN000005: 1,    // Tôm chiên xù
    TM000003: 1,    // Trái cây thái
    BM000004: 1,    // Bánh mì gà
  };
  const weightedProducts: string[] = [];
  for (const [code, w] of Object.entries(productWeights)) {
    if (productMap.has(code)) for (let i = 0; i < w; i++) weightedProducts.push(code);
  }

  const startDate = new Date('2026-06-01');
  const days = 30;
  let globalSeed = 42;
  let orderCount = 0;
  const expectedResults = new Map<string, { totalQty: number; totalRevenue: number; totalCost: number; orderIds: Set<string> }>();

  for (let day = 0; day < days; day++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + day);
    const isWeekend = date.getDay() === 0;
    const ordersPerDay = isWeekend
      ? Math.floor(seededRandom(globalSeed++) * 4) + 2
      : Math.floor(seededRandom(globalSeed++) * 8) + 8;

    for (let i = 0; i < ordersPerDay; i++) {
      const itemCount = Math.floor(seededRandom(globalSeed++) * 5) + 1;
      const items: { productId: string; quantity: number }[] = [];
      const seenProducts = new Set<string>();

      for (let j = 0; j < itemCount; j++) {
        const code = weightedProducts[Math.floor(seededRandom(globalSeed++) * weightedProducts.length)];
        const product = productMap.get(code)!;
        // Tránh trùng sản phẩm trong cùng đơn (gộp qty)
        const existing = items.find(it => it.productId === product.id);
        const maxQty = product.category?.code === 'NUOC' ? 4 : 2;
        const qty = Math.floor(seededRandom(globalSeed++) * maxQty) + 1;
        if (existing) {
          existing.quantity += qty;
        } else {
          items.push({ productId: product.id, quantity: qty });
        }
        seenProducts.add(code);
      }

      // Chọn khách
      const custRoll = seededRandom(globalSeed++);
      let customer: any;
      if (custRoll < 0.7) {
        const hs = customers.filter(c => c.code.startsWith('HS'));
        customer = hs[Math.floor(seededRandom(globalSeed++) * hs.length)];
      } else if (custRoll < 0.9) {
        const gv = customers.filter(c => c.code.startsWith('GV'));
        customer = gv[Math.floor(seededRandom(globalSeed++) * gv.length)];
      } else {
        const nv = customers.filter(c => c.code.startsWith('NV'));
        customer = nv[Math.floor(seededRandom(globalSeed++) * nv.length)];
      }

      // Thanh toán qua tài khoản — không còn paymentMethod
      const userId = seededRandom(globalSeed++) < 0.6 ? cashierId : adminId;

      // Tạo order qua orderService.create (đúng logic trừ kho, inventory transaction)
      // orderService.create KHÔNG nhận createdAt → tạo ở thời gian hiện tại.
      // Để mô phỏng ngày quá khứ, ta sẽ update createdAt sau khi tạo.
      try {
        const order = await orderService.create({
          cashierId: userId,
          customerId: customer.id,
          items,
        });
        // Set createdAt về ngày quá khứ
        const hour = Math.floor(seededRandom(globalSeed++) * 12) + 6;
        const minute = Math.floor(seededRandom(globalSeed++) * 60);
        const orderDate = new Date(date);
        orderDate.setHours(hour, minute, 0, 0);
        await prisma.order.update({ where: { id: order.id }, data: { createdAt: orderDate } });
        // Update inventory_transactions createdAt cũng về quá khứ
        await prisma.inventoryTransaction.updateMany({ where: { orderId: order.id }, data: { createdAt: orderDate } });

        // Track expected SAU khi tạo thành công — đọc từ order.items thực tế
        // (order.items đã được populate bởi orderService.create include)
        for (const oi of order.items) {
          const product = allProducts.find(p => p.id === oi.productId)!;
          const qty = Number(oi.quantity);
          const unitPrice = Number(oi.unitPrice);
          const costPrice = Number(oi.costPriceAtSale);
          const lineRevenue = qty * unitPrice;
          const lineCost = qty * costPrice;
          const agg = expectedResults.get(product.code);
          if (agg) {
            agg.totalQty += qty;
            agg.totalRevenue += lineRevenue;
            agg.totalCost += lineCost;
            agg.orderIds.add(order.id);
          } else {
            expectedResults.set(product.code, { totalQty: qty, totalRevenue: lineRevenue, totalCost: lineCost, orderIds: new Set([order.id]) });
          }
        }
        orderCount++;
      } catch (err: any) {
        // Nếu hết kho (Insufficient stock) → skip order này
        console.warn(`  ⚠ Order #${orderCount + 1} skipped: ${err.message}`);
      }
    }
  }

  console.log(`  ✓ Created ${orderCount} orders via orderService.create`);
  return { expectedResults, orderCount };
}

async function main() {
  await wipeAll();
  const cashier = await seedUsers();
  const admin = await prisma.user.findFirstOrThrow({ where: { role: 'ADMIN' } });
  await seedMaster();
  const customers = await prisma.customer.findMany();

  // === Tạo lịch sử nạp tiền TRƯỚC khi bán hàng (để người mua có đủ tiền chi tiêu) ===
  console.log('💰 Creating topup transactions...');
  const topupSamples = [
    { code: 'HS001', amount: 1000000, receivedFrom: 'Nguyễn Văn B (bố)', note: 'Chuyển ngân hàng', daysAgo: 25 },
    { code: 'HS002', amount: 800000, receivedFrom: 'Trần Thị C (mẹ)', note: 'Tiền mặt', daysAgo: 20 },
    { code: 'HS003', amount: 1200000, receivedFrom: 'Lê Văn D (anh)', note: 'Chuyển khoản', daysAgo: 15 },
    { code: 'GV001', amount: 2000000, receivedFrom: 'Nguyễn Thị E (vợ)', note: 'Chuyển ngân hàng', daysAgo: 28 },
    { code: 'HS005', amount: 600000, receivedFrom: 'Vũ Văn F (bố)', note: 'Tiền mặt', daysAgo: 10 },
    { code: 'HS008', amount: 900000, receivedFrom: 'Bùi Thị G (mẹ)', note: 'Chuyển khoản', daysAgo: 5 },
    { code: 'GV003', amount: 1500000, receivedFrom: 'Phạm Thị H (vợ)', note: 'Chuyển ngân hàng', daysAgo: 12 },
    { code: 'HS010', amount: 500000, receivedFrom: 'Lý Văn I (bố)', note: 'Tiền mặt', daysAgo: 3 },
    { code: 'HS004', amount: 700000, receivedFrom: 'Phạm Thị J (mẹ)', note: 'Chuyển khoản', daysAgo: 18 },
    { code: 'GV002', amount: 1000000, receivedFrom: 'Trần Văn K (chồng)', note: 'Chuyển ngân hàng', daysAgo: 22 },
  ];
  let topupCount = 0;
  for (const ts of topupSamples) {
    const cust = await prisma.customer.findUniqueOrThrow({ where: { code: ts.code } });
    const topupDate = new Date();
    topupDate.setDate(topupDate.getDate() - ts.daysAgo);
    const balanceBefore = Number(cust.balance);
    const balanceAfter = balanceBefore + ts.amount;
    await prisma.customer.update({ where: { id: cust.id }, data: { balance: balanceAfter } });
    await prisma.topupTransaction.create({
      data: {
        customerId: cust.id,
        amount: ts.amount,
        balanceBefore,
        balanceAfter,
        receivedFrom: ts.receivedFrom,
        note: ts.note,
        createdBy: admin.id,
        createdAt: topupDate,
      },
    });
    topupCount++;
  }
  console.log(`  ✓ Created ${topupCount} topup transactions`);

  // Reload customers with updated balances
  const customersWithBalance = await prisma.customer.findMany();
  const { expectedResults, orderCount } = await simulateSales(cashier.id, admin.id, customersWithBalance);

  // === Thêm vài đơn bán BUNDLE để test logic bundle (Cách B) ===
  console.log('📦 Adding bundle sales (test Cách B logic)...');
  const bundleTestOrders: { code: string; bundleCode: string; qty: number; expectedRevenue: number; expectedCost: number }[] = [];
  const bundleSales = [
    { bundleCode: 'NUOC000001-TH', qty: 2 }, // 2 Thùng × 96,000 = 192,000; effectiveQty = 48 chai
    { bundleCode: 'BM000001-L', qty: 3 },    // 3 Lốc × 90,000 = 270,000; effectiveQty = 18 gói
    { bundleCode: 'MN000002-L', qty: 1 },    // 1 Lốc × 80,000 = 80,000; effectiveQty = 10 gói
  ];
  // Chọn customer có nhiều tiền nhất cho bundle test
  const richestCustomer = customersWithBalance.reduce((max, c) => (Number(c.balance) > Number(max.balance) ? c : max), customersWithBalance[0]);
  for (const bs of bundleSales) {
    const bundle = await prisma.product.findUniqueOrThrow({ where: { code: bs.bundleCode }, include: { parentProduct: true, bundleUnit: true } });
    try {
      const order = await orderService.create({
        cashierId: cashier.id,
        customerId: richestCustomer.id,
        items: [{ productId: bundle.id, quantity: bs.qty }],
      });
      const expectedRevenue = Number(bundle.sellingPrice) * bs.qty;
      const expectedCost = Number(bundle.costPrice) * bs.qty;
      const agg = expectedResults.get(bs.bundleCode);
      if (agg) {
        agg.totalQty += bs.qty;
        agg.totalRevenue += expectedRevenue;
        agg.totalCost += expectedCost;
        agg.orderIds.add(order.id);
      } else {
        expectedResults.set(bs.bundleCode, { totalQty: bs.qty, totalRevenue: expectedRevenue, totalCost: expectedCost, orderIds: new Set([order.id]) });
      }
      bundleTestOrders.push({ code: order.code, bundleCode: bs.bundleCode, qty: bs.qty, expectedRevenue, expectedCost });
      console.log(`  ✓ Bundle order ${order.code}: ${bs.qty} ${bs.bundleCode} → revenue=${expectedRevenue}, cost=${expectedCost}, effectiveQty=${bs.qty * Number(bundle.factor)}`);
    } catch (err: any) {
      console.warn(`  ⚠ Bundle order ${bs.bundleCode} skipped: ${err.message}`);
    }
  }

  // === Ghi báo cáo kỳ vọng ===
  const fs = await import('fs');
  const path = await import('path');

  const rows = Array.from(expectedResults.entries()).map(([code, agg]) => ({
    productCode: code,
    totalQty: agg.totalQty,
    totalRevenue: Math.round(agg.totalRevenue * 100) / 100,
    totalCost: Math.round(agg.totalCost * 100) / 100,
    totalProfit: Math.round((agg.totalRevenue - agg.totalCost) * 100) / 100,
    profitMargin: agg.totalRevenue > 0 ? Math.round((agg.totalRevenue - agg.totalCost) / agg.totalRevenue * 10000) / 100 : 0,
    orderCount: agg.orderIds.size,
  }));
  rows.sort((a, b) => b.totalRevenue - a.totalRevenue);

  const totalRevenue = rows.reduce((s, r) => s + r.totalRevenue, 0);
  const totalCost = rows.reduce((s, r) => s + r.totalCost, 0);
  const totalQty = rows.reduce((s, r) => s + r.totalQty, 0);
  const allOrderIds = new Set<string>();
  for (const agg of expectedResults.values()) for (const id of agg.orderIds) allOrderIds.add(id);

  const report = {
    summary: {
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalCost: Math.round(totalCost * 100) / 100,
      totalProfit: Math.round((totalRevenue - totalCost) * 100) / 100,
      totalQuantity: totalQty,
      totalOrders: allOrderIds.size,
      productCount: rows.length,
    },
    topProducts: rows.slice(0, 10),
    bundleTestOrders,
  };

  const reportPath = path.join(__dirname, '..', 'seed-expected-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n📊 Expected report → ${reportPath}`);
  console.log(`   Doanh thu:  ${report.summary.totalRevenue.toLocaleString('vi-VN')}₫`);
  console.log(`   Giá vốn:    ${report.summary.totalCost.toLocaleString('vi-VN')}₫`);
  console.log(`   Lợi nhuận:  ${report.summary.totalProfit.toLocaleString('vi-VN')}₫`);
  console.log(`   Số lượng:   ${report.summary.totalQuantity}`);
  console.log(`   Số đơn:     ${report.summary.totalOrders}`);
  console.log(`   Số SP:      ${report.summary.productCount}`);
  console.log('\n📈 Top 5 sản phẩm:');
  for (const p of report.topProducts.slice(0, 5)) {
    console.log(`   ${p.productCode}: qty=${p.totalQty}, revenue=${p.totalRevenue.toLocaleString('vi-VN')}₫, profit=${p.totalProfit.toLocaleString('vi-VN')}₫, margin=${p.profitMargin}%`);
  }
  console.log('\n✅ Seed reset completed.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());