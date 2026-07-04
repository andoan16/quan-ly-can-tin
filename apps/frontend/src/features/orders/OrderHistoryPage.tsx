import { getApiErrorMessage } from '@/api/client';
import { useState } from 'react';
import { Card, Table, Tag, Space, DatePicker, Button, Drawer, Descriptions, Typography, Input, Select, Modal, message, Popconfirm } from 'antd';
import type { ChangeEvent } from 'react';
import { EyeOutlined, HistoryOutlined, SearchOutlined, StopOutlined, ReloadOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { orderApi } from '@/api/endpoints';
import type { Order, OrderItem } from '@/api/endpoints';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;
const { Text } = Typography;

function formatMoney(v: number) {
  return Number(v).toLocaleString('vi-VN') + '₫';
}

export default function OrderHistoryPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);
  const [drawerOrder, setDrawerOrder] = useState<Order | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [cancelOrder, setCancelOrder] = useState<Order | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const pageSize = 20;

  const { data, isLoading } = useQuery({
    queryKey: ['orders', dateRange, page, search, statusFilter],
    queryFn: () =>
      orderApi
        .list({
          page,
          size: pageSize,
          from: dateRange?.[0]?.format('YYYY-MM-DD'),
          to: dateRange?.[1]?.format('YYYY-MM-DD'),
          search: search || undefined,
          status: statusFilter,
        })
        .then((r) => r.data.data),
  });

  const cancelMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => orderApi.cancel(id, reason),
    onSuccess: () => {
      message.success('Đã hủy đơn hàng và hoàn tiền cho khách');
      setCancelOrder(null);
      setCancelReason('');
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['orders-today'] });
    },
    onError: (err: unknown) => {
            message.error(getApiErrorMessage(err, 'Hủy đơn thất bại'));
    },
  });

  const columns = [
    {
      title: '#',
      width: 50,
      render: (_: unknown, __: unknown, idx: number) => (page - 1) * pageSize + idx + 1,
    },
    {
      title: 'Mã đơn',
      dataIndex: 'code',
      width: 180,
      render: (v: string) => <span style={{ fontWeight: 600 }}>{v}</span>,
    },
    {
      title: 'Thời gian',
      dataIndex: 'createdAt',
      width: 160,
      render: (v: string) => dayjs(v).format('DD/MM/YYYY HH:mm'),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      width: 110,
      render: (v: string) =>
        v === 'CANCELLED' ? (
          <Tag color="red">Đã hủy</Tag>
        ) : (
          <Tag color="green">Hoàn thành</Tag>
        ),
    },
    {
      title: 'Khách hàng',
      width: 160,
      render: (_: unknown, row: Order) => row.customer?.fullName ?? 'Khách lẻ',
    },
    {
      title: 'Thu ngân',
      width: 140,
      render: (_: unknown, row: Order) => row.cashier?.fullName ?? '—',
    },
    {
      title: 'Số dư trước',
      dataIndex: 'balanceBefore',
      width: 120,
      align: 'right' as const,
      render: (v: number | null | undefined) => v != null ? formatMoney(Number(v)) : '—',
    },
    {
      title: 'Số dư sau',
      dataIndex: 'balanceAfter',
      width: 120,
      align: 'right' as const,
      render: (v: number | null | undefined) => v != null ? (
        <span style={{ fontWeight: 600, color: Number(v) > 0 ? '#52c41a' : '#ff4d4f' }}>{formatMoney(Number(v))}</span>
      ) : '—',
    },
    {
      title: 'Số mặt hàng',
      width: 100,
      align: 'right' as const,
      render: (_: unknown, row: Order) => row.items?.length ?? 0,
    },
    {
      title: 'Tổng tiền',
      dataIndex: 'totalComputed',
      width: 140,
      align: 'right' as const,
      render: (v: number, row: Order) => (
        <span style={{ fontWeight: 600, color: row.status === 'CANCELLED' ? '#999' : '#1677ff', textDecoration: row.status === 'CANCELLED' ? 'line-through' : 'none' }}>
          {formatMoney(Number(v))}
        </span>
      ),
    },
    {
      title: '',
      width: 90,
      render: (_: unknown, row: Order) => (
        <Space size="small">
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => setDrawerOrder(row)}
          />
          {row.status === 'COMPLETED' && (
            <Popconfirm
              title="Hủy đơn này?"
              description="Sẽ hoàn tiền cho khách và hoàn lại tồn kho"
              onConfirm={() => { setCancelOrder(row); setCancelReason(''); }}
              okText="Hủy đơn"
              cancelText="Đóng"
              okButtonProps={{ danger: true }}
            >
              <Button size="small" danger icon={<StopOutlined />} />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  const itemColumns = [
    {
      title: 'Mã SP',
      dataIndex: ['product', 'code'],
      width: 120,
    },
    {
      title: 'Tên sản phẩm',
      dataIndex: ['product', 'name'],
      ellipsis: true,
    },
    {
      title: 'SL',
      dataIndex: 'quantity',
      width: 70,
      align: 'right' as const,
      render: (v: number) => Number(v).toLocaleString('vi-VN'),
    },
    {
      title: 'Đơn giá',
      dataIndex: 'unitPrice',
      width: 120,
      align: 'right' as const,
      render: (v: number) => formatMoney(Number(v)),
    },
    {
      title: 'Thành tiền',
      width: 140,
      align: 'right' as const,
      render: (_: unknown, item: OrderItem) => formatMoney(Number(item.quantity) * Number(item.unitPrice)),
    },
  ];

  return (
    <div style={{ padding: 0 }}>
      <Card
        size="small"
        style={{ marginBottom: 12 }}
        styles={{ body: { padding: '8px 12px' } }}
      >
        <Space wrap>
          <RangePicker
            size="small"
            format="DD/MM/YYYY"
            placeholder={['Từ ngày', 'Đến ngày']}
            onChange={(dates) => {
              setDateRange(dates as [dayjs.Dayjs | null, dayjs.Dayjs | null] | null);
              setPage(1);
            }}
            allowClear
          />
          <Input
            size="small"
            placeholder="Tìm theo mã đơn hoặc tên khách"
            allowClear
            prefix={<SearchOutlined />}
            style={{ width: 220 }}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
          <Select
            size="small"
            placeholder="Trạng thái"
            allowClear
            style={{ width: 140 }}
            value={statusFilter}
            onChange={(v) => { setStatusFilter(v); setPage(1); }}
            options={[
              { value: 'COMPLETED', label: 'Hoàn thành' },
              { value: 'CANCELLED', label: 'Đã hủy' },
            ]}
          />
          <span style={{ color: '#888', fontSize: 13 }}>
            <HistoryOutlined /> Tổng {data?.total ?? 0} đơn hàng
          </span>
          <Button size="small" icon={<ReloadOutlined />} onClick={() => queryClient.invalidateQueries({ queryKey: ['orders'] })}>Làm mới</Button>
        </Space>
      </Card>

      <Card size="small" styles={{ body: { padding: 0 } }}>
        <Table<Order>
          size="small"
          rowKey="id"
          dataSource={data?.items ?? []}
          loading={isLoading}
          pagination={{
            current: page,
            pageSize,
            total: data?.total ?? 0,
            onChange: (p) => setPage(p),
            showSizeChanger: false,
            showTotal: (total) => `${total} đơn hàng`,
            size: 'small',
          }}
          columns={columns}
          scroll={{ x: 1200 }}
        />
      </Card>

      <Drawer
        title={drawerOrder ? `Chi tiết đơn ${drawerOrder.code}` : ''}
        open={!!drawerOrder}
        onClose={() => setDrawerOrder(null)}
        width={640}
      >
        {drawerOrder && (
          <>
            <Descriptions size="small" column={2} bordered style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Mã đơn" span={2}>
                <Text strong>{drawerOrder.code}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Thời gian">
                {dayjs(drawerOrder.createdAt).format('DD/MM/YYYY HH:mm:ss')}
              </Descriptions.Item>
              <Descriptions.Item label="Trạng thái">
                {drawerOrder.status === 'CANCELLED' ? (
                  <Tag color="red">Đã hủy</Tag>
                ) : (
                  <Tag color="green">Hoàn thành</Tag>
                )}
              </Descriptions.Item>
              <Descriptions.Item label="Thu ngân">
                {drawerOrder.cashier?.fullName ?? '—'}
              </Descriptions.Item>
              <Descriptions.Item label="Khách hàng">
                {drawerOrder.customer?.fullName ?? '—'}
              </Descriptions.Item>
              <Descriptions.Item label="Số dư trước">
                {drawerOrder.balanceBefore != null ? formatMoney(Number(drawerOrder.balanceBefore)) : '—'}
              </Descriptions.Item>
              <Descriptions.Item label="Số dư sau">
                {drawerOrder.balanceAfter != null ? (
                  <span style={{ fontWeight: 600, color: Number(drawerOrder.balanceAfter) > 0 ? '#52c41a' : '#ff4d4f' }}>
                    {formatMoney(Number(drawerOrder.balanceAfter))}
                  </span>
                ) : '—'}
              </Descriptions.Item>
              {drawerOrder.status === 'CANCELLED' && drawerOrder.cancelReason && (
                <Descriptions.Item label="Lý do hủy" span={2}>
                  <Text type="danger">{drawerOrder.cancelReason}</Text>
                </Descriptions.Item>
              )}
              {drawerOrder.note && (
                <Descriptions.Item label="Ghi chú" span={2}>
                  {drawerOrder.note}
                </Descriptions.Item>
              )}
            </Descriptions>

            <Table<OrderItem>
              size="small"
              rowKey="id"
              dataSource={drawerOrder.items ?? []}
              pagination={false}
              columns={itemColumns}
              scroll={{ x: 500 }}
              summary={(rows) => {
                const total = rows.reduce(
                  (s, r) => s + Number(r.quantity) * Number(r.unitPrice),
                  0,
                );
                return (
                  <Table.Summary.Row>
                    <Table.Summary.Cell index={0} colSpan={4}>
                      <Text strong>Tổng cộng</Text>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={1} align="right">
                      <Text strong style={{ color: '#1677ff' }}>
                        {formatMoney(total)}
                      </Text>
                    </Table.Summary.Cell>
                  </Table.Summary.Row>
                );
              }}
            />
          </>
        )}
      </Drawer>

      {/* Modal xác nhận hủy đơn */}
      <Modal
        title={`Hủy đơn ${cancelOrder?.code ?? ''}`}
        open={!!cancelOrder}
        onCancel={() => { setCancelOrder(null); setCancelReason(''); }}
        onOk={() => {
          if (cancelOrder && cancelReason.trim()) {
            cancelMutation.mutate({ id: cancelOrder.id, reason: cancelReason.trim() });
          }
        }}
        okText="Xác nhận hủy"
        cancelText="Đóng"
        okButtonProps={{ danger: true, disabled: !cancelReason.trim() }}
        confirmLoading={cancelMutation.isPending}
        width={420}
      >
        {cancelOrder && (
          <>
            <Descriptions size="small" column={1} style={{ marginBottom: 12 }}>
              <Descriptions.Item label="Khách hàng">{cancelOrder.customer?.fullName ?? '—'}</Descriptions.Item>
              <Descriptions.Item label="Tổng tiền">
                <Text strong style={{ color: '#ff4d4f' }}>{formatMoney(Number(cancelOrder.totalComputed))}</Text>
                <Text type="secondary"> sẽ được hoàn lại cho khách</Text>
              </Descriptions.Item>
            </Descriptions>
            <Text style={{ display: 'block', marginBottom: 6 }}>Lý do hủy đơn <span style={{ color: '#ff4d4f' }}>*</span></Text>
            <Input.TextArea
              placeholder="VD: Bán nhầm sản phẩm, khách đổi ý..."
              value={cancelReason}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setCancelReason(e.target.value)}
              rows={3}
              maxLength={500}
            />
          </>
        )}
      </Modal>
    </div>
  );
}