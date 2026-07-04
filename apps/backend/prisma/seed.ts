import * as bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // --- Users ---
  const passwordHash = await bcrypt.hash('admin', 10);
  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: { username: 'admin', passwordHash, fullName: 'Quản trị viên', role: 'ADMIN' },
  });

  const cashierHash = await bcrypt.hash('cashier', 10);
  const cashier = await prisma.user.upsert({
    where: { username: 'cashier' },
    update: {},
    create: { username: 'cashier', passwordHash: cashierHash, fullName: 'Nguyễn Thị Bán', role: 'CASHIER' },
  });

  const managerHash = await bcrypt.hash('manager', 10);
  await prisma.user.upsert({
    where: { username: 'manager' },
    update: {},
    create: { username: 'manager', passwordHash: managerHash, fullName: 'Trần Quản Lý', role: 'MANAGER' },
  });

  const warehouseHash = await bcrypt.hash('warehouse', 10);
  await prisma.user.upsert({
    where: { username: 'warehouse' },
    update: {},
    create: { username: 'warehouse', passwordHash: warehouseHash, fullName: 'Lê Kho Thủ', role: 'WAREHOUSE' },
  });

  // --- Units ---
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
  for (const u of units) {
    await prisma.unit.upsert({ where: { code: u.code }, update: {}, create: u });
  }

  // --- Categories ---
  const categories = [
    { code: 'NUOC', name: 'Nước uống', prefix: 'NUOC', note: 'Các loại nước uống' },
    { code: 'MON_CHIN', name: 'Món chính', prefix: 'MC', note: 'Cơm, bún, phở...' },
    { code: 'MON_NHO', name: 'Món nhúng/Nhỏ', prefix: 'MN', note: 'Gỏi, nem, chả...' },
    { code: 'TRANG_MIENG', name: 'Tráng miệng', prefix: 'TM', note: 'Chè, trái cây...' },
    { code: 'BANH_MI', name: 'Bánh mì', prefix: 'BM', note: 'Bánh mì các loại' },
  ];
  for (const c of categories) {
    await prisma.category.upsert({ where: { code: c.code }, update: { prefix: c.prefix }, create: c });
  }

  // --- Customer Groups ---
  const groups = [
    { code: 'GV', name: 'Giáo viên', note: 'Giáo viên trường' },
    { code: 'HS', name: 'Học sinh', note: 'Học sinh trường' },
    { code: 'NV', name: 'Nhân viên', note: 'Nhân viên căn tin' },
    { code: 'KHACH', name: 'Khách vãng lai', note: 'Khách ngoài' },
  ];
  for (const g of groups) {
    await prisma.customerGroup.upsert({ where: { code: g.code }, update: {}, create: g });
  }

  // --- Products ---
  const allUnits = await prisma.unit.findMany();
  const allCategories = await prisma.category.findMany();
  const unitMap = Object.fromEntries(allUnits.map(u => [u.code, u.id]));
  const catMap = Object.fromEntries(allCategories.map(c => [c.code, c.id]));

  const products = [
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
  for (const p of products) {
    await prisma.product.upsert({
      where: { code: p.code },
      update: {},
      create: p,
    });
  }

  // --- Customers ---
  const allGroups = await prisma.customerGroup.findMany();
  const groupMap = Object.fromEntries(allGroups.map(g => [g.code, g.id]));

  const customers = [
    { code: 'GV001', fullName: 'Nguyễn Văn An', groupId: groupMap['GV'], phone: '0901234567' },
    { code: 'GV002', fullName: 'Trần Thị Bình', groupId: groupMap['GV'], phone: '0902345678' },
    { code: 'GV003', fullName: 'Lê Văn Cường', groupId: groupMap['GV'], phone: '0903456789' },
    { code: 'GV004', fullName: 'Phạm Thị Dung', groupId: groupMap['GV'], phone: '0904567890' },
    { code: 'GV005', fullName: 'Hoàng Văn Em', groupId: groupMap['GV'], phone: '0905678901' },
    { code: 'GV006', fullName: 'Vũ Thị Phương', groupId: groupMap['GV'], phone: '0906789012' },
    { code: 'GV007', fullName: 'Đặng Văn Giang', groupId: groupMap['GV'], phone: '0907890123' },
    { code: 'GV008', fullName: 'Bùi Thị Hoa', groupId: groupMap['GV'], phone: '0908901234' },
    { code: 'GV009', fullName: 'Ngô Văn Ích', groupId: groupMap['GV'], phone: '0909012345' },
    { code: 'GV010', fullName: 'Lý Thị Khánh', groupId: groupMap['GV'], phone: '0900123456' },
    { code: 'HS001', fullName: 'Trần Minh A', groupId: groupMap['HS'], phone: '0911234567' },
    { code: 'HS002', fullName: 'Nguyễn Thị Bảo', groupId: groupMap['HS'], phone: '0912234567' },
    { code: 'HS003', fullName: 'Lê Hoàng Cường', groupId: groupMap['HS'], phone: '0913234567' },
    { code: 'HS004', fullName: 'Phạm Minh Dũng', groupId: groupMap['HS'], phone: '0914234567' },
    { code: 'HS005', fullName: 'Vũ Thị Hạnh', groupId: groupMap['HS'], phone: '0915234567' },
    { code: 'HS006', fullName: 'Hoàng Đức Anh', groupId: groupMap['HS'], phone: '0916234567' },
    { code: 'HS007', fullName: 'Đặng Minh Kiên', groupId: groupMap['HS'], phone: '0917234567' },
    { code: 'HS008', fullName: 'Bùi Thị Lan', groupId: groupMap['HS'], phone: '0918234567' },
    { code: 'HS009', fullName: 'Ngô Quang Minh', groupId: groupMap['HS'], phone: '0919234567' },
    { code: 'HS010', fullName: 'Lý Thùy Linh', groupId: groupMap['HS'], phone: '0910234567' },
    { code: 'HS011', fullName: 'Đỗ Văn Nam', groupId: groupMap['HS'], phone: '0921234567' },
    { code: 'HS012', fullName: 'Mai Thị Ngọc', groupId: groupMap['HS'], phone: '0922234567' },
    { code: 'HS013', fullName: 'Trịnh Quốc Phong', groupId: groupMap['HS'], phone: '0923234567' },
    { code: 'HS014', fullName: 'Huỳnh Thị Quỳnh', groupId: groupMap['HS'], phone: '0924234567' },
    { code: 'HS015', fullName: 'Phan Văn Sơn', groupId: groupMap['HS'], phone: '0925234567' },
    { code: 'NV001', fullName: 'Nguyễn Thị Thu', groupId: groupMap['NV'], phone: '0931234567' },
    { code: 'NV002', fullName: 'Lê Văn Tùng', groupId: groupMap['NV'], phone: '0932234567' },
    { code: 'NV003', fullName: 'Trần Thị Vân', groupId: groupMap['NV'], phone: '0933234567' },
    { code: 'KL001', fullName: 'Khách vãng lai 1', groupId: groupMap['KHACH'], phone: '' },
    { code: 'KL002', fullName: 'Khách vãng lai 2', groupId: groupMap['KHACH'], phone: '' },
  ];
  for (const c of customers) {
    await prisma.customer.upsert({
      where: { code: c.code },
      update: {},
      create: c,
    });
  }

  // --- Sample Orders ---
  // Clear old orders to avoid unique constraint on code
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();

  const allProducts = await prisma.product.findMany({ take: 5 });
  const allCustomers = await prisma.customer.findMany({ take: 3 });

  for (let i = 0; i < 5; i++) {
    const product = allProducts[i % allProducts.length];
    const customer = allCustomers[i % allCustomers.length];
    const qty = i + 1;
    const total = Number(product.sellingPrice) * qty;

    await prisma.order.create({
      data: {
        code: `HD${String(i + 1).padStart(5, '0')}`,
        cashierId: cashier.id,
        customerId: customer.id,
        paymentMethod: i % 2 === 0 ? 'CASH' : 'TRANSFER',
        totalComputed: total,
        items: {
          create: [{
            productId: product.id,
            // OrderItem.quantity stores effectiveQty (base unit). Sample products are all
            // base products (no parentProductId), so effectiveQty === qty — but keep the
            // semantic contract consistent with order.service.ts which stores effectiveQty.
            quantity: qty,
            unitPrice: product.sellingPrice,
            costPriceAtSale: product.costPrice, // per-base-unit cost (sample products are base)
          }],
        },
      },
    });
  }

  // --- Bundle Products (sản phẩm đóng gói: Thùng, Lốc) ---
  const thungUnit = await prisma.unit.findUniqueOrThrow({ where: { code: 'THUNG' } });
  const locUnit = await prisma.unit.findUniqueOrThrow({ where: { code: 'LOC' } });
  const chaiUnit = await prisma.unit.findUniqueOrThrow({ where: { code: 'CHAI' } });
  const goiUnit = await prisma.unit.findUniqueOrThrow({ where: { code: 'GOI' } });

  const allProductIds = Object.fromEntries(
    (await prisma.product.findMany()).map(p => [p.code, p.id])
  );

  const bundleProducts = [
    // Nước suối: 1 Thùng = 24 Chai, giá sỉ
    { code: 'NUOC000001-TH', name: 'Nước suối Thùng 24 chai', categoryId: catMap['NUOC'], unitId: allProductIds['NUOC000001'] ? (await prisma.product.findUniqueOrThrow({ where: { code: 'NUOC000001' } })).unitId : chaiUnit.id, sellingPrice: 96000, costPrice: 72000, currentStock: 0, parentProductId: allProductIds['NUOC000001'], factor: 24, bundleUnitId: thungUnit.id, isActive: true },
    // Sữa tươi: 1 Thùng = 24 Chai
    { code: 'NUOC000007-TH', name: 'Sữa tươi Thùng 24 chai', categoryId: catMap['NUOC'], unitId: allProductIds['NUOC000007'] ? (await prisma.product.findUniqueOrThrow({ where: { code: 'NUOC000007' } })).unitId : chaiUnit.id, sellingPrice: 168000, costPrice: 96000, currentStock: 0, parentProductId: allProductIds['NUOC000007'], factor: 24, bundleUnitId: thungUnit.id, isActive: true },
    // Bánh mì thịt: 1 Lốc = 6 Gói
    { code: 'BM000001-L', name: 'Bánh mì thịt Lốc 6 cái', categoryId: catMap['BANH_MI'], unitId: allProductIds['BM000001'] ? (await prisma.product.findUniqueOrThrow({ where: { code: 'BM000001' } })).unitId : goiUnit.id, sellingPrice: 90000, costPrice: 48000, currentStock: 0, parentProductId: allProductIds['BM000001'], factor: 6, bundleUnitId: locUnit.id, isActive: true },
    // Nem rán: 1 Lốc = 10 Gói
    { code: 'MN000002-L', name: 'Nem rán Lốc 10 cái', categoryId: catMap['MON_NHO'], unitId: allProductIds['MN000002'] ? (await prisma.product.findUniqueOrThrow({ where: { code: 'MN000002' } })).unitId : goiUnit.id, sellingPrice: 80000, costPrice: 40000, currentStock: 0, parentProductId: allProductIds['MN000002'], factor: 10, bundleUnitId: locUnit.id, isActive: true },
  ];

  for (const bp of bundleProducts) {
    const { code, name, categoryId, sellingPrice, costPrice, currentStock, parentProductId, factor, bundleUnitId, isActive } = bp;
    const parentProduct = parentProductId ? await prisma.product.findUniqueOrThrow({ where: { id: parentProductId } }) : null;
    await prisma.product.upsert({
      where: { code },
      update: {},
      create: {
        code,
        name,
        categoryId,
        unitId: parentProduct?.unitId || chaiUnit.id,
        sellingPrice,
        costPrice,
        currentStock,
        parentProductId,
        factor,
        bundleUnitId,
        isActive,
      },
    });
  }

  console.log('Seed completed with sample data');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());