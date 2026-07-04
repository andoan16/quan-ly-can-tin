import { getApiErrorMessage } from '@/api/client';
import { useState } from 'react';
import { Card, Row, Col, DatePicker, Select, Table, Statistic, Tag, Space, Typography, Button, Modal, Input, message, Popconfirm, Drawer, List } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined, DollarOutlined, ShoppingCartOutlined, BarChartOutlined, ShopOutlined, SaveOutlined, HistoryOutlined, DeleteOutlined, EyeOutlined, ReloadOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { reportApi, categoryApi } from '@/api/endpoints';
import type { ProductSalesRow, SavedReport } from '@/api/endpoints';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;
const { Title } = Typography;

const SORT_OPTIONS = [
  { value: 'revenue', label: 'Doanh thu' },
  { value: 'profit', label: 'Lợi nhuận' },
  { value: 'quantity', label: 'Số lượng bán' },
  { value: 'productName', label: 'Tên sản phẩm' },
];

function formatMoney(v: number) {
  return v.toLocaleString('vi-VN') + '₫';
}

export default function ProductSalesTab() {
  const queryClient = useQueryClient();
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);
  const [categoryId, setCategoryId] = useState<string | undefined>(undefined);
  const [sortBy, setSortBy] = useState<'revenue' | 'quantity' | 'profit' | 'productName'>('revenue');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [reportName, setReportName] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [viewingReport, setViewingReport] = useState<SavedReport | null>(null);

  const { data: categories } = useQuery({
    queryKey: ['categories-report'],
    queryFn: () => categoryApi.list().then((r) => r.data.data),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['product-sales', dateRange, categoryId, sortBy, sortDir, page],
    queryFn: () =>
      reportApi
        .productSales({
          from: dateRange?.[0]?.format('YYYY-MM-DD'),
          to: dateRange?.[1]?.format('YYYY-MM-DD'),
          categoryId,
          sortBy,
          sortDir,
          page,
          size: pageSize,
        })
        .then((r) => r.data.data),
  });

  const { data: savedReportsData, isLoading: savedLoading } = useQuery({
    queryKey: ['saved-reports'],
    queryFn: () => reportApi.listReports({ page: 1, size: 50 }).then((r) => r.data.data),
    enabled: drawerOpen,
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      reportApi.saveReport({
        name: reportName.trim(),
        from: dateRange?.[0]?.format('YYYY-MM-DD') || undefined,
        to: dateRange?.[1]?.format('YYYY-MM-DD') || undefined,
        categoryId: categoryId || undefined,
      }),
    onSuccess: () => {
      message.success('Đã lưu báo cáo');
      setSaveModalOpen(false);
      setReportName('');
      queryClient.invalidateQueries({ queryKey: ['saved-reports'] });
    },
    onError: (err: unknown) => {
            message.error(getApiErrorMessage(err, 'Lưu báo cáo thất bại'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => reportApi.deleteReport(id),
    onSuccess: (_data, deletedId: string) => {
      message.success('Đã xóa báo cáo');
      queryClient.invalidateQueries({ queryKey: ['saved-reports'] });
      if (viewingReport?.id === deletedId) setViewingReport(null);
    },
    onError: (err: unknown) => {
            message.error(getApiErrorMessage(err, 'Xóa thất bại'));
    },
  });

  const summary = data?.summary;

  const columns = [
    {
      title: '#',
      width: 50,
      render: (_: unknown, __: unknown, idx: number) => (page - 1) * pageSize + idx + 1,
    },
    { title: 'Mã SP', dataIndex: 'productCode', width: 100 },
    { title: 'Tên sản phẩm', dataIndex: 'productName', ellipsis: true },
    { title: 'Danh mục', dataIndex: 'categoryName', width: 120, render: (v: string | null) => v ?? '—' },
    { title: 'Đơn vị', dataIndex: 'unitName', width: 80, render: (v: string | null) => v ?? '—' },
    { title: 'Số lượng', dataIndex: 'totalQuantity', width: 100, align: 'right' as const, render: (v: number) => v.toLocaleString('vi-VN'), sorter: true },
    { title: 'Doanh thu', dataIndex: 'totalRevenue', width: 140, align: 'right' as const, render: (v: number) => formatMoney(v), sorter: true },
    { title: 'Giá vốn', dataIndex: 'totalCost', width: 130, align: 'right' as const, render: (v: number) => formatMoney(v) },
    {
      title: 'Lợi nhuận', dataIndex: 'totalProfit', width: 140, align: 'right' as const, sorter: true,
      render: (v: number) => <span style={{ color: v >= 0 ? '#52c41a' : '#ff4d4f', fontWeight: 600 }}>{formatMoney(v)}</span>,
    },
    {
      title: 'Biên LN', dataIndex: 'profitMargin', width: 100, align: 'right' as const,
      render: (v: number) => { const color = v >= 30 ? 'green' : v >= 15 ? 'orange' : 'red'; return <Tag color={color}>{v.toFixed(1)}%</Tag>; },
    },
    { title: 'Số đơn', dataIndex: 'orderCount', width: 80, align: 'right' as const },
  ];

  return (
    <div style={{ padding: 0 }}>
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col span={6}><Card size="small" styles={{ body: { padding: '12px 16px' } }}><Statistic title="Tổng doanh thu" value={summary?.totalRevenue ?? 0} formatter={(v) => formatMoney(v as number)} prefix={<DollarOutlined />} valueStyle={{ fontSize: 18, color: '#1677ff' }} /></Card></Col>
        <Col span={6}><Card size="small" styles={{ body: { padding: '12px 16px' } }}><Statistic title="Tổng lợi nhuận" value={summary?.totalProfit ?? 0} formatter={(v) => formatMoney(v as number)} prefix={summary && summary.totalProfit >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />} valueStyle={{ fontSize: 18, color: summary && summary.totalProfit >= 0 ? '#52c41a' : '#ff4d4f' }} /></Card></Col>
        <Col span={6}><Card size="small" styles={{ body: { padding: '12px 16px' } }}><Statistic title="Tổng số lượng bán" value={summary?.totalQuantity ?? 0} prefix={<ShoppingCartOutlined />} valueStyle={{ fontSize: 18 }} /></Card></Col>
        <Col span={6}><Card size="small" styles={{ body: { padding: '12px 16px' } }}><Statistic title="Số đơn hàng" value={summary?.totalOrders ?? 0} suffix={`/ ${summary?.productCount ?? 0} SP`} prefix={<ShopOutlined />} valueStyle={{ fontSize: 18 }} /></Card></Col>
      </Row>

      <Card size="small" style={{ marginBottom: 12 }} styles={{ body: { padding: '8px 12px' } }}>
        <Space wrap size="middle">
          <RangePicker size="small" format="DD/MM/YYYY" placeholder={['Từ ngày', 'Đến ngày']} onChange={(dates) => { setDateRange(dates as [dayjs.Dayjs | null, dayjs.Dayjs | null] | null); setPage(1); }} allowClear />
          <Select size="small" placeholder="Tất cả danh mục" allowClear style={{ width: 180 }} value={categoryId} onChange={(v) => { setCategoryId(v); setPage(1); }} options={categories?.map((c: { id: string; name: string }) => ({ value: c.id, label: c.name }))} />
          <Select size="small" style={{ width: 130 }} value={sortBy} onChange={(v) => { setSortBy(v); setPage(1); }} options={SORT_OPTIONS} />
          <Select size="small" style={{ width: 100 }} value={sortDir} onChange={(v) => { setSortDir(v); setPage(1); }} options={[{ value: 'desc', label: 'Giảm dần ↓' }, { value: 'asc', label: 'Tăng dần ↑' }]} />
          <Button size="small" icon={<SaveOutlined />} type="primary" onClick={() => setSaveModalOpen(true)}>Lưu báo cáo</Button>
          <Button size="small" icon={<HistoryOutlined />} onClick={() => setDrawerOpen(true)}>Đã lưu</Button>
          <Button size="small" icon={<ReloadOutlined />} onClick={() => queryClient.invalidateQueries({ queryKey: ['product-sales'] })}>Làm mới</Button>
        </Space>
      </Card>

      <Card size="small" title={<span><BarChartOutlined /> Hiệu suất bán hàng theo sản phẩm</span>} styles={{ body: { padding: 0 } }}>
        <Table<ProductSalesRow> size="small" rowKey="productId" dataSource={data?.items ?? []} loading={isLoading}
          pagination={{ current: page, pageSize, total: data?.total ?? 0, onChange: (p) => setPage(p), showSizeChanger: false, showTotal: (total) => `${total} sản phẩm`, size: 'small' }}
          columns={columns} scroll={{ x: 1100 }} />
      </Card>

      <Modal title="Lưu báo cáo" open={saveModalOpen} onOk={() => { if (reportName.trim()) saveMutation.mutate(); }} onCancel={() => { setSaveModalOpen(false); setReportName(''); }} okText="Lưu" cancelText="Hủy" confirmLoading={saveMutation.isPending}>
        <Input placeholder="Tên báo cáo (VD: Báo cáo Q2/2026)" value={reportName} onChange={(e) => setReportName(e.target.value)} onPressEnter={() => { if (reportName.trim()) saveMutation.mutate(); }} />
      </Modal>

      <Drawer title="Báo cáo đã lưu" open={drawerOpen} onClose={() => { setDrawerOpen(false); setViewingReport(null); }} width={700}>
        {viewingReport ? (
          <>
            <Button size="small" style={{ marginBottom: 12 }} onClick={() => setViewingReport(null)}>← Quay lại danh sách</Button>
            <Title level={5}>{viewingReport.name}</Title>
            <Row gutter={[8, 8]} style={{ marginBottom: 12 }}>
              <Col span={6}><Statistic title="Doanh thu" value={Number(viewingReport.totalRevenue)} formatter={(v) => formatMoney(v as number)} valueStyle={{ fontSize: 14 }} /></Col>
              <Col span={6}><Statistic title="Lợi nhuận" value={Number(viewingReport.totalProfit)} formatter={(v) => formatMoney(v as number)} valueStyle={{ fontSize: 14 }} /></Col>
              <Col span={6}><Statistic title="Số lượng" value={Number(viewingReport.totalQuantity)} valueStyle={{ fontSize: 14 }} /></Col>
              <Col span={6}><Statistic title="Số đơn" value={viewingReport.totalOrders} valueStyle={{ fontSize: 14 }} /></Col>
            </Row>
            <Table size="small" rowKey="id" dataSource={viewingReport.items} pagination={false} scroll={{ x: 900 }}
              columns={[
                { title: 'Mã SP', dataIndex: 'productCode', width: 90 },
                { title: 'Tên SP', dataIndex: 'productName', ellipsis: true },
                { title: 'SL', dataIndex: 'totalQuantity', width: 80, align: 'right' as const, render: (v: number) => v.toLocaleString('vi-VN') },
                { title: 'Doanh thu', dataIndex: 'totalRevenue', width: 120, align: 'right' as const, render: (v: number) => formatMoney(v) },
                { title: 'Lợi nhuận', dataIndex: 'totalProfit', width: 120, align: 'right' as const, render: (v: number) => formatMoney(v) },
                { title: 'Biên LN', dataIndex: 'profitMargin', width: 80, align: 'right' as const, render: (v: number) => `${v}%` },
              ]} />
          </>
        ) : (
          <List loading={savedLoading} dataSource={savedReportsData?.items ?? []} locale={{ emptyText: 'Chưa có báo cáo nào được lưu' }}
            renderItem={(item: SavedReport & { createdByUser?: { id: string; fullName: string } }) => (
              <List.Item actions={[
                <Button key="view" size="small" icon={<EyeOutlined />} onClick={() => { reportApi.getReport(item.id).then((r) => setViewingReport(r.data.data)); }}>Xem</Button>,
                <Popconfirm key="del" title="Xóa báo cáo này?" onConfirm={() => deleteMutation.mutate(item.id)}><Button size="small" danger icon={<DeleteOutlined />}>Xóa</Button></Popconfirm>,
              ]}>
                <List.Item.Meta title={item.name} description={<span>{item.from ? dayjs(item.from).format('DD/MM/YYYY') : '...'} — {item.to ? dayjs(item.to).format('DD/MM/YYYY') : '...'} · {Number(item.totalRevenue).toLocaleString('vi-VN')}₫ doanh thu · {item.productCount} SP{item.createdByUser ? ` · bởi ${item.createdByUser.fullName}` : ''}</span>} />
              </List.Item>
            )} />
        )}
      </Drawer>
    </div>
  );
}