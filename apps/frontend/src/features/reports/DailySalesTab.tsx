import { useState } from 'react';
import { Card, Row, Col, DatePicker, Statistic, Table, Typography, Button, Space, message } from 'antd';
import { DollarOutlined, ArrowUpOutlined, ArrowDownOutlined, ShoppingCartOutlined, CalendarOutlined, FileExcelOutlined, ReloadOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { reportApi } from '@/api/endpoints';
import type { DailySalesRow } from '@/api/endpoints';
import dayjs from 'dayjs';
import * as XLSX from 'xlsx';

const { RangePicker } = DatePicker;
const { Text } = Typography;

function formatMoney(v: number) {
  return v.toLocaleString('vi-VN') + '₫';
}

export default function DailySalesTab() {
  const queryClient = useQueryClient();
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['daily-sales', dateRange],
    queryFn: () =>
      reportApi
        .dailySales({
          from: dateRange?.[0]?.format('YYYY-MM-DD'),
          to: dateRange?.[1]?.format('YYYY-MM-DD'),
        })
        .then((r) => r.data.data),
  });

  const summary = data?.summary;

  const handleExportExcel = () => {
    if (!data?.items?.length) {
      message.warning('Không có dữ liệu để xuất');
      return;
    }

    const wsData = [
      ['Báo cáo doanh thu theo ngày'],
      ['Từ', dateRange?.[0]?.format('DD/MM/YYYY') || 'Đầu'],
      ['Đến', dateRange?.[1]?.format('DD/MM/YYYY') || 'Nay'],
      [],
      ['Ngày', 'Doanh thu', 'Giá vốn', 'Lợi nhuận', 'Biên LN (%)', 'Số đơn', 'Số lượng bán'],
      ...data.items.map((d) => [
        dayjs(d.date).format('DD/MM/YYYY'),
        d.revenue,
        d.cost,
        d.profit,
        d.revenue > 0 ? (d.profit / d.revenue * 100).toFixed(1) : '0',
        d.orderCount,
        d.itemQuantity,
      ]),
      [],
      ['Tổng cộng', summary?.totalRevenue ?? 0, summary?.totalCost ?? 0, summary?.totalProfit ?? 0,
        summary && summary.totalRevenue > 0 ? (summary.totalProfit / summary.totalRevenue * 100).toFixed(1) : '0',
        summary?.totalOrders ?? 0, summary?.totalQuantity ?? 0],
    ];

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [{ wch: 14 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 10 }, { wch: 8 }, { wch: 12 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Doanh thu theo ngày');
    XLSX.writeFile(wb, `Bao-cao-doanh-thu-${dayjs().format('YYYYMMDD-HHmm')}.xlsx`);
    message.success('Đã xuất file Excel');
  };

  const columns = [
    {
      title: 'Ngày',
      dataIndex: 'date',
      width: 120,
      render: (v: string) => dayjs(v).format('DD/MM/YYYY'),
    },
    {
      title: 'Doanh thu',
      dataIndex: 'revenue',
      width: 140,
      align: 'right' as const,
      render: (v: number) => <Text strong style={{ color: '#1677ff' }}>{formatMoney(v)}</Text>,
      sorter: (a: DailySalesRow, b: DailySalesRow) => a.revenue - b.revenue,
    },
    {
      title: 'Giá vốn',
      dataIndex: 'cost',
      width: 130,
      align: 'right' as const,
      render: (v: number) => formatMoney(v),
      sorter: (a: DailySalesRow, b: DailySalesRow) => a.cost - b.cost,
    },
    {
      title: 'Lợi nhuận',
      dataIndex: 'profit',
      width: 140,
      align: 'right' as const,
      render: (v: number) => (
        <span style={{ color: v >= 0 ? '#52c41a' : '#ff4d4f', fontWeight: 600 }}>
          {formatMoney(v)}
        </span>
      ),
      sorter: (a: DailySalesRow, b: DailySalesRow) => a.profit - b.profit,
    },
    {
      title: 'Biên LN',
      width: 100,
      align: 'right' as const,
      render: (_: unknown, row: DailySalesRow) => {
        const margin = row.revenue > 0 ? (row.profit / row.revenue) * 100 : 0;
        const color = margin >= 30 ? 'green' : margin >= 15 ? 'orange' : 'red';
        return <span style={{ color: color === 'green' ? '#52c41a' : color === 'orange' ? '#fa8c16' : '#ff4d4f' }}>{margin.toFixed(1)}%</span>;
      },
    },
    {
      title: 'Số đơn',
      dataIndex: 'orderCount',
      width: 80,
      align: 'right' as const,
      sorter: (a: DailySalesRow, b: DailySalesRow) => a.orderCount - b.orderCount,
    },
    {
      title: 'Số lượng bán',
      dataIndex: 'itemQuantity',
      width: 120,
      align: 'right' as const,
      render: (v: number) => v.toLocaleString('vi-VN'),
    },
  ];

  return (
    <div>
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card size="small" styles={{ body: { padding: '12px 16px' } }}>
            <Statistic
              title="Tổng doanh thu"
              value={summary?.totalRevenue ?? 0}
              formatter={(v) => formatMoney(v as number)}
              prefix={<DollarOutlined />}
              valueStyle={{ fontSize: 18, color: '#1677ff' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small" styles={{ body: { padding: '12px 16px' } }}>
            <Statistic
              title="Tổng lợi nhuận"
              value={summary?.totalProfit ?? 0}
              formatter={(v) => formatMoney(v as number)}
              prefix={summary && summary.totalProfit >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
              valueStyle={{ fontSize: 18, color: summary && summary.totalProfit >= 0 ? '#52c41a' : '#ff4d4f' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small" styles={{ body: { padding: '12px 16px' } }}>
            <Statistic
              title="Số đơn hàng"
              value={summary?.totalOrders ?? 0}
              prefix={<ShoppingCartOutlined />}
              valueStyle={{ fontSize: 18 }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small" styles={{ body: { padding: '12px 16px' } }}>
            <Statistic
              title="Số ngày có dữ liệu"
              value={summary?.dayCount ?? 0}
              prefix={<CalendarOutlined />}
              valueStyle={{ fontSize: 18 }}
            />
          </Card>
        </Col>
      </Row>

      <Card size="small" style={{ marginBottom: 12 }} styles={{ body: { padding: '8px 12px' } }}>
        <Space wrap>
          <RangePicker
            size="small"
            format="DD/MM/YYYY"
            placeholder={['Từ ngày', 'Đến ngày']}
            onChange={(dates) => setDateRange(dates as [dayjs.Dayjs | null, dayjs.Dayjs | null] | null)}
            allowClear
          />
          <Button size="small" icon={<FileExcelOutlined />} onClick={handleExportExcel} disabled={!data?.items?.length}>
            Xuất Excel
          </Button>
          <Button size="small" icon={<ReloadOutlined />} onClick={() => queryClient.invalidateQueries({ queryKey: ['daily-sales'] })}>Làm mới</Button>
        </Space>
      </Card>

      <Card size="small" title="Doanh thu theo ngày" styles={{ body: { padding: 0 } }}>
        <Table<DailySalesRow>
          size="small"
          rowKey="date"
          dataSource={data?.items ?? []}
          loading={isLoading}
          pagination={false}
          columns={columns}
          scroll={{ x: 800 }}
        />
      </Card>
    </div>
  );
}