import { useState } from 'react';
import { Table, Button, Input, Space, Tag, Modal, Form, Select, InputNumber, Switch, message } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { productApi, categoryApi, unitApi } from '@/api/endpoints';
import type { Product } from '@/api/endpoints';

interface ProductFormValues {
  code: string;
  name: string;
  categoryId?: string;
  unitId?: string;
  sellingPrice: number;
  costPrice: number;
  currentStock?: number;
  isActive?: boolean;
}

export default function ProductList() {
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [form] = Form.useForm();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['products', search],
    queryFn: () => productApi.list({ search, size: 20 }).then((r) => r.data.data),
  });

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => categoryApi.list().then((r) => r.data.data),
  });

  const { data: units } = useQuery({
    queryKey: ['units'],
    queryFn: () => unitApi.list().then((r) => r.data.data),
  });

  const createProduct = useMutation({
    mutationFn: productApi.create,
    onSuccess: () => {
      message.success('Thêm sản phẩm thành công');
      closeModal();
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: () => message.error('Thêm thất bại'),
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
    onError: () => message.error('Cập nhật thất bại'),
  });

  const closeModal = () => {
    setIsOpen(false);
    setEditingProduct(null);
    form.resetFields();
  };

  const openEdit = (product: Product) => {
    setEditingProduct(product);
    setIsOpen(true);
    form.setFieldsValue({
      code: product.code,
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
    setIsOpen(true);
    form.resetFields();
  };

  const handleSubmit = (values: ProductFormValues) => {
    const payload = {
      ...values,
      sellingPrice: Number(values.sellingPrice),
      costPrice: Number(values.costPrice),
      currentStock: Number(values.currentStock || 0),
      isActive: values.isActive ?? true,
      // Ant Design Select with allowClear sends undefined when cleared;
      // backend expects null (to clear relation) or a valid UUID
      categoryId: values.categoryId || null,
      unitId: values.unitId || null,
    };

    if (editingProduct) {
      updateProduct.mutate(payload);
    } else {
      createProduct.mutate(payload);
    }
  };

  const columns = [
    { title: 'Mã', dataIndex: 'code', width: 100 },
    { title: 'Tên', dataIndex: 'name' },
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
    { title: 'Trạng thái', dataIndex: 'isActive', width: 100, render: (v: boolean) => (v ? 'Hoạt động' : 'Ngừng') },
    {
      title: 'Hành động',
      width: 80,
      render: (_: unknown, record: Product) => (
        <Button type="link" size="small" onClick={() => openEdit(record)}>Sửa</Button>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Space style={{ marginBottom: 8 }}>
        <Input.Search
          placeholder="Tìm mã, tên sản phẩm"
          allowClear
          size="small"
          onSearch={setSearch}
          style={{ width: 220 }}
        />
        <Button type="primary" icon={<PlusOutlined />} size="small" onClick={openCreate}>Thêm</Button>
      </Space>
      <Table
        rowKey="id"
        loading={isLoading}
        columns={columns}
        dataSource={data?.items || []}
        pagination={{ total: data?.total, size: 'small', pageSize: 20 }}
        size="small"
        scroll={{ y: 'calc(100vh - 240px)' }}
      />
      <Modal
        title={editingProduct ? 'Sửa sản phẩm' : 'Thêm sản phẩm'}
        open={isOpen}
        onCancel={closeModal}
        onOk={() => form.submit()}
        confirmLoading={createProduct.isPending || updateProduct.isPending}
        width={480}
      >
        <Form
          form={form}
          layout="vertical"
          size="small"
          onFinish={handleSubmit}
        >
          <Form.Item name="code" label="Mã sản phẩm" rules={[{ required: true, message: 'Nhập mã' }]}>
            <Input placeholder="VD: NC009" />
          </Form.Item>
          <Form.Item name="name" label="Tên sản phẩm" rules={[{ required: true, message: 'Nhập tên' }]}>
            <Input placeholder="VD: Nước dừa tươi" />
          </Form.Item>
          <Form.Item name="categoryId" label="Danh mục">
            <Select allowClear placeholder="Chọn danh mục" options={categories?.map(c => ({ value: c.id, label: c.name }))} />
          </Form.Item>
          <Form.Item name="unitId" label="Đơn vị tính">
            <Select allowClear placeholder="Chọn đơn vị" options={units?.map(u => ({ value: u.id, label: u.name }))} />
          </Form.Item>
          <Space size="middle">
            <Form.Item name="sellingPrice" label="Giá bán" rules={[{ required: true }]}>
              <InputNumber min={0} style={{ width: 150 }} placeholder="0" />
            </Form.Item>
            <Form.Item name="costPrice" label="Giá nhập" rules={[{ required: true }]}>
              <InputNumber min={0} style={{ width: 150 }} placeholder="0" />
            </Form.Item>
            <Form.Item name="currentStock" label="Tồn kho" initialValue={0}>
              <InputNumber min={0} style={{ width: 100 }} placeholder="0" />
            </Form.Item>
          </Space>
          <Form.Item name="isActive" label="Hoạt động" valuePropName="checked" initialValue={true}>
            <Switch size="small" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}