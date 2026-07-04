import { useState, useEffect } from 'react';
import { Table, Button, Input, Space, Tag, Modal, Form, Select, InputNumber, Switch, message, Alert, Divider, Upload, List, Typography } from 'antd';
import { PlusOutlined, UploadOutlined, DownloadOutlined, ReloadOutlined } from '@ant-design/icons';
import type { UploadProps } from 'antd';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { productApi, categoryApi, unitApi } from '@/api/endpoints';
import type { Product } from '@/api/endpoints';

const { Text } = Typography;

interface ProductFormValues {
  name: string;
  categoryId?: string;
  unitId?: string;
  sellingPrice: number;
  costPrice: number;
  currentStock?: number;
  isActive?: boolean;
  hasBundle?: boolean;
  bundleUnitId?: string;
  factor?: number;
  bundleSellingPrice?: number;
  bundleCostPrice?: number;
  bundleName?: string;
  unitPriceOverride?: number;
}

function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export default function ProductList() {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [isOpen, setIsOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [hasBundle, setHasBundle] = useState(false);
  const [form] = Form.useForm();
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | undefined>();
  const queryClient = useQueryClient();

  // Import Excel
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importResult, setImportResult] = useState<{ total: number; imported: number; created: number; updated: number; skipped: number; errors: { row: number; message: string }[] } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['products', debouncedSearch],
    queryFn: () => productApi.list({ search: debouncedSearch, size: 20 }).then((r) => r.data.data),
  });

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => categoryApi.list().then((r) => r.data.data),
  });

  const { data: units } = useQuery({
    queryKey: ['units'],
    queryFn: () => unitApi.list().then((r) => r.data.data),
  });

  // Preview next auto-generated code when creating new product
  const { data: nextCodeData } = useQuery({
    queryKey: ['product-next-code', selectedCategoryId],
    queryFn: () => productApi.nextCode(selectedCategoryId).then((r) => r.data.data),
    enabled: isOpen && !editingProduct,
  });

  const createProduct = useMutation({
    mutationFn: productApi.create,
    onSuccess: () => {
      message.success('Thêm sản phẩm thành công');
      closeModal();
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (err: unknown) => {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      message.error(axiosErr?.response?.data?.message || 'Thêm thất bại');
    },
  });

  const updateProduct = useMutation({
    mutationFn: (values: Partial<Product>) => {
      if (!editingProduct) throw new Error('No product selected');
      return productApi.update(editingProduct.id, values);
    },
    onSuccess: () => {
      message.success('Cập nhật sản phẩm thành công');
      closeModal();
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (err: unknown) => {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      message.error(axiosErr?.response?.data?.message || 'Cập nhật thất bại');
    },
  });

  const closeModal = () => {
    setIsOpen(false);
    setEditingProduct(null);
    setHasBundle(false);
    setSelectedCategoryId(undefined);
    form.resetFields();
  };

  // Import mutation
  const importMutation = useMutation({
    mutationFn: (file: File) => productApi.import(file),
    onSuccess: (resp) => {
      const data = resp.data.data;
      setImportResult(data);
      message.success(`Import thành công: ${data.created} mới, ${data.updated} cập nhật`);
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (err: unknown) => {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      message.error(axiosErr?.response?.data?.message || 'Import thất bại');
    },
  });

  const closeImportModal = () => {
    setImportOpen(false);
    setImportFile(null);
    setImportResult(null);
  };

  const handleImport = () => {
    if (!importFile) {
      message.warning('Vui lòng chọn file xlsx');
      return;
    }
    importMutation.mutate(importFile);
  };

  // Download template — tạo file xlsx mẫu ngay trên trình duyệt
  const downloadTemplate = () => {
    import('xlsx').then((XLSX) => {
      const data = [
        { 'mã': 'SP001', 'tên': 'Mì tôm Gói', 'danh mục': 'TM', 'đơn vị': 'GOI', 'giá bán': 5000, 'giá nhập': 3500, 'tồn kho': 100, 'hoạt động': 'true' },
        { 'mã': 'SP002', 'tên': 'Nước suối Chai', 'danh mục': 'NUOC', 'đơn vị': 'CHAI', 'giá bán': 7000, 'giá nhập': 5000, 'tồn kho': 50, 'hoạt động': 'true' },
      ];
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Sản phẩm');
      XLSX.writeFile(wb, 'mau_import_san_pham.xlsx');
    });
  };

  const uploadProps: UploadProps = {
    beforeUpload: (file) => {
      const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
      if (!isExcel) {
        message.error('Chỉ chấp nhận file .xlsx hoặc .xls');
        return Upload.LIST_IGNORE;
      }
      setImportFile(file);
      setImportResult(null);
      return false;
    },
    maxCount: 1,
    onRemove: () => {
      setImportFile(null);
      setImportResult(null);
    },
    fileList: importFile ? [{ uid: '-1', name: importFile.name, status: 'done' }] : [],
  };

  const openEdit = (product: Product) => {
    setEditingProduct(product);
    setHasBundle(false); // editing doesn't support bundle toggle
    setSelectedCategoryId(product.categoryId || undefined);
    setIsOpen(true);
    form.setFieldsValue({
      name: product.name,
      categoryId: product.categoryId,
      unitId: product.unitId,
      sellingPrice: Number(product.sellingPrice),
      costPrice: Number(product.costPrice),
      currentStock: Number(product.currentStock),
      isActive: product.isActive,
    });
  };

  const openCreate = () => {
    setEditingProduct(null);
    setHasBundle(false);
    setSelectedCategoryId(undefined);
    setIsOpen(true);
    form.resetFields();
  };

  const handleSubmit = (values: ProductFormValues) => {
    if (editingProduct) {
      // Update — no bundle fields, just basic product fields
      const payload = {
        name: values.name,
        categoryId: values.categoryId || null,
        unitId: values.unitId || null,
        sellingPrice: Number(values.sellingPrice),
        costPrice: Number(values.costPrice),
        currentStock: Number(values.currentStock || 0),
        isActive: values.isActive ?? true,
      };
      updateProduct.mutate(payload);
    } else {
      // Create
      const payload = {
        name: values.name,
        categoryId: values.categoryId || null,
        unitId: values.unitId || null,
        sellingPrice: Number(values.sellingPrice),
        costPrice: Number(values.costPrice),
        currentStock: Number(values.currentStock || 0),
        isActive: values.isActive ?? true,
        hasBundle: hasBundle,
        bundleUnitId: hasBundle ? (values.bundleUnitId || null) : null,
        factor: hasBundle ? (values.factor ? Number(values.factor) : null) : null,
        bundleSellingPrice: hasBundle ? (values.bundleSellingPrice ? Number(values.bundleSellingPrice) : undefined) : undefined,
        bundleCostPrice: hasBundle ? (values.bundleCostPrice ? Number(values.bundleCostPrice) : undefined) : undefined,
        bundleName: hasBundle ? (values.bundleName || undefined) : undefined,
      };
      createProduct.mutate(payload);
    }
  };

  const columns = [
    { title: 'Mã', dataIndex: 'code', width: 140 },
    {
      title: 'Tên',
      dataIndex: 'name',
      render: (name: string, record: Product) => (
        <span>
          {name}
          {record.parentProductId && record.factor && (
            <Tag color="orange" style={{ marginLeft: 4, fontSize: 11 }}>
              {record.bundleUnit?.name || 'Đóng gói'} × {record.factor}
            </Tag>
          )}
        </span>
      ),
    },
    { title: 'Danh mục', dataIndex: ['category', 'name'], width: 120 },
    { title: 'ĐVT', dataIndex: ['unit', 'name'], width: 80 },
    {
      title: 'Giá bán',
      dataIndex: 'sellingPrice',
      width: 110,
      align: 'right' as const,
      render: (v: number) => Number(v).toLocaleString('vi-VN') + '₫',
    },
    {
      title: 'Giá nhập',
      dataIndex: 'costPrice',
      width: 110,
      align: 'right' as const,
      render: (v: number) => Number(v).toLocaleString('vi-VN') + '₫',
    },
    {
      title: 'Tồn kho',
      dataIndex: 'currentStock',
      width: 90,
      align: 'center' as const,
      render: (v: number) => (
        <Tag color={v <= 10 ? 'red' : v <= 30 ? 'orange' : 'green'} style={{ margin: 0 }}>{v}</Tag>
      ),
    },
    {
      title: 'Loại',
      width: 100,
      render: (_: unknown, record: Product) => {
        if (record.parentProductId && record.factor) {
          return <Tag color="orange">Đóng gói</Tag>;
        }
        if ((record.variants || []).length > 0) {
          return <Tag color="blue">Cơ bản</Tag>;
        }
        return <span style={{ color: '#aaa' }}>—</span>;
      },
    },
    { title: 'Trạng thái', dataIndex: 'isActive', width: 100, render: (v: boolean) => (v ? 'Hoạt động' : 'Ngừng') },
    {
      title: 'Hành động',
      width: 80,
      render: (_: unknown, record: Product) => (
        <Button type="link" size="small" onClick={() => openEdit(record)}>Sửa</Button>
      ),
    },
  ];

  // Watch bundle fields for live preview
  const factor = Form.useWatch('factor', form);
  const bundleCostPrice = Form.useWatch('bundleCostPrice', form);
  const sellingPrice = Form.useWatch('sellingPrice', form);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Space style={{ marginBottom: 8, flexShrink: 0 }}>
        <Input.Search
          placeholder="Tìm mã, tên sản phẩm"
          allowClear
          size="small"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onSearch={setSearch}
          style={{ width: 220 }}
        />
        <Button type="primary" icon={<PlusOutlined />} size="small" onClick={openCreate}>Thêm</Button>
        <Button icon={<UploadOutlined />} size="small" onClick={() => { setImportOpen(true); setImportResult(null); setImportFile(null); }}>Import Excel</Button>
        <Button icon={<ReloadOutlined />} size="small" onClick={() => queryClient.invalidateQueries({ queryKey: ['products'] })}>Làm mới</Button>
      </Space>
      <Table
        rowKey="id"
        loading={isLoading}
        columns={columns}
        dataSource={data?.items || []}
        pagination={{ total: data?.total, size: 'small', pageSize: 20 }}
        size="small"
      />
      <Modal
        title={editingProduct ? 'Sửa sản phẩm' : 'Thêm sản phẩm'}
        open={isOpen}
        onCancel={closeModal}
        onOk={() => form.submit()}
        confirmLoading={createProduct.isPending || updateProduct.isPending}
        width={600}
      >
        <Form
          form={form}
          layout="vertical"
          size="small"
          onFinish={handleSubmit}
          initialValues={{ currentStock: 0, isActive: true }}
        >
          {/* Code: read-only when editing, auto-generated preview when creating */}
          {editingProduct ? (
            <Form.Item label="Mã sản phẩm">
              <Input value={editingProduct.code} disabled />
            </Form.Item>
          ) : (
            <Form.Item label="Mã sản phẩm (tự động)">
              <Alert
                type="info"
                showIcon
                message={nextCodeData?.code ? `${nextCodeData.code}${hasBundle ? ` + ${nextCodeData.code}-TH` : ''}` : 'Chọn danh mục để sinh mã'}
                description="Mã tự động sinh theo pattern: PREFIX + 000001"
                style={{ padding: '4px 12px', fontSize: 13 }}
              />
            </Form.Item>
          )}
          <Form.Item name="name" label="Tên sản phẩm (bán lẻ)" rules={[{ required: true, message: 'Nhập tên' }]}>
            <Input placeholder="VD: Mì tôm Gói" />
          </Form.Item>
          <Form.Item name="categoryId" label="Danh mục" extra="Chọn danh mục để tự sinh mã sản phẩm">
            <Select
              allowClear
              placeholder="Chọn danh mục"
              options={categories?.map(c => ({ value: c.id, label: `${c.name} (${c.prefix})` }))}
              onChange={(val) => setSelectedCategoryId(val)}
            />
          </Form.Item>
          <Form.Item name="unitId" label="Đơn vị tính (bán lẻ)" extra="Đơn vị nhỏ nhất (VD: Gói, Chai)">
            <Select allowClear placeholder="Chọn đơn vị" options={units?.map(u => ({ value: u.id, label: u.name }))} />
          </Form.Item>

          {/* Bundle section — only when creating */}
          {!editingProduct && (
            <>
              <Divider style={{ margin: '12px 0' }} />
              <Form.Item label="Có đóng gói (nhập theo Thùng/Lốc, bán theo Gói)" valuePropName="checked">
                <Switch
                  size="small"
                  checked={hasBundle}
                  onChange={(checked) => {
                    setHasBundle(checked);
                    if (!checked) {
                      form.setFieldsValue({ bundleUnitId: undefined, factor: undefined, bundleSellingPrice: undefined, bundleCostPrice: undefined, bundleName: undefined });
                    }
                  }}
                />
              </Form.Item>
              {hasBundle && (
                <>
                  <div style={{ marginBottom: 8, color: '#666', fontSize: 12 }}>
                    VD: Nhập "Mì tôm" theo Thùng (30 gói/thùng), bán lẻ theo Gói.
                    Hệ thống sẽ tự tạo 2 sản phẩm: "Mì tôm Gói" (bán lẻ) và "Mì tôm Thùng" (nhập kho).
                  </div>
                  <Form.Item name="bundleName" label="Tên đóng gói (tùy chọn)" extra="VD: Mì tôm Thùng 30 gói. Để trống sẽ tự ghép tên.">
                    <Input placeholder="VD: Mì tôm Thùng 30 gói" />
                  </Form.Item>
                  <Form.Item name="bundleUnitId" label="Đơn vị nhập (đóng gói)" rules={[{ required: hasBundle, message: 'Chọn đơn vị đóng gói' }]}>
                    <Select allowClear placeholder="VD: Thùng" options={units?.map(u => ({ value: u.id, label: u.name }))} />
                  </Form.Item>
                  <Form.Item name="factor" label="Hệ số quy đổi" extra="VD: 1 Thùng = 30 Gói → nhập 30" rules={[{ required: hasBundle, message: 'Nhập hệ số' }]}>
                    <InputNumber min={1} step={1} style={{ width: 120 }} placeholder="30" />
                  </Form.Item>
                  <Space size="middle">
                    <Form.Item name="sellingPrice" label="Giá bán / Gói" rules={[{ required: true }]}>
                      <InputNumber min={0} style={{ width: 150 }} placeholder="0" addonAfter="₫" />
                    </Form.Item>
                    <Form.Item name="bundleSellingPrice" label="Giá bán / Thùng (tùy chọn)" extra="Để trống = giá gói × factor">
                      <InputNumber min={0} style={{ width: 180 }} placeholder="Tự tính" addonAfter="₫" />
                    </Form.Item>
                  </Space>
                  <Space size="middle">
                    <Form.Item name="bundleCostPrice" label="Giá nhập / Thùng" rules={[{ required: hasBundle, message: 'Nhập giá nhập/thùng' }]}>
                      <InputNumber min={0} style={{ width: 180 }} placeholder="0" addonAfter="₫" />
                    </Form.Item>
                  </Space>
                  {factor && bundleCostPrice && (
                    <Alert
                      type="info"
                      showIcon
                      style={{ marginTop: 4, fontSize: 13 }}
                      message={`Giá vốn / Gói = ${Number(bundleCostPrice).toLocaleString('vi-VN')}₫ ÷ ${factor} = ${(Number(bundleCostPrice) / Number(factor)).toLocaleString('vi-VN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}₫`}
                    />
                  )}
                  {factor && sellingPrice && !bundleCostPrice && (
                    <Alert
                      type="info"
                      showIcon
                      style={{ marginTop: 4, fontSize: 13 }}
                      message={`Giá bán / Thùng (gợi ý) = ${Number(sellingPrice).toLocaleString('vi-VN')}₫ × ${factor} = ${(Number(sellingPrice) * Number(factor)).toLocaleString('vi-VN')}₫`}
                    />
                  )}
                </>
              )}
            </>
          )}

          {/* Simple product fields (when no bundle or editing) */}
          {(!hasBundle || editingProduct) && (
            <>
              <Space size="middle">
                <Form.Item name="sellingPrice" label="Giá bán" rules={[{ required: true }]}>
                  <InputNumber min={0} style={{ width: 150 }} placeholder="0" addonAfter="₫" />
                </Form.Item>
                <Form.Item name="costPrice" label="Giá nhập" rules={[{ required: true }]}>
                  <InputNumber min={0} style={{ width: 150 }} placeholder="0" addonAfter="₫" />
                </Form.Item>
                <Form.Item name="currentStock" label="Tồn kho" initialValue={0}>
                  <InputNumber min={0} style={{ width: 100 }} placeholder="0" />
                </Form.Item>
              </Space>
            </>
          )}
          <Form.Item name="isActive" label="Hoạt động" valuePropName="checked" initialValue={true}>
            <Switch size="small" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Import Excel Modal */}
      <Modal
        title="Import sản phẩm từ Excel"
        open={importOpen}
        onCancel={closeImportModal}
        onOk={handleImport}
        okText="Import"
        cancelText="Hủy"
        confirmLoading={importMutation.isPending}
        width={520}
      >
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message="Cột bắt buộc: mã, tên, giá bán, giá nhập"
          description="Cột tùy chọn: danh mục (prefix), đơn vị (code), tồn kho, hoạt động (true/false). Nếu mã đã tồn tại → cập nhật."
        />
        <Space style={{ marginBottom: 12 }}>
          <Button size="small" icon={<DownloadOutlined />} onClick={downloadTemplate}>Tải file mẫu</Button>
        </Space>
        <Upload.Dragger {...uploadProps} accept=".xlsx,.xls">
          <p style={{ fontSize: 13, margin: '8px 0' }}>
            <UploadOutlined style={{ fontSize: 24, color: '#1677ff' }} />
          </p>
          <p style={{ fontSize: 13, margin: 0 }}>Kéo thả file xlsx vào đây hoặc bấm để chọn</p>
        </Upload.Dragger>
        {importResult && (
          <div style={{ marginTop: 12 }}>
            <Alert
              type="success"
              showIcon
              message={`Import xong: ${importResult.created} mới, ${importResult.updated} cập nhật, ${importResult.skipped} bỏ qua`}
              description={importResult.errors.length > 0 ? (
                <div>
                  <Text type="danger" style={{ fontSize: 12 }}>{importResult.errors.length} dòng lỗi:</Text>
                  <List
                    size="small"
                    dataSource={importResult.errors.slice(0, 10)}
                    renderItem={(e) => <List.Item style={{ fontSize: 12, padding: '2px 0' }}>Dòng {e.row}: {e.message}</List.Item>}
                  />
                  {importResult.errors.length > 10 && <Text type="secondary" style={{ fontSize: 12 }}>... và {importResult.errors.length - 10} lỗi khác</Text>}
                </div>
              ) : undefined}
            />
          </div>
        )}
      </Modal>
    </div>
  );
}