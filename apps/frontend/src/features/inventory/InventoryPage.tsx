import { useState } from 'react';
import { Tabs, Card, Button, Input, Select, InputNumber, message, Table, Tag, Space, Alert } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { productApi, inventoryApi, unitApi } from '@/api/endpoints';
import type { Product, UnitConversion } from '@/api/endpoints';

export default function InventoryPage() {
  const [activeKey, setActiveKey] = useState('stock-in');
  const queryClient = useQueryClient();

  // Stock-in state
  const [selectedProductId, setSelectedProductId] = useState<string | undefined>();
  const [qty, setQty] = useState<number>(1);
  const [selectedUnitId, setSelectedUnitId] = useState<string | undefined>();
  const [reason, setReason] = useState('');

  // Products for stock-in dropdown
  const { data: allProducts } = useQuery({
    queryKey: ['products-all'],
    queryFn: () => productApi.list({ size: 200 }).then((r) => r.data.data.items),
  });

  // All units for dropdown
  const { data: allUnits } = useQuery({
    queryKey: ['units-all'],
    queryFn: () => unitApi.list().then((r) => r.data.data),
  });

  const selectedProduct = allProducts?.find((p: Product) => p.id === selectedProductId);

  // Tính danh sách đơn vị có thể nhập:
  // - Đơn vị cơ bản của product (unitId)
  // - Các fromUnit trong unitConversions (đơn vị lớn hơn)
  // - Các toUnit trong unitConversions (đơn vị nhỏ hơn)
  const availableUnits = (() => {
    if (!selectedProduct || !allUnits) return [];
    const unitIds = new Set<string>();
    if (selectedProduct.unitId) unitIds.add(selectedProduct.unitId);
    (selectedProduct.unitConversions || []).forEach((c: UnitConversion) => {
      unitIds.add(c.fromUnitId);
      unitIds.add(c.toUnitId);
    });
    return allUnits.filter((u) => unitIds.has(u.id));
  })();

  // Tính số lượng quy đổi khi chọn đơn vị nhập
  const conversionPreview = (() => {
    if (!selectedProduct || !selectedUnitId || !qty) return null;
    if (selectedUnitId === selectedProduct.unitId) {
      return { effectiveQty: qty, unitName: selectedProduct.unit?.name || '', isBase: true };
    }
    const conversions = selectedProduct.unitConversions || [];
    // Th1: selectedUnitId là fromUnit (đơn vị lớn), product.unitId là toUnit (đơn vị nhỏ)
    const forward = conversions.find((c) => c.fromUnitId === selectedUnitId && c.toUnitId === selectedProduct.unitId);
    if (forward) {
      return {
        effectiveQty: qty * forward.factor,
        unitName: forward.toUnit.name,
        fromUnitName: forward.fromUnit.name,
        isBase: false,
        formula: `${qty} ${forward.fromUnit.name} = ${qty * forward.factor} ${forward.toUnit.name}`,
      };
    }
    // Th2: selectedUnitId là toUnit (đơn vị nhỏ), product.unitId là fromUnit (đơn vị lớn)
    const reverse = conversions.find((c) => c.toUnitId === selectedUnitId && c.fromUnitId === selectedProduct.unitId);
    if (reverse) {
      const effective = qty / reverse.factor;
      return {
        effectiveQty: effective,
        unitName: reverse.fromUnit.name,
        fromUnitName: reverse.toUnit.name,
        isBase: false,
        formula: `${qty} ${reverse.toUnit.name} = ${effective} ${reverse.fromUnit.name}`,
      };
    }
    return null;
  })();

  const stockIn = useMutation({
    mutationFn: inventoryApi.stockIn,
    onSuccess: () => {
      const unitLabel = conversionPreview?.isBase === false
        ? ` (${conversionPreview.formula})`
        : ` ${selectedProduct?.unit?.name || ''}`;
      message.success(`Nhập kho thành công: ${qty}${unitLabel} ${selectedProduct?.name || ''}`);
      setSelectedProductId(undefined);
      setSelectedUnitId(undefined);
      setQty(1);
      setReason('');
      queryClient.invalidateQueries({ queryKey: ['products-all'] });
      queryClient.invalidateQueries({ queryKey: ['low-stock'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-transactions'] });
    },
    onError: (err: unknown) => {
      const axiosErr = err as { response?: { data?: { message?: string; errors?: { fieldErrors?: Record<string, string[]> } } } };
      const msg = axiosErr?.response?.data?.message || axiosErr?.response?.data?.errors?.fieldErrors?.productId?.[0] || (err instanceof Error ? err.message : 'Nhập kho thất bại');
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
                filterOption={(input, option) => (option?.label ?? '').toLowerCase().includes(input.toLowerCase())}
                options={allProducts?.map((p: Product) => ({
                  value: p.id,
                  label: `${p.code} - ${p.name} (Tồn: ${p.currentStock})`,
                }))}
                style={{ width: '100%' }}
                size="small"
              />
            </div>
            {selectedProduct && (
              <div style={{ padding: '8px 12px', background: '#f6f8fa', borderRadius: 6, fontSize: 13 }}>
                <div><strong>{selectedProduct.code}</strong> — {selectedProduct.name}</div>
                <div style={{ color: '#666' }}>
                  Tồn hiện tại: <Tag color={Number(selectedProduct.currentStock) <= 10 ? 'red' : Number(selectedProduct.currentStock) <= 30 ? 'orange' : 'green'}>
                    {selectedProduct.currentStock} {selectedProduct.unit?.name || ''}
                  </Tag>
                  {' '}| Giá nhập: {Number(selectedProduct.costPrice).toLocaleString('vi-VN')}₫
                </div>
                {(selectedProduct.unitConversions || []).length > 0 && (
                  <div style={{ marginTop: 4, color: '#888', fontSize: 12 }}>
                    Quy đổi: {selectedProduct.unitConversions!.map((c: UnitConversion) => `1 ${c.fromUnit.name} = ${c.factor} ${c.toUnit.name}`).join(', ')}
                  </div>
                )}
              </div>
            )}
            <div>
              <div style={{ marginBottom: 4, fontWeight: 500 }}>Đơn vị nhập</div>
              <Select
                placeholder="Chọn đơn vị..."
                value={selectedUnitId || selectedProduct?.unitId}
                onChange={setSelectedUnitId}
                options={availableUnits.map((u) => ({ value: u.id, label: u.name }))}
                style={{ width: '100%' }}
                size="small"
              />
            </div>
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
            {conversionPreview && !conversionPreview.isBase && (
              <Alert
                type="info"
                showIcon
                message={conversionPreview.formula}
                description={`Tồn kho sẽ cộng ${conversionPreview.effectiveQty} ${conversionPreview.unitName}`}
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
                  stockIn.mutate({ productId: selectedProductId, quantity: qty, unitId: selectedUnitId || selectedProduct?.unitId, reason });
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
        <Card title="Sản phẩm sắp hết" size="small" styles={{ body: { padding: 8 } }}>
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
        <Card title="Lịch sử giao dịch kho" size="small" styles={{ body: { padding: 8 } }}>
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