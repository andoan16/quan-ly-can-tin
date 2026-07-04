import { getApiErrorMessage } from '@/api/client';
import { useState } from 'react';
import { Card, Button, Input, Table, Tag, Space, message, Popconfirm, Modal, Typography, InputNumber } from 'antd';
import { PlusOutlined, CheckOutlined, DeleteOutlined, EyeOutlined, ReloadOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { stockCountApi } from '@/api/endpoints';
import type { StockCountItem, StockCount } from '@/api/endpoints';
import dayjs from 'dayjs';

const { Text } = Typography;

export default function StockCountTab() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [detail, setDetail] = useState<StockCount & { items: StockCountItem[] } | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [note, setNote] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['stock-counts', page],
    queryFn: () => stockCountApi.list({ page, size: pageSize }).then((r) => r.data.data),
  });

  const { data: detailData } = useQuery({
    queryKey: ['stock-count-detail', detail?.id],
    queryFn: () => stockCountApi.get(detail!.id).then((r) => r.data.data),
    enabled: !!detail?.id,
  });

  const createMutation = useMutation({
    mutationFn: () => stockCountApi.create({ note: note.trim() || undefined }),
    onSuccess: (resp) => {
      message.success('Đã tạo phiên kiểm kê');
      setCreateOpen(false);
      setNote('');
      queryClient.invalidateQueries({ queryKey: ['stock-counts'] });
      setDetail({ ...resp.data.data, items: [] } as StockCount & { items: StockCountItem[] });
    },
    onError: () => message.error('Tạo phiên kiểm kê thất bại'),
  });

  const updateItemMutation = useMutation({
    mutationFn: ({ stockCountId, itemId, actualQty }: { stockCountId: string; itemId: string; actualQty: number }) =>
      stockCountApi.updateItem(stockCountId, itemId, actualQty),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-count-detail', detail?.id] });
    },
  });

  const finalizeMutation = useMutation({
    mutationFn: (id: string) => stockCountApi.finalize(id),
    onSuccess: () => {
      message.success('Đã hoàn tất kiểm kê và cập nhật tồn kho');
      queryClient.invalidateQueries({ queryKey: ['stock-counts'] });
      queryClient.invalidateQueries({ queryKey: ['stock-count-detail', detail?.id] });
      queryClient.invalidateQueries({ queryKey: ['products-all'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-transactions'] });
      setDetail(null);
    },
    onError: (err: unknown) => {
            message.error(getApiErrorMessage(err, 'Hoàn tất kiểm kê thất bại'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => stockCountApi.delete(id),
    onSuccess: () => {
      message.success('Đã xóa phiên kiểm kê');
      queryClient.invalidateQueries({ queryKey: ['stock-counts'] });
    },
  });

  const isFinalized = !!detailData?.countedAt;

  const columns = [
    {
      title: '#',
      width: 50,
      render: (_: unknown, __: unknown, idx: number) => (page - 1) * pageSize + idx + 1,
    },
    {
      title: 'Mã kiểm kê',
      dataIndex: 'code',
      width: 180,
      render: (v: string) => <Text strong>{v}</Text>,
    },
    {
      title: 'Thời gian',
      dataIndex: 'createdAt',
      width: 160,
      render: (v: string) => dayjs(v).format('DD/MM/YYYY HH:mm'),
    },
    {
      title: 'Trạng thái',
      width: 120,
      render: (_: unknown, row: StockCount) =>
        row.countedAt ? <Tag color="green">Đã hoàn thành</Tag> : <Tag color="orange">Đang kiểm kê</Tag>,
    },
    {
      title: 'Số SP',
      width: 80,
      align: 'right' as const,
      render: (_: unknown, row: StockCount & { _count?: { items: number } }) => row._count?.items ?? 0,
    },
    {
      title: 'Người tạo',
      width: 140,
      render: (_: unknown, row: StockCount & { createdByUser?: { fullName: string } }) => row.createdByUser?.fullName ?? '—',
    },
    {
      title: '',
      width: 90,
      render: (_: unknown, row: StockCount) => (
        <Space size="small">
          <Button size="small" icon={<EyeOutlined />} onClick={() => setDetail(row as StockCount & { items: StockCountItem[] })} />
          {!row.countedAt && (
            <Popconfirm title="Xóa phiên kiểm kê này?" onConfirm={() => deleteMutation.mutate(row.id)}>
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  const itemColumns = [
    {
      title: 'Mã SP',
      width: 100,
      dataIndex: ['product', 'code'],
    },
    {
      title: 'Tên sản phẩm',
      ellipsis: true,
      dataIndex: ['product', 'name'],
    },
    {
      title: 'Tồn hệ thống',
      dataIndex: 'expectedQty',
      width: 120,
      align: 'right' as const,
      render: (v: number) => Number(v).toLocaleString('vi-VN'),
    },
    {
      title: 'Tồn thực tế',
      dataIndex: 'actualQty',
      width: 140,
      align: 'right' as const,
      render: (v: number, item: StockCountItem) => {
        if (isFinalized) return <span>{Number(v).toLocaleString('vi-VN')}</span>;
        return (
          <InputNumber
            size="small"
            value={Number(v)}
            min={0}
            style={{ width: 100 }}
            onChange={(val) => {
              if (val != null && detail) {
                updateItemMutation.mutate({
                  stockCountId: detail.id,
                  itemId: item.id,
                  actualQty: val,
                });
              }
            }}
          />
        );
      },
    },
    {
      title: 'Chênh lệch',
      dataIndex: 'difference',
      width: 120,
      align: 'right' as const,
      render: (v: number) => {
        const diff = Number(v);
        if (Math.abs(diff) < 0.001) return <span style={{ color: '#52c41a' }}>0</span>;
        return (
          <span style={{ color: diff > 0 ? '#52c41a' : '#ff4d4f', fontWeight: 600 }}>
            {diff > 0 ? '+' : ''}{diff.toLocaleString('vi-VN')}
          </span>
        );
      },
    },
  ];

  const summary = detailData?.items?.reduce(
    (acc, item) => {
      const diff = Number(item.difference);
      if (Math.abs(diff) >= 0.001) acc.adjusted++;
      return acc;
    },
    { adjusted: 0 },
  ) ?? { adjusted: 0 };

  return (
    <>
      <Card
        title="Kiểm kê tồn kho"
        size="small"
        styles={{ body: { padding: 8 } }}
        extra={<><Button size="small" icon={<ReloadOutlined />} onClick={() => queryClient.invalidateQueries({ queryKey: ['stock-counts'] })}>Làm mới</Button><Button size="small" type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>Tạo phiên kiểm kê</Button></>}
      >
        <Table
          size="small"
          rowKey="id"
          dataSource={data?.items ?? []}
          loading={isLoading}
          pagination={{
            current: page,
            pageSize,
            total: data?.total ?? 0,
            onChange: setPage,
            showSizeChanger: false,
            size: 'small',
          }}
          columns={columns}
        />
      </Card>

      <Modal
        title="Chi tiết phiên kiểm kê"
        open={!!detail}
        onCancel={() => setDetail(null)}
        width={800}
        footer={
          detail && !isFinalized ? (
            <Space>
              <Button onClick={() => setDetail(null)}>Đóng</Button>
              <Popconfirm
                title="Hoàn tất kiểm kê?"
                description={`Sẽ cập nhật tồn kho cho ${summary.adjusted} sản phẩm có chênh lệch`}
                onConfirm={() => detail && finalizeMutation.mutate(detail.id)}
              >
                <Button type="primary" icon={<CheckOutlined />} loading={finalizeMutation.isPending}>
                  Hoàn tất kiểm kê
                </Button>
              </Popconfirm>
            </Space>
          ) : (
            <Button onClick={() => setDetail(null)}>Đóng</Button>
          )
        }
      >
        {detailData && (
          <>
            <Space style={{ marginBottom: 12 }}>
              <Text strong>{detailData.code}</Text>
              {detailData.countedAt ? <Tag color="green">Đã hoàn thành</Tag> : <Tag color="orange">Đang kiểm kê</Tag>}
              {detailData.note && <Text type="secondary">{detailData.note}</Text>}
            </Space>
            <Table
              size="small"
              rowKey="id"
              dataSource={detailData.items ?? []}
              pagination={false}
              scroll={{ y: 400 }}
              columns={itemColumns}
            />
          </>
        )}
      </Modal>

      <Modal
        title="Tạo phiên kiểm kê mới"
        open={createOpen}
        onCancel={() => { setCreateOpen(false); setNote(''); }}
        onOk={() => createMutation.mutate()}
        okText="Tạo"
        cancelText="Hủy"
        confirmLoading={createMutation.isPending}
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
          Hệ thống sẽ tạo phiên kiểm kê với tất cả sản phẩm đang hoạt động. Tồn kho hiện tại sẽ được ghi nhận là "Tồn hệ thống", bạn chỉ cần nhập "Tồn thực tế" sau khi đếm.
        </Text>
        <Input.TextArea
          placeholder="Ghi chú (tùy chọn)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
        />
      </Modal>
    </>
  );
}