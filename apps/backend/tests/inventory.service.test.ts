import { describe, test, expect, afterEach } from '@jest/globals';
import { inventoryService } from '../src/services/inventory.service';
import { setupTest, teardownTest, type TestContext } from './helpers';

let ctx: TestContext;

afterEach(async () => {
  if (ctx) await teardownTest(ctx);
});

describe('inventoryService.stockIn', () => {
  test('nhập kho sản phẩm thường — cộng tồn kho', async () => {
    ctx = await setupTest();
    const { prisma, manager, product } = ctx;

    const trx = await inventoryService.stockIn({
      productId: product.id,
      quantity: 50,
      reason: 'Nhập hàng',
      createdBy: manager.id,
    });

    expect(trx.type).toBe('IN');
    expect(Number(trx.stockBefore)).toBe(100);
    expect(Number(trx.stockAfter)).toBe(150);

    const updated = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(Number(updated.currentStock)).toBe(150);
  });

  test('nhập kho bundle — quy đổi về ĐVT cơ bản', async () => {
    ctx = await setupTest();
    const { prisma, manager, product, bundleProduct } = ctx;

    // Nhập 3 Thùng, factor=10 → effectiveQty=30
    const trx = await inventoryService.stockIn({
      productId: bundleProduct.id,
      quantity: 3,
      reason: 'Nhập thùng',
      createdBy: manager.id,
    });

    expect(Number(trx.quantity)).toBe(30); // effectiveQty
    expect(Number(trx.stockBefore)).toBe(100);
    expect(Number(trx.stockAfter)).toBe(130);

    // Kho của sản phẩm cơ bản được cộng
    const updated = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(Number(updated.currentStock)).toBe(130);
  });
});

describe('inventoryService.stockOut', () => {
  test('xuất kho sản phẩm thường — trừ tồn kho', async () => {
    ctx = await setupTest();
    const { prisma, manager, product } = ctx;

    const trx = await inventoryService.stockOut({
      productId: product.id,
      quantity: 20,
      reason: 'Xuất hàng hỏng',
      createdBy: manager.id,
    });

    expect(trx.type).toBe('OUT');
    expect(Number(trx.stockBefore)).toBe(100);
    expect(Number(trx.stockAfter)).toBe(80);

    const updated = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(Number(updated.currentStock)).toBe(80);
  });

  test('từ chối khi xuất quá tồn kho', async () => {
    ctx = await setupTest();
    const { manager, product } = ctx;

    await expect(
      inventoryService.stockOut({
        productId: product.id,
        quantity: 500,
        reason: 'Xuất quá',
        createdBy: manager.id,
      }),
    ).rejects.toThrow(/Insufficient stock/);
  });
});

describe('inventoryService.adjust', () => {
  test('điều chỉnh tồn kho — đặt số lượng mới', async () => {
    ctx = await setupTest();
    const { prisma, manager, product } = ctx;

    const trx = await inventoryService.adjust({
      productId: product.id,
      newStock: 75,
      reason: 'Kiểm kê phát hiện lệch',
      createdBy: manager.id,
    });

    expect(trx.type).toBe('ADJUSTMENT');
    expect(Number(trx.stockBefore)).toBe(100);
    expect(Number(trx.stockAfter)).toBe(75);

    const updated = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(Number(updated.currentStock)).toBe(75);
  });
});