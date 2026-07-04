import { getApiErrorMessage } from '@/api/client';
import { useState, useEffect, useRef } from 'react';
import { Row, Col, Card, Input, Button, List, Typography, Tag, Modal, message, Empty, Alert, Statistic, Spin, InputNumber } from 'antd';
import { PrinterOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { productApi, customerApi, orderApi } from '@/api/endpoints';
import type { Order, Product, Customer } from '@/api/endpoints';
import { usePosStore } from '@/stores/posStore';
import Receipt from './Receipt';

const { Text, Title } = Typography;

function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function formatMoney(v: number) {
  return Number(v).toLocaleString('vi-VN') + '₫';
}

export default function PosPage() {
  const { customer, cart, addItem, updateQty, removeItem, clearCart, setCustomer } = usePosStore();
  const [productSearch, setProductSearch] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [payOpen, setPayOpen] = useState(false);
  const [receiptOrder, setReceiptOrder] = useState<Order | null>(null);
  const receiptRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const debouncedProductSearch = useDebouncedValue(productSearch, 300);
  const debouncedCustomerSearch = useDebouncedValue(customerSearch, 300);

  const { data: products, isFetching: productsFetching } = useQuery({
    queryKey: ['products-pos', debouncedProductSearch],
    queryFn: () => productApi.list({ search: debouncedProductSearch, size: 10 }).then((r) => r.data.data.items),
  });

  const { data: customers, isFetching: customersFetching } = useQuery({
    queryKey: ['customers-pos', debouncedCustomerSearch],
    queryFn: () => customerApi.list({ search: debouncedCustomerSearch, size: 10 }).then((r) => r.data.data.items),
  });

  const { data: todayOrders } = useQuery({
    queryKey: ['orders-today'],
    queryFn: () => {
      const today = new Date().toISOString().slice(0, 10);
      return orderApi.list({ page: 1, size: 50, from: today, to: today + 'T23:59:59' }).then((r) => r.data.data.items);
    },
    refetchInterval: 30_000,
  });

  const createOrder = useMutation({
    mutationFn: orderApi.create,
    onSuccess: (resp) => {
      const order = resp.data.data;
      const newBalance = order.balanceAfter ?? 0;
      message.success(`Thanh toán thành công! Còn lại: ${formatMoney(Number(newBalance))}`);
      clearCart();
      setPayOpen(false);
      setReceiptOrder(order);
      queryClient.invalidateQueries({ queryKey: ['orders-today'] });
      queryClient.invalidateQueries({ queryKey: ['products-pos'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['customers-pos'] });
    },
    onError: (err: unknown) => {
            const msg = getApiErrorMessage(err, 'Thanh toán thất bại');
      message.error(msg);
    },
  });

  const total = cart.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const balance = customer?.balance ?? 0;
  const insufficient = total > balance;

  const handlePay = () => {
    if (!customer) {
      message.warning('Vui lòng chọn người mua trước');
      return;
    }
    if (insufficient) {
      message.warning('Số dư không đủ');
      return;
    }
    createOrder.mutate({
      customerId: customer.id,
      items: cart.map((i) => ({
        productId: i.productId,
        quantity: i.quantity,
      })),
    });
  };

  // Thêm sản phẩm vào giỏ — bấm 1 lần là xong
  const handleAdd = (p: Product) => {
    const isBundle = !!p.parentProductId && !!p.factor;
    const stock = isBundle ? Number(p.parentProduct?.currentStock ?? 0) : Number(p.currentStock);
    const maxQty = isBundle && p.factor ? Math.floor(stock / Number(p.factor)) : Math.floor(stock);
    addItem({
      productId: p.id,
      name: p.name,
      price: Number(p.sellingPrice),
      quantity: 1,
      unitName: p.bundleUnit?.name || p.unit?.name,
      isBundle,
      bundleLabel: isBundle ? `1 ${p.bundleUnit?.name || 'đơn vị'} = ${p.factor} ${p.parentProduct?.unit?.name || p.unit?.name || 'đơn vị'}` : undefined,
      maxQty,
    });
  };

  return (
    <Row gutter={[8, 8]} style={{ height: '100%' }}>
      <Col span={8}>
        <Card title="Tìm kiếm" size="small" styles={{ body: { padding: 8 }}}>
          <Input.Search
            placeholder="Tìm người mua"
            allowClear
            size="small"
            value={customerSearch}
            onChange={(e) => setCustomerSearch(e.target.value)}
            onSearch={setCustomerSearch}
          />
          {customer ? (
            <div style={{ marginTop: 8, padding: '8px 12px', background: '#f6ffed', border: '1px solid #b7eb8f' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text strong>{customer.fullName}</Text>
                <Button type="default" size="small" danger onClick={() => setCustomer(null)}>Đổi</Button>
              </div>
              <Statistic
                title="Số dư"
                value={balance}
                formatter={(v) => formatMoney(v as number)}
                valueStyle={{ fontSize: 18, color: balance > 0 ? '#52c41a' : '#ff4d4f' }}
                style={{ marginTop: 4 }}
              />
            </div>
          ) : (
            <List
              size="small"
              dataSource={customers || []}
              locale={{ emptyText: customersFetching ? <Spin size="small" /> : <Empty description="Không có người mua" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
              renderItem={(c: Customer) => (
                <List.Item
                  actions={[
                    <Button type="primary" size="small" onClick={() => setCustomer({ id: c.id, fullName: c.fullName, balance: Number(c.balance) })}>Chọn</Button>,
                  ]}
                >
                  <List.Item.Meta
                    title={c.fullName}
                    description={
                      <span>
                        {c.code} · {formatMoney(Number(c.balance))}
                      </span>
                    }
                  />
                </List.Item>
              )}
            />
          )}
          <Input.Search
            placeholder="Tìm sản phẩm (tên/mã)"
            allowClear
            size="small"
            value={productSearch}
            onChange={(e) => setProductSearch(e.target.value)}
            onSearch={setProductSearch}
            style={{ marginTop: 8 }}
          />
          <List
          size="small"
          dataSource={products || []}
          locale={{ emptyText: productsFetching ? <Spin size="small" /> : <Empty description="Không có sản phẩm" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
          renderItem={(p: Product) => {
            const isBundle = !!p.parentProductId && !!p.factor;
            const baseUnitName = p.parentProduct?.unit?.name || p.unit?.name || '';
            const bundleUnitName = p.bundleUnit?.name || 'đóng gói';
            const stock = isBundle ? Number(p.parentProduct?.currentStock ?? 0) : Number(p.currentStock);
            const maxSellable = isBundle && p.factor ? Math.floor(stock / Number(p.factor)) : stock;
            return (
              <List.Item
                actions={[
                  <Button type="primary" size="small" disabled={stock <= 0} onClick={() => handleAdd(p)}>
                    {stock <= 0 ? 'Hết hàng' : 'Thêm'}
                  </Button>,
                ]}
              >
                <List.Item.Meta
                  title={
                    <span>
                      {p.name} <Text type="secondary" style={{ fontSize: 12 }}>({p.code})</Text>
                      {isBundle ? (
                        <Tag color="orange" style={{ marginLeft: 4, fontSize: 11 }}>
                          {bundleUnitName} × {p.factor} {baseUnitName}
                        </Tag>
                      ) : (
                        <Tag color="blue" style={{ marginLeft: 4, fontSize: 11 }}>
                          Bán lẻ
                        </Tag>
                      )}
                    </span>
                  }
                  description={
                    <span>
                      {Number(p.sellingPrice).toLocaleString('vi-VN')}₫
                      {isBundle ? ` / ${bundleUnitName}` : p.unit ? ` / ${p.unit.name}` : ''}
                      <Text type="secondary" style={{ fontSize: 11, marginLeft: 6 }}>
                        Tồn: {stock} {baseUnitName || (p.unit?.name ?? '')}
                        {isBundle && p.factor && (
                          <Text type="warning" style={{ fontSize: 11 }}>
                            {' '}(≡ bán tối đa {maxSellable} {bundleUnitName})
                          </Text>
                        )}
                      </Text>
                    </span>
                  }
                />
              </List.Item>
            );
          }}
          />
        </Card>
      </Col>

      <Col span={10}>
        <Card title="Giỏ hàng" size="small" styles={{ body: { padding: 8, display: 'flex', flexDirection: 'column', height: 'calc(100vh - 180px)' }}}>
          <List
            size="small"
            dataSource={cart}
            style={{ flex: 1, overflow: 'auto' }}
            renderItem={(item) => {
              const max = item.maxQty ?? Infinity;
              const atMax = item.quantity >= max;
              return (
              <List.Item
                actions={[
                  <Button size="small" disabled={item.quantity <= 1} onClick={() => updateQty(item.productId, item.quantity - 1)}>-</Button>,
                  <InputNumber
                    size="small"
                    min={1}
                    max={max === Infinity ? undefined : max}
                    value={item.quantity}
                    onChange={(v) => {
                      if (v == null) return;
                      const n = Math.floor(v);
                      if (n !== v) {
                        message.warning('Số lượng phải là số nguyên');
                      }
                      if (max !== Infinity && n > max) {
                        message.warning(`Tối đa ${max} ${item.unitName || ''} (tồn kho không đủ)`);
                      }
                      updateQty(item.productId, n);
                    }}
                    style={{ width: 56 }}
                    controls={false}
                  />,
                  <Button size="small" disabled={atMax} onClick={() => {
                    if (atMax) message.warning(`Tối đa ${max} ${item.unitName || ''} (tồn kho không đủ)`);
                    else updateQty(item.productId, item.quantity + 1);
                  }}>+</Button>,
                  <Button type="primary" danger size="small" onClick={() => removeItem(item.productId)}>Xóa</Button>,
                ]}
              >
                <List.Item.Meta
                  title={
                    <span>
                      {item.name}
                      {item.unitName && <Tag style={{ marginLeft: 4, fontSize: 11 }}>{item.unitName}</Tag>}
                      {item.isBundle && <Tag color="orange" style={{ fontSize: 11 }}>{item.bundleLabel}</Tag>}
                    </span>
                  }
                  description={`${item.price.toLocaleString('vi-VN')}₫${item.unitName ? `/${item.unitName}` : ''} × ${item.quantity}`}
                />
                <Text strong>{(item.price * item.quantity).toLocaleString('vi-VN')}₫</Text>
              </List.Item>
              );
            }}
          />
          <div style={{ marginTop: 8, textAlign: 'right', borderTop: '1px solid #f0f0f0', paddingTop: 8 }}>
            {customer && (
              <div style={{ marginBottom: 4, fontSize: 13 }}>
                <Text type="secondary">Số dư: </Text>
                <Text strong style={{ color: balance > 0 ? '#52c41a' : '#ff4d4f' }}>{formatMoney(balance)}</Text>
                <Text type="secondary"> → </Text>
                <Text strong style={{ color: balance - total >= 0 ? '#52c41a' : '#ff4d4f' }}>{formatMoney(balance - total)}</Text>
              </div>
            )}
            <Title level={5} style={{ margin: 0 }}>Tổng: {total.toLocaleString('vi-VN')}₫</Title>
            {insufficient && customer && (
              <Alert
                type="error"
                message={`Số dư không đủ. Cần thêm ${formatMoney(total - balance)}`}
                style={{ marginTop: 4, textAlign: 'left' }}
                banner
              />
            )}
            <Button
              type="primary"
              size="middle"
              disabled={cart.length === 0 || !customer || insufficient}
              onClick={() => setPayOpen(true)}
              style={{ marginTop: 8 }}
            >
              Thanh toán
            </Button>
          </div>
        </Card>
      </Col>

      <Col span={6}>
        <Card title="Đơn hôm nay" size="small" styles={{ body: { padding: 8, maxHeight: 'calc(100vh - 180px)', overflow: 'auto' }}}>
          {!todayOrders || todayOrders.length === 0 ? (
            <Empty description="Chưa có đơn hàng" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ) : (
            <List
              size="small"
              dataSource={todayOrders}
              renderItem={(order: Order) => (
                <List.Item style={{ padding: '4px 0' }}>
                  <List.Item.Meta
                    title={
                      <Text strong style={{ fontSize: 13 }}>
                        {order.code}
                      </Text>
                    }
                    description={
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {order.customer ? order.customer.fullName : '—'} · {new Date(order.createdAt).toLocaleTimeString('vi-VN')}
                      </Text>
                    }
                  />
                  <Text strong>{Number(order.totalComputed).toLocaleString('vi-VN')}₫</Text>
                </List.Item>
              )}
            />
          )}
        </Card>
      </Col>

      <Modal
        title="Xác nhận thanh toán"
        open={payOpen}
        onCancel={() => setPayOpen(false)}
        onOk={handlePay}
        okText="Xác nhận"
        cancelText="Hủy"
        confirmLoading={createOrder.isPending}
        width={380}
      >
        <div style={{ textAlign: 'center', padding: '8px 0' }}>
          <Text type="secondary">Người mua</Text>
          <Title level={5} style={{ margin: '4px 0 12px' }}>{customer?.fullName}</Title>
          <Statistic
            title="Tổng tiền"
            value={total}
            formatter={(v) => formatMoney(v as number)}
            valueStyle={{ fontSize: 24, color: '#1677ff' }}
          />
          <div style={{ marginTop: 8, fontSize: 14 }}>
            <Text type="secondary">Số dư trước: </Text>
            <Text>{formatMoney(balance)}</Text>
            <br />
            <Text type="secondary">Số dư sau: </Text>
            <Text strong style={{ color: balance - total >= 0 ? '#52c41a' : '#ff4d4f' }}>
              {formatMoney(balance - total)}
            </Text>
          </div>
        </div>
      </Modal>

      {/* Modal hiển thị hóa đơn + nút in */}
      <Modal
        title="Hóa đơn"
        open={!!receiptOrder}
        onCancel={() => setReceiptOrder(null)}
        footer={[
          <Button key="close" onClick={() => setReceiptOrder(null)}>Đóng</Button>,
          <Button key="print" type="primary" icon={<PrinterOutlined />} onClick={() => window.print()}>
            In hóa đơn
          </Button>,
        ]}
        width={360}
      >
        {receiptOrder && <Receipt ref={receiptRef} order={receiptOrder} />}
      </Modal>
    </Row>
  );
}