import * as bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Dữ liệu bán hàng giả: mô phỏng 1 tháng hoạt động căng tin trường học
async function main() {
  console.log('🌱 Seeding sales data...');

  // Xóa order items và orders cũ (theo thứ tự FK)
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  console.log('  ✓ Cleared old orders');

  // Lấy cashier user
  const cashier = await prisma.user.findFirst({ where: { role: 'CASHIER' } });
  if (!cashier) throw new Error('No CASHIER user found. Run base seed first.');
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });

  // Lấy tất cả sản phẩm, khách hàng
  const products = await prisma.product.findMany({ include: { category: true } });
  const customers = await prisma.customer.findMany();
  if (products.length === 0) throw new Error('No products found. Run base seed first.');

  const productMap = new Map(products.map(p => [p.code, p]));

  // Thiết lập random seed có thể tái tạo
  const seededRandom = (seed: number) => {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  };

  let orderIndex = 0;

  // Tạo đơn hàng cho 30 ngày qua
  const startDate = new Date('2026-06-01');
  const endDate = new Date('2026-06-30');

  // Sản phẩm bán chạy hơn (trọng số)
  const productWeights: Record<string, number> = {
    'NC003': 10, // Trà đá - rẻ, bán nhiều
    'NC001': 8,  // Nước suối
    'BM001': 7,  // Bánh mì thịt
    'BM002': 6,  // Bánh mì trứng
    'MC001': 6,  // Cơm sườn
    'MC002': 5,  // Cơm gà
    'NC002': 5,  // Nước cam
    'NC006': 5,  // Cà phê sữa
    'MN001': 4,  // Gỏi cuốn
    'MN002': 4,  // Nem rán
    'MC003': 4,  // Bún bò
    'MC004': 4,  // Phở bò
    'TM004': 4,  // Sữa chua
    'NC004': 3,  // Trà sữa
    'NC005': 3,  // Sinh tố bơ
    'TM001': 3,  // Chè khúc bạch
    'TM002': 3,  // Chè bưởi
    'MC005': 2,  // Cơm chiên dương châu
    'BM003': 2,  // Bánh mì phô mai
    'MN003': 2,  // Chả giò
    'NC007': 2,  // Sữa tươi
    'NC008': 2,  // Nước dừa
    'MC006': 2,  // Mì xào bò
    'MC007': 1,  // Cơm sườn bì chả
    'MN004': 1,  // Gà chiên mắm
    'MN005': 1,  // Tôm chiên xù
    'TM003': 1,  // Trái cây thái
    'BM004': 1,  // Bánh mì gà
  };

  // Lấy danh sách mã sản phẩm theo trọng số
  const weightedProducts: string[] = [];
  for (const [code, weight] of Object.entries(productWeights)) {
    if (productMap.has(code)) {
      for (let i = 0; i < weight; i++) weightedProducts.push(code);
    }
  }

  const allOrders = [];
  let globalSeed = 42;

  for (let day = 0; day < 30; day++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + day);

    // Bỏ chủ nhật (ít khách)
    const dayOfWeek = date.getDay();
    const isWeekend = dayOfWeek === 0;

    // Số đơn mỗi ngày: 8-15 ngày thường, 2-5 chủ nhật
    const ordersPerDay = isWeekend
      ? Math.floor(seededRandom(globalSeed++) * 4) + 2
      : Math.floor(seededRandom(globalSeed++) * 8) + 8;

    for (let i = 0; i < ordersPerDay; i++) {
      // Số sản phẩm trong 1 đơn: 1-5
      const itemCount = Math.floor(seededRandom(globalSeed++) * 5) + 1;
      const items: { productCode: string; qty: number }[] = [];

      for (let j = 0; j < itemCount; j++) {
        const productCode = weightedProducts[Math.floor(seededRandom(globalSeed++) * weightedProducts.length)];
        const product = productMap.get(productCode)!;
        // Số lượng: 1-4 cho đồ uống, 1-2 cho món chính
        const maxQty = product.category?.code === 'NUOC' ? 4 : 2;
        const qty = Math.floor(seededRandom(globalSeed++) * maxQty) + 1;
        items.push({ productCode, qty });
      }

      // Chọn khách: 70% học sinh, 20% giáo viên, 10% khác
      const custRoll = seededRandom(globalSeed++);
      let customer: typeof customers[0];
      if (custRoll < 0.7) {
        const hs = customers.filter(c => c.code.startsWith('HS'));
        customer = hs[Math.floor(seededRandom(globalSeed++) * hs.length)];
      } else if (custRoll < 0.9) {
        const gv = customers.filter(c => c.code.startsWith('GV'));
        customer = gv[Math.floor(seededRandom(globalSeed++) * gv.length)];
      } else {
        customer = customers[Math.floor(seededRandom(globalSeed++) * customers.length)];
      }

      // Phương thức thanh toán: 60% tiền mặt, 40% chuyển khoản
      const paymentMethod = seededRandom(globalSeed++) < 0.6 ? 'CASH' : 'TRANSFER';

      // Thời gian trong ngày: 6:00-18:00
      const hour = Math.floor(seededRandom(globalSeed++) * 12) + 6;
      const minute = Math.floor(seededRandom(globalSeed++) * 60);
      const orderDate = new Date(date);
      orderDate.setHours(hour, minute, 0, 0);

      // Thu ngân: 60% cashier, 40% admin
      const userId = seededRandom(globalSeed++) < 0.6 ? cashier.id : admin!.id;

      allOrders.push({
        orderIndex,
        code: `HD-202606${String(day + 1).padStart(2, '0')}-${String(i + 1).padStart(4, '0')}`,
        cashierId: userId,
        customerId: customer.id,
        paymentMethod,
        items,
        createdAt: orderDate,
      });
      orderIndex++;
    }
  }

  console.log(`  Creating ${allOrders.length} orders...`);

  // Tạo orders theo batch
  const expectedResults: {
    productCode: string;
    totalQty: number;
    totalRevenue: number;
    totalCost: number;
  }[] = [];

  for (const order of allOrders) {
    let totalComputed = 0;
    const orderItems = order.items.map(item => {
      const product = productMap.get(item.productCode)!;
      const lineTotal = Number(product.sellingPrice) * item.qty;
      totalComputed += lineTotal;

      // Track for verification
      const existing = expectedResults.find(r => r.productCode === item.productCode);
      if (existing) {
        existing.totalQty += item.qty;
        existing.totalRevenue += lineTotal;
        existing.totalCost += Number(product.costPrice) * item.qty;
      } else {
        expectedResults.push({
          productCode: item.productCode,
          totalQty: item.qty,
          totalRevenue: lineTotal,
          totalCost: Number(product.costPrice) * item.qty,
        });
      }

      return {
        productId: product.id,
        quantity: item.qty,
        unitPrice: product.sellingPrice,
        costPriceAtSale: product.costPrice,
      };
    });

    await prisma.order.create({
      data: {
        code: order.code,
        cashierId: order.cashierId,
        customerId: order.customerId,
        paymentMethod: order.paymentMethod as 'CASH' | 'TRANSFER',
        totalComputed,
        createdAt: order.createdAt,
        items: {
          create: orderItems,
        },
      },
    });
  }

  console.log(`  ✓ Created ${allOrders.length} orders`);

  // Ghi kết quả kỳ vọng ra file để verify
  const fs = await import('fs');
  const path = await import('path');

  // Sort by revenue desc
  expectedResults.sort((a, b) => b.totalRevenue - a.totalRevenue);

  const totalRevenue = expectedResults.reduce((s, r) => s + r.totalRevenue, 0);
  const totalCost = expectedResults.reduce((s, r) => s + r.totalCost, 0);
  const totalProfit = totalRevenue - totalCost;

  const report = {
    summary: {
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalCost: Math.round(totalCost * 100) / 100,
      totalProfit: Math.round(totalProfit * 100) / 100,
      totalQuantity: expectedResults.reduce((s, r) => s + r.totalQty, 0),
      totalOrders: allOrders.length,
      productCount: expectedResults.length,
    },
    topProducts: expectedResults.slice(0, 10).map(r => ({
      productCode: r.productCode,
      totalQty: r.totalQty,
      totalRevenue: Math.round(r.totalRevenue * 100) / 100,
      totalCost: Math.round(r.totalCost * 100) / 100,
      totalProfit: Math.round((r.totalRevenue - r.totalCost) * 100) / 100,
      profitMargin: Math.round((r.totalRevenue - r.totalCost) / r.totalRevenue * 10000) / 100,
    })),
  };

  const reportPath = path.join(__dirname, '..', 'seed-expected-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`  ✓ Expected report written to ${reportPath}`);

  // Print summary
  console.log('\n📊 Expected Report Summary:');
  console.log(`  Doanh thu:  ${report.summary.totalRevenue.toLocaleString('vi-VN')}₫`);
  console.log(`  Giá vốn:    ${report.summary.totalCost.toLocaleString('vi-VN')}₫`);
  console.log(`  Lợi nhuận:  ${report.summary.totalProfit.toLocaleString('vi-VN')}₫`);
  console.log(`  Số lượng:   ${report.summary.totalQuantity}`);
  console.log(`  Số đơn:     ${report.summary.totalOrders}`);
  console.log(`  Số SP:      ${report.summary.productCount}`);
  console.log('\n📈 Top 10 sản phẩm doanh thu:');
  for (const p of report.topProducts) {
    console.log(`  ${p.productCode}: qty=${p.totalQty}, revenue=${p.totalRevenue.toLocaleString('vi-VN')}₫, profit=${p.totalProfit.toLocaleString('vi-VN')}₫, margin=${p.profitMargin}%`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());