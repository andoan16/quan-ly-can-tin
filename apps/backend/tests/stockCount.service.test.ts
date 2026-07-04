import { describe, test, expect, afterEach } from '@jest/globals';
import { stockCountService } from '../src/services/stockCount.service';
import { setupTest, teardownTest, type TestContext } from './helpers';

let ctx: TestContext;

afterEach(async () => {
  if (ctx) await teardownTest(ctx);
});

describe('stockCountService', () => {
  test('tạo phiên kiểm kê — tạo items cho tất cả sản phẩm cơ bản', async () => {
    ctx = await setupTest();
    const { prisma, manager, product } = ctx;

    const sc = await stockCountService.create({
      note: 'Kiểm kê tháng 6',
      createdBy: manager.id,
    });

    expect(sc).toBeDefined();
    expect(sc.code).toMatch(/^KK-\d{8}-\d{4}$/);
    expect(sc.note).toBe('Kiểm kê tháng 6');
    expect(sc.countedAt).toBeNull(); // chưa hoàn thành

    // Kiểm tra có items
    const detail = await stockCountService.getById(sc.id);
    expect(detail).not.toBeNull();
    expect(detail!.items.length).toBeGreaterThanOrEqual(1);

    // Product test phải có trong items
    const testItem = detail!.items.find((i) => i.productId === product.id);
    expect(testItem).toBeDefined();
    expect(Number(testItem!.expectedQty)).toBe(100); // tồn kho ban đầu
    expect(Number(testItem!.actualQty)).toBe(100); // mặc định = expected
    expect(Number(testItem!.difference)).toBe(0);
  });

  test('cập nhật số thực — tính chênh lệch', async () => {
    ctx = await setupTest();
    const { manager, product } = ctx;

    const sc = await stockCountService.create({ createdBy: manager.id });
    const detail = await stockCountService.getById(sc.id);
    const testItem = detail!.items.find((i) => i.productId === product.id)!;

    // Nhập số thực = 95 (thiếu 5)
    const updated = await stockCountService.updateItem(testItem.id, 95);
    expect(Number(updated.actualQty)).toBe(95);
    expect(Number(updated.difference)).toBe(-5);
  });

  test('hoàn tất kiểm kê — cập nhật tồn kho cho items có chênh lệch', async () => {
    ctx = await setupTest();
    const { prisma, manager, product } = ctx;

    const sc = await stockCountService.create({ createdBy: manager.id });
    const detail = await stockCountService.getById(sc.id);
    const testItem = detail!.items.find((i) => i.productId === product.id)!;

    // Đặt số thực = 90 (thiếu 10)
    await stockCountService.updateItem(testItem.id, 90);

    // Hoàn tất
    const finalized = await stockCountService.finalize(sc.id, manager.id);
    expect(finalized.countedAt).not.toBeNull();

    // Tồn kho phải = 90
    const updatedProduct = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(Number(updatedProduct.currentStock)).toBe(90);

    // Có inventory transaction COUNT
    const trx = await prisma.inventoryTransaction.findFirst({
      where: { productId: product.id, type: 'COUNT' },
    });
    expect(trx).not.toBeNull();
    expect(Number(trx!.stockBefore)).toBe(100);
    expect(Number(trx!.stockAfter)).toBe(90);
    expect(Number(trx!.quantity)).toBe(-10);
  });

  test('hoàn tất kiểm kê — không tạo transaction cho items không lệch', async () => {
    ctx = await setupTest();
    const { prisma, manager, product } = ctx;

    const sc = await stockCountService.create({ createdBy: manager.id });

    // Không thay đổi gì — tất cả actual = expected
    await stockCountService.finalize(sc.id, manager.id);

    // Không có transaction COUNT
    const trx = await prisma.inventoryTransaction.findFirst({
      where: { productId: product.id, type: 'COUNT' },
    });
    expect(trx).toBeNull();
  });

  test('từ chối hoàn tất phiên đã hoàn thành', async () => {
    ctx = await setupTest();
    const { manager } = ctx;

    const sc = await stockCountService.create({ createdBy: manager.id });
    await stockCountService.finalize(sc.id, manager.id);

    await expect(
      stockCountService.finalize(sc.id, manager.id),
    ).rejects.toThrow(/đã hoàn thành/);
  });

  test('từ chối cập nhật item khi phiên đã hoàn thành', async () => {
    ctx = await setupTest();
    const { manager, product } = ctx;

    const sc = await stockCountService.create({ createdBy: manager.id });
    const detail = await stockCountService.getById(sc.id);
    const testItem = detail!.items.find((i) => i.productId === product.id)!;

    await stockCountService.finalize(sc.id, manager.id);

    await expect(
      stockCountService.updateItem(testItem.id, 50),
    ).rejects.toThrow(/đã hoàn thành/);
  });

  test('danh sách phiên kiểm kê', async () => {
    ctx = await setupTest();
    const { manager } = ctx;

    const sc = await stockCountService.create({ note: 'Test list', createdBy: manager.id });
    const list = await stockCountService.list({ page: 1, size: 50 });

    expect(list.items.some((s) => s.id === sc.id)).toBe(true);
    expect(list.total).toBeGreaterThanOrEqual(1);
  });
});