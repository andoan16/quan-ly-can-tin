/**
 * Test helpers — thiết lập dữ liệu test độc lập, dọn dẹp sau mỗi test.
 *
 * Cách dùng: import { setupTest, teardownTest } from './helpers';
 *   const ctx = await setupTest();
 *   ... // ctx có cashier, customer, product, bundleProduct, prisma
 *   await teardownTest(ctx);
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

export interface TestContext {
  prisma: PrismaClient;
  cashier: { id: string };
  manager: { id: string };
  customer: { id: string; balance: number };
  product: { id: string; code: string; currentStock: number; sellingPrice: number; costPrice: number };
  bundleProduct: { id: string; code: string; factor: number; sellingPrice: number; parentProductId: string };
  cleanup: () => Promise<void>;
}

let testCounter = 0;

export async function setupTest(): Promise<TestContext> {
  testCounter++;
  const randId = Math.floor(Math.random() * 9999999).toString().padStart(7, '0');
  const suffix = `${Date.now()}_${testCounter}_${randId}`;
  const prisma = new PrismaClient();

  // Tạo user cashier + manager cho test
  const passwordHash = await bcrypt.hash('test', 10);
  const cashier = await prisma.user.create({
    data: { username: `test_cashier_${suffix}`, passwordHash, fullName: 'Test Cashier', role: 'CASHIER' },
  });
  const manager = await prisma.user.create({
    data: { username: `test_manager_${suffix}`, passwordHash, fullName: 'Test Manager', role: 'MANAGER' },
  });

  // Tạo customer có số dư lớn
  const customer = await prisma.customer.create({
    data: {
      code: `TEST_C_${suffix}`.slice(0, 20),
      fullName: `Khách Test ${suffix}`,
      balance: 10_000_000,
    },
  });

  // Tạo unit cơ bản
  const unit = await prisma.unit.create({
    data: { code: `TU_${suffix}`.slice(0, 20), name: 'Đơn vị test' },
  });

  // Tạo bundle unit
  const bundleUnit = await prisma.unit.create({
    data: { code: `TBU_${suffix}`.slice(0, 20), name: 'Thùng test' },
  });

  // Tạo category — prefix unique dùng randId ở đầu để tránh trùng
  const category = await prisma.category.create({
    data: { code: `TC_${suffix}`.slice(0, 20), name: 'Danh mục test', prefix: `T${randId}`.slice(0, 10) },
  });

  // Tạo sản phẩm cơ bản (bán lẻ)
  const product = await prisma.product.create({
    data: {
      code: `TP_${suffix}`.slice(0, 30),
      name: 'Sản phẩm test',
      categoryId: category.id,
      unitId: unit.id,
      sellingPrice: 10000,
      costPrice: 6000,
      currentStock: 100,
    },
  });

  // Tạo sản phẩm bundle (đóng gói)
  const bundleProduct = await prisma.product.create({
    data: {
      code: `TP_${suffix}_TH`.slice(0, 30),
      name: 'Sản phẩm test Thùng 10',
      categoryId: category.id,
      unitId: unit.id,
      sellingPrice: 90000,
      costPrice: 50000,
      currentStock: 0,
      parentProductId: product.id,
      factor: 10,
      bundleUnitId: bundleUnit.id,
    },
  });

  const createdIds: { model: string; id: string }[] = [];

  const cleanup = async () => {
    // Xoá theo thứ tự FK — stockCount items trước, rồi stockCount, rồi products
    await prisma.stockCountItem.deleteMany({ where: { stockCount: { createdBy: { in: [cashier.id, manager.id] } } } }).catch(() => {});
    await prisma.stockCount.deleteMany({ where: { createdBy: { in: [cashier.id, manager.id] } } }).catch(() => {});
    await prisma.inventoryTransaction.deleteMany({ where: { createdBy: { in: [cashier.id, manager.id] } } });
    await prisma.orderItem.deleteMany({ where: { order: { cashierId: { in: [cashier.id, manager.id] } } } });
    await prisma.order.deleteMany({ where: { cashierId: { in: [cashier.id, manager.id] } } });
    await prisma.topupTransaction.deleteMany({ where: { createdBy: { in: [cashier.id, manager.id] } } }).catch(() => {});
    await prisma.product.deleteMany({ where: { id: { in: [product.id, bundleProduct.id] } } });
    await prisma.category.deleteMany({ where: { id: category.id } });
    await prisma.unit.deleteMany({ where: { id: { in: [unit.id, bundleUnit.id] } } });
    await prisma.customer.deleteMany({ where: { id: customer.id } });
    await prisma.user.deleteMany({ where: { id: { in: [cashier.id, manager.id] } } });
    await prisma.$disconnect();
  };

  return {
    prisma,
    cashier,
    manager,
    customer: { id: customer.id, balance: Number(customer.balance) },
    product: {
      id: product.id,
      code: product.code,
      currentStock: Number(product.currentStock),
      sellingPrice: Number(product.sellingPrice),
      costPrice: Number(product.costPrice),
    },
    bundleProduct: {
      id: bundleProduct.id,
      code: bundleProduct.code,
      factor: Number(bundleProduct.factor),
      sellingPrice: Number(bundleProduct.sellingPrice),
      parentProductId: product.id,
    },
    cleanup,
  };
}

export async function teardownTest(ctx: TestContext) {
  await ctx.cleanup();
}