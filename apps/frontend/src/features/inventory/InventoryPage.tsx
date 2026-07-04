import { getApiErrorMessage } from '@/api/client';
import { useState } from 'react';
import { Tabs, Card, Button, Input, Select, InputNumber, message, Table, Tag, Space, Alert } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { productApi, inventoryApi } from '@/api/endpoints';
import type { Product } from '@/api/endpoints';
import { unaccentIncludes } from '@/utils/unaccent';
import StockCountTab from './StockCountTab';

export default function InventoryPage() {
  const [activeKey, setActiveKey] = useState('stock-in');
  const queryClient = useQueryClient();

  // Stock-in state
  const [selectedProductId, setSelectedProductId] = useState<string | undefined>();
  const [qty, setQty] = useState<number>(1);
  const [reason, setReason] = useState('');

  // Products for stock-in dropdown
  const { data: allProducts } = useQuery({
    queryKey: ['products-all'],
    // PERFORMANCE NOTE: fetches up to 200 products for the Select dropdown.
    // Acceptable for canteen scale (~50-150 SKUs). If catalog grows past ~300,
    // migrate to a debounced remote-search Select using productApi.list({ search, size }).
    queryFn: () => productApi.list({ size: 200 }).then((r) => r.data.data.items),
  });

  const selectedProduct = allProducts?.find((p: Product) => p.id === selectedProductId);

  // Tính preview quy đổi cho bundle product
  const bundlePreview = (() => {
    if (!selectedProduct || !selectedProduct.parentProductId || !selectedProduct.factor) return null;
    const baseName = selectedProduct.parentProduct?.name || selectedProduct.name;
    const bundleUnitName = selectedProduct.bundleUnit?.name || '';
    const baseUnitName = selectedProduct.parentProduct?.unit?.name || selectedProduct.unit?.name || '';
    const effectiveQty = qty * Number(selectedProduct.factor);
    return {
      formula: `${qty} ${bundleUnitName} = ${effectiveQty} ${baseUnitName}`,
      effectiveQty,
      baseName,
      baseUnitName,
    };
  })();

  const stockIn = useMutation({
    mutationFn: inventoryApi.stockIn,
    onSuccess: () => {
      const label = bundlePreview
        ? ` (${bundlePreview.formula})`
        : selectedProduct?.unit ? ` ${selectedProduct.unit.name}` : '';
      message.success(`Nhập kho thành công: ${qty}${label} ${selectedProduct?.name || ''}`);
      setSelectedProductId(undefined);
      setQty(1);
      setReason('');
      queryClient.invalidateQueries({ queryKey: ['products-all'] });
      queryClient.invalidateQueries({ queryKey: ['low-stock'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-transactions'] });
    },
    onError: (err: unknown) => {
      const axiosErr = err as { response?: { data?: { message?: string; errors?: { fieldErrors?: Record<string, string[]> } } } };
      const msg = axiosErr?.response?.data?.errors?.fieldErrors?.productId?.[0] || getApiErrorMessage(err, 'Nhập kho thất bại');
      message.error(msg);
      console.error('Stock-in error:', axiosErr?.response?.data || err);
    },
  });

  // Low stock alerts
  const { data: lowStock, isLoading: lowStockLoading } = useQuery({
    queryKey: ['low-stock'],
    queryFn: () => productApi.lowStock().then((r) => r.data.data),
  });

  // Inventory transactions
  const { data: transactions, isLoading: txLoading } = useQuery({
    queryKey: ['inventory-transactions'],
    queryFn: () => inventoryApi.listTransactions({ size: 20 }).then((r) => r.data.data?.items ?? []),
  });

  const tabItems = [
    {
      key: 'stock-in',
      label: 'Nhập kho',
      children: (
        <Card title="Nhập kho" size="small" styles={{ body: { padding: 16 } }}>
          <Space direction="vertical" size="middle" style={{ width: 400 }}>
            <div>
              <div style={{ marginBottom: 4, fontWeight: 500 }}>Sản phẩm</div>
              <Select
                showSearch
                placeholder="Chọn sản phẩm..."
                value={selectedProductId}
                onChange={setSelectedProductId}
                filterOption={(input, option) => unaccentIncludes(option?.label ?? '', input)}
                options={allProducts?.map((p: Product) => ({
                  value: p.id,
                  label: `${p.code} - ${p.name}${p.parentProductId && p.factor ? ` (${p.bundleUnit?.name || 'đóng gói'} ×${p.factor})` : ''} (Tồn: ${p.currentStock})`,
                }))}
                style={{ width: '100%' }}
                size="small"
              />
            </div>
            {selectedProduct && (
              <div style={{ padding: '8px 12px', background: '#f6f8fa', borderRadius: 6, fontSize: 13 }}>
                <div><strong>{selectedProduct.code}</strong> — {selectedProduct.name}</div>
                <div style={{ color: '#666' }}>
                  {' '}Tồn hiện tại:{' '}
                  {selectedProduct.parentProductId ? (
                    <Tag color={Number(selectedProduct.parentProduct?.currentStock ?? 0) <= 10 ? 'red' : Number(selectedProduct.parentProduct?.currentStock ?? 0) <= 30 ? 'orange' : 'green'}>
                      {Number(selectedProduct.parentProduct?.currentStock ?? 0)} {selectedProduct.parentProduct?.unit?.name || selectedProduct.unit?.name || ''}
                    </Tag>
                  ) : (
                    <Tag color={Number(selectedProduct.currentStock) <= 10 ? 'red' : Number(selectedProduct.currentStock) <= 30 ? 'orange' : 'green'}>
                      {selectedProduct.currentStock} {selectedProduct.unit?.name || ''}
                    </Tag>
                  )}
                  {' '}| Giá nhập: {Number(selectedProduct.costPrice).toLocaleString('vi-VN')}₫
                </div>
                {selectedProduct.parentProductId && selectedProduct.factor && (
                  <div style={{ marginTop: 4, color: '#888', fontSize: 12 }}>
                    Quy đổi: 1 {selectedProduct.bundleUnit?.name || 'đóng gói'} = {selectedProduct.factor} {selectedProduct.parentProduct?.name || 'đơn vị cơ bản'}
                  </div>
                )}
              </div>
            )}
            <div>
              <div style={{ marginBottom: 4, fontWeight: 500 }}>Số lượng nhập</div>
              <InputNumber
                min={1}
                value={qty}
                onChange={(v) => setQty(v || 1)}
                style={{ width: '100%' }}
                size="small"
              />
            </div>
            {bundlePreview && (
              <Alert
                type="info"
                showIcon
                message={bundlePreview.formula}
                description={`Tồn kho cơ bản sẽ cộng ${bundlePreview.effectiveQty} ${bundlePreview.baseName}`}
                style={{ fontSize: 13 }}
              />
            )}
            <div>
              <div style={{ marginBottom: 4, fontWeight: 500 }}>Lý do / Số chứng từ</div>
              <Input.TextArea
                placeholder="VD: Nhập kho theo PN-00123"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                size="small"
              />
            </div>
            <Button
              type="primary"
              size="small"
              disabled={!selectedProductId || qty <= 0}
              loading={stockIn.isPending}
              onClick={() => {
                if (selectedProductId) {
                  stockIn.mutate({ productId: selectedProductId, quantity: qty, reason });
                }
              }}
              style={{ width: '100%' }}
            >
              Xác nhận nhập kho
            </Button>
          </Space>
        </Card>
      ),
    },
    {
      key: 'alerts',
      label: 'Cảnh báo hết hàng',
      children: (
        <Card title={<span>Sản phẩm sắp hết <Button size="small" type="text" icon={<ReloadOutlined />} onClick={() => queryClient.invalidateQueries({ queryKey: ['low-stock'] })} /></span>} size="small" styles={{ body: { padding: 8 } }}>
          <Table
            size="small"
            rowKey="id"
            dataSource={lowStock || []}
            loading={lowStockLoading}
            pagination={false}
            columns={[
              { title: 'Mã', dataIndex: 'code', width: 100 },
              { title: 'Tên', dataIndex: 'name' },
              { title: 'Danh mục', dataIndex: ['category', 'name'], width: 120 },
              { title: 'Tồn kho', dataIndex: 'currentStock', width: 100, render: (v: number) => <Tag color="red">{v}</Tag> },
              { title: 'Giá bán', dataIndex: 'sellingPrice', width: 110, align: 'right' as const, render: (v: number) => Number(v).toLocaleString('vi-VN') + '₫' },
            ]}
          />
        </Card>
      ),
    },
    {
      key: 'history',
      label: 'Lịch sử giao dịch',
      children: (
        <Card title={<span>Lịch sử giao dịch kho <Button size="small" type="text" icon={<ReloadOutlined />} onClick={() => queryClient.invalidateQueries({ queryKey: ['inventory-transactions'] })} /></span>} size="small" styles={{ body: { padding: 8 } }}>
          <Table
            size="small"
            rowKey="id"
            dataSource={transactions || []}
            loading={txLoading}
            pagination={{ pageSize: 20, size: 'small' }}
            columns={[
              { title: 'Thời gian', dataIndex: 'createdAt', width: 160, render: (v: string) => new Date(v).toLocaleString('vi-VN') },
              { title: 'Loại', dataIndex: 'type', width: 100, render: (v: string) => {
                const map: Record<string, { color: string; label: string }> = {
                  IN: { color: 'green', label: 'Nhập' },
                  OUT: { color: 'red', label: 'Xuất' },
                  ADJUSTMENT: { color: 'orange', label: 'Điều chỉnh' },
                  COUNT: { color: 'blue', label: 'Kiểm kê' },
                };
                const item = map[v] || { color: 'default', label: v };
                return <Tag color={item.color}>{item.label}</Tag>;
              }},
              { title: 'Sản phẩm', dataIndex: ['product', 'name'], width: 160 },
              { title: 'Số lượng', dataIndex: 'quantity', width: 90, align: 'right' as const },
              { title: 'Tồn trước', dataIndex: 'stockBefore', width: 90 },
              { title: 'Tồn sau', dataIndex: 'stockAfter', width: 90 },
              { title: 'Lý do', dataIndex: 'reason', ellipsis: true },
            ]}
          />
        </Card>
      ),
    },
  ];

  // Thêm tab kiểm kê
  tabItems.push({
    key: 'stock-count',
    label: 'Kiểm kê',
    children: <StockCountTab />,
  });

  return (
    <Tabs
      activeKey={activeKey}
      onChange={setActiveKey}
      size="small"
      tabBarStyle={{ marginBottom: 8 }}
      items={tabItems}
    />
  );
}