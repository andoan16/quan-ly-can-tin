import { describe, test, expect, afterAll, beforeEach, afterEach } from '@jest/globals';
import { orderService } from '../src/services/order.service';
import { setupTest, teardownTest, type TestContext } from './helpers';

let ctx: TestContext;

afterEach(async () => {
  if (ctx) await teardownTest(ctx);
});

describe('orderService.create', () => {
  test('tạo đơn thường — trừ kho + trừ số dư khách', async () => {
    ctx = await setupTest();
    const { prisma, cashier, customer, product } = ctx;

    const order = await orderService.create({
      cashierId: cashier.id,
      customerId: customer.id,
      items: [{ productId: product.id, quantity: 3 }],
    });

    // Kiểm tra đơn được tạo
    expect(order).toBeDefined();
    expect(order.code).toMatch(/^HD-\d{8}-\d{7}$/);
    expect(order.items).toHaveLength(1);
    expect(Number(order.items[0].quantity)).toBe(3);
    expect(Number(order.items[0].unitPrice)).toBe(10000);

    // Tổng = 3 × 10.000 = 30.000
    expect(Number(order.totalComputed)).toBe(30000);

    // Kiểm tra số dư khách đã trừ
    const updatedCustomer = await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } });
    expect(Number(updatedCustomer.balance)).toBe(10_000_000 - 30000);

    // Kiểm tra tồn kho đã trừ: 100 - 3 = 97
    const updatedProduct = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(Number(updatedProduct.currentStock)).toBe(97);

    // Kiểm tra inventory transaction OUT
    const trx = await prisma.inventoryTransaction.findFirst({
      where: { orderId: order.id, type: 'OUT' },
    });
    expect(trx).not.toBeNull();
    expect(Number(trx!.stockBefore)).toBe(100);
    expect(Number(trx!.stockAfter)).toBe(97);
  });

  test('tạo đơn bundle — quy đổi về ĐVT cơ bản để trừ kho', async () => {
    ctx = await setupTest();
    const { prisma, cashier, customer, product, bundleProduct } = ctx;

    // Bán 2 Thùng × 90.000 = 180.000, effectiveQty = 2 × 10 = 20
    const order = await orderService.create({
      cashierId: cashier.id,
      customerId: customer.id,
      items: [{ productId: bundleProduct.id, quantity: 2 }],
    });

    expect(Number(order.totalComputed)).toBe(180000);
    expect(Number(order.items[0].unitPrice)).toBe(90000);
    expect(Number(order.items[0].quantity)).toBe(2);

    // Tồn kho product cơ bản: 100 - 20 = 80
    const updatedProduct = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(Number(updatedProduct.currentStock)).toBe(80);

    // Inventory transaction trừ kho từ parentProduct
    const trx = await prisma.inventoryTransaction.findFirst({
      where: { orderId: order.id, type: 'OUT' },
    });
    expect(trx).not.toBeNull();
    expect(trx!.productId).toBe(product.id);
    expect(Number(trx!.stockBefore)).toBe(100);
    expect(Number(trx!.stockAfter)).toBe(80);
  });

  test('từ chối khi tồn kho không đủ', async () => {
    ctx = await setupTest();
    const { cashier, customer, product } = ctx;

    // Product có 100 stock, cố bán 200
    await expect(
      orderService.create({
        cashierId: cashier.id,
        customerId: customer.id,
        items: [{ productId: product.id, quantity: 200 }],
      }),
    ).rejects.toThrow(/Insufficient stock/);
  });

  test('từ chối khi số dư khách không đủ', async () => {
    ctx = await setupTest();
    const { prisma, cashier, customer, product } = ctx;

    // Giảm số dư khách xuống chỉ còn 20.000
    await prisma.customer.update({
      where: { id: customer.id },
      data: { balance: 20000 },
    });

    // Cố mua 3 × 10.000 = 30.000 > 20.000
    await expect(
      orderService.create({
        cashierId: cashier.id,
        customerId: customer.id,
        items: [{ productId: product.id, quantity: 3 }],
      }),
    ).rejects.toThrow(/Số dư không đủ/);
  });

  test('từ chối khi không chọn khách hàng', async () => {
    ctx = await setupTest();
    const { cashier, product } = ctx;

    await expect(
      orderService.create({
        cashierId: cashier.id,
        customerId: undefined as unknown as string,
        items: [{ productId: product.id, quantity: 1 }],
      }),
    ).rejects.toThrow(/Chưa chọn người mua/);
  });

  test('từ chối khi quantity <= 0', async () => {
    ctx = await setupTest();
    const { cashier, customer, product } = ctx;

    await expect(
      orderService.create({
        cashierId: cashier.id,
        customerId: customer.id,
        items: [{ productId: product.id, quantity: 0 }],
      }),
    ).rejects.toThrow(/positive/);
  });
});

describe('orderService.cancel', () => {
  test('hủy đơn — hoàn tiền khách + hoàn lại tồn kho', async () => {
    ctx = await setupTest();
    const { prisma, manager, customer, product } = ctx;

    // Tạo đơn trước
    const order = await orderService.create({
      cashierId: manager.id,
      customerId: customer.id,
      items: [{ productId: product.id, quantity: 5 }],
    });

    // Số dư sau mua = 10.000.000 - 50.000 = 9.950.000
    const customerAfterBuy = await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } });
    expect(Number(customerAfterBuy.balance)).toBe(10_000_000 - 50000);

    // Tồn kho sau bán = 100 - 5 = 95
    const productAfterBuy = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(Number(productAfterBuy.currentStock)).toBe(95);

    // Hủy đơn
    const cancelled = await orderService.cancel({
      orderId: order.id,
      cancelledBy: manager.id,
      reason: 'Bán nhầm sản phẩm',
    });

    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.cancelReason).toBe('Bán nhầm sản phẩm');
    expect(cancelled.cancelledBy).toBe(manager.id);

    // Số dư khách được hoàn lại: 9.950.000 + 50.000 = 10.000.000
    const customerAfterCancel = await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } });
    expect(Number(customerAfterCancel.balance)).toBe(10_000_000);

    // Tồn kho hoàn lại: 95 + 5 = 100
    const productAfterCancel = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(Number(productAfterCancel.currentStock)).toBe(100);

    // Có inventory transaction IN (hoàn kho)
    const refundTrx = await prisma.inventoryTransaction.findFirst({
      where: { orderId: order.id, type: 'IN' },
    });
    expect(refundTrx).not.toBeNull();
    expect(Number(refundTrx!.quantity)).toBe(5);
    expect(Number(refundTrx!.stockBefore)).toBe(95);
    expect(Number(refundTrx!.stockAfter)).toBe(100);
  });

  test('hủy đơn bundle — hoàn kho về ĐVT cơ bản', async () => {
    ctx = await setupTest();
    const { prisma, manager, customer, product, bundleProduct } = ctx;

    // Bán 2 Thùng (effectiveQty=20), kho còn 80
    const order = await orderService.create({
      cashierId: manager.id,
      customerId: customer.id,
      items: [{ productId: bundleProduct.id, quantity: 2 }],
    });

    const afterBuy = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(Number(afterBuy.currentStock)).toBe(80);

    // Hủy đơn
    await orderService.cancel({
      orderId: order.id,
      cancelledBy: manager.id,
      reason: 'Khách đổi ý',
    });

    // Kho hoàn lại: 80 + 20 = 100
    const afterCancel = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(Number(afterCancel.currentStock)).toBe(100);
  });

  test('từ chối hủy đơn đã hủy', async () => {
    ctx = await setupTest();
    const { manager, customer, product } = ctx;

    const order = await orderService.create({
      cashierId: manager.id,
      customerId: customer.id,
      items: [{ productId: product.id, quantity: 1 }],
    });

    await orderService.cancel({
      orderId: order.id,
      cancelledBy: manager.id,
      reason: 'Lý do 1',
    });

    // Hủy lần 2 → lỗi
    await expect(
      orderService.cancel({
        orderId: order.id,
        cancelledBy: manager.id,
        reason: 'Lý do 2',
      }),
    ).rejects.toThrow(/đã bị hủy/);
  });

  test('từ chối hủy khi không có lý do', async () => {
    ctx = await setupTest();
    const { manager, customer, product } = ctx;

    const order = await orderService.create({
      cashierId: manager.id,
      customerId: customer.id,
      items: [{ productId: product.id, quantity: 1 }],
    });

    await expect(
      orderService.cancel({
        orderId: order.id,
        cancelledBy: manager.id,
        reason: '',
      }),
    ).rejects.toThrow(/Lý do hủy đơn/);
  });
});

describe('orderService.list', () => {
  test('lọc theo trạng thái COMPLETED', async () => {
    ctx = await setupTest();
    const { cashier, customer, product } = ctx;

    const order = await orderService.create({
      cashierId: cashier.id,
      customerId: customer.id,
      items: [{ productId: product.id, quantity: 1 }],
    });

    const completed = await orderService.list({ page: 1, size: 50, status: 'COMPLETED' });
    const cancelled = await orderService.list({ page: 1, size: 50, status: 'CANCELLED' });

    expect(completed.items.some((o) => o.id === order.id)).toBe(true);
    expect(cancelled.items.some((o) => o.id === order.id)).toBe(false);
  });

  test('tìm kiếm theo mã đơn', async () => {
    ctx = await setupTest();
    const { cashier, customer, product } = ctx;

    const order = await orderService.create({
      cashierId: cashier.id,
      customerId: customer.id,
      items: [{ productId: product.id, quantity: 1 }],
    });

    // Tìm theo 6 ký tự đầu của mã đơn
    const partialCode = order.code.slice(0, 6);
    const result = await orderService.list({ page: 1, size: 50, search: partialCode });
    expect(result.items.some((o) => o.id === order.id)).toBe(true);
  });
});