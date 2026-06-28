import { useState } from 'react';
import { Row, Col, Card, Input, Button, List, Typography, Tag, Modal, message, Empty } from 'antd';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { productApi, customerApi, orderApi } from '@/api/endpoints';
import type { Order, Product, Customer } from '@/api/endpoints';
import { usePosStore } from '@/stores/posStore';

const { Text, Title } = Typography;

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function PosPage() {
  const { customer, cart, addItem, updateQty, removeItem, clearCart, setCustomer } = usePosStore();
  const [productSearch, setProductSearch] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [payOpen, setPayOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: products } = useQuery({
    queryKey: ['products-pos', productSearch],
    queryFn: () => productApi.list({ search: productSearch, size: 10 }).then((r) => r.data.data.items),
    enabled: productSearch.length > 0,
  });

  const { data: customers } = useQuery({
    queryKey: ['customers-pos', customerSearch],
    queryFn: () => customerApi.list({ search: customerSearch, size: 10 }).then((r) => r.data.data.items),
    enabled: customerSearch.length > 0,
  });

  // Fetch today's orders
  const { data: todayOrders } = useQuery({
    queryKey: ['orders-today'],
    queryFn: () => {
      const today = todayISO();
      return orderApi.list({ page: 1, size: 50, from: today, to: today + 'T23:59:59' }).then((r) => r.data.data.items);
    },
    refetchInterval: 30_000, // auto-refresh every 30s
  });

  const createOrder = useMutation({
    mutationFn: orderApi.create,
    onSuccess: () => {
      message.success('Thanh toán thành công');
      clearCart();
      setPayOpen(false);
      queryClient.invalidateQueries({ queryKey: ['orders-today'] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Thanh toán thất bại';
      message.error(msg);
    },
  });

  const total = cart.reduce((sum, i) => sum + i.price * i.quantity, 0);

  const handlePay = (method: 'CASH' | 'TRANSFER' | 'CARD') => {
    createOrder.mutate({
      customerId: customer?.id,
      paymentMethod: method,
      items: cart.map((i) => ({ productId: i.productId, quantity: i.quantity })),
    });
  };

  const paymentMethodLabel: Record<string, string> = {
    CASH: 'Tiền mặt',
    TRANSFER: 'Chuyển khoản',
    CARD: 'Thẻ',
  };

  return (
    <Row gutter={[8, 8]} style={{ height: '100%' }}>
      <Col span={8}>
        <Card title="Tìm kiếm" size="small" styles={{ body: { padding: 8 }}}>
          <Input.Search
            placeholder="Tìm người mua"
            allowClear
            size="small"
            onSearch={setCustomerSearch}
          />
          {customer ? (
            <Tag color="blue" closable onClose={() => setCustomer(null)} style={{ marginTop: 8 }}>{customer.fullName}</Tag>
          ) : (
            <List
              size="small"
              dataSource={customers || []}
              renderItem={(c: Customer) => (
                <List.Item
                  actions={[
                    <Button type="link" size="small" onClick={() => setCustomer({ id: c.id, fullName: c.fullName })}>Chọn</Button>,
                  ]}
                >
                  {c.fullName} — {c.phone}
                </List.Item>
              )}
            />
          )}
          <Input.Search
            placeholder="Tìm sản phẩm (tên/mã)"
            allowClear
            size="small"
            onSearch={setProductSearch}
            style={{ marginTop: 8 }}
          />
          <List
            size="small"
            dataSource={products || []}
            renderItem={(p: Product) => (
              <List.Item
                actions={[
                  <Button type="link" size="small" onClick={() => addItem({ productId: p.id, name: p.name, price: Number(p.sellingPrice) })}>Thêm</Button>,
                ]}
              >
                {p.name} — {Number(p.sellingPrice).toLocaleString('vi-VN')}₫{p.unit ? ` / ${p.unit.name}` : ''}
              </List.Item>
            )}
          />
        </Card>
      </Col>

      <Col span={10}>
        <Card title="Giỏ hàng" size="small" styles={{ body: { padding: 8, display: 'flex', flexDirection: 'column', height: 'calc(100vh - 180px)' }}}>
          <List
            size="small"
            dataSource={cart}
            style={{ flex: 1, overflow: 'auto' }}
            renderItem={(item) => (
              <List.Item
                actions={[
                  <Button size="small" onClick={() => updateQty(item.productId, item.quantity - 1)}>-</Button>,
                  <Text>{item.quantity}</Text>,
                  <Button size="small" onClick={() => updateQty(item.productId, item.quantity + 1)}>+</Button>,
                  <Button type="text" danger size="small" onClick={() => removeItem(item.productId)}>Xóa</Button>,
                ]}
              >
                <List.Item.Meta
                  title={item.name}
                  description={`${item.price.toLocaleString('vi-VN')}₫ x ${item.quantity}`}
                />
                <Text strong>{(item.price * item.quantity).toLocaleString('vi-VN')}₫</Text>
              </List.Item>
            )}
          />
          <div style={{ marginTop: 8, textAlign: 'right', borderTop: '1px solid #f0f0f0', paddingTop: 8 }}>
            <Title level={5} style={{ margin: 0 }}>Tổng: {total.toLocaleString('vi-VN')}₫</Title>
            <Button
              type="primary"
              size="middle"
              disabled={cart.length === 0}
              onClick={() => setPayOpen(true)}
              style={{ marginTop: 8 }}
            >
              Thanh toán
            </Button>
          </div>
        </Card>
      </Col>

      <Col span={6}>
        <Card title="Lịch sử đơn hôm nay" size="small" styles={{ body: { padding: 8, maxHeight: 'calc(100vh - 180px)', overflow: 'auto' }}}>
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
                        {order.code}{' '}
                        <Tag color={order.paymentMethod === 'CASH' ? 'green' : order.paymentMethod === 'TRANSFER' ? 'blue' : 'orange'} style={{ fontSize: 11 }}>
                          {paymentMethodLabel[order.paymentMethod] || order.paymentMethod}
                        </Tag>
                      </Text>
                    }
                    description={
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {order.customer ? order.customer.fullName : 'Khách lẻ'} · {new Date(order.createdAt).toLocaleTimeString('vi-VN')}
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
        title="Thanh toán"
        open={payOpen}
        onCancel={() => setPayOpen(false)}
        footer={null}
        width={360}
      >
        <div style={{ textAlign: 'center' }}>
          <Title level={4}>{total.toLocaleString('vi-VN')}₫</Title>
          <Button block type="primary" size="large" style={{ marginBottom: 8 }} onClick={() => handlePay('CASH')}>Tiền mặt</Button>
          <Button block size="large" style={{ marginBottom: 8 }} onClick={() => handlePay('TRANSFER')}>Chuyển khoản</Button>
          <Button block size="large" onClick={() => handlePay('CARD')}>Thẻ</Button>
        </div>
      </Modal>
    </Row>
  );
}