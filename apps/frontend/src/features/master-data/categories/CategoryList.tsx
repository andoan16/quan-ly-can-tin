import { getApiErrorMessage } from '@/api/client';
import { useState } from 'react';
import { Table, Button, Input, Space, Tag, Modal, Form, Switch, message, Popconfirm } from 'antd';
import { PlusOutlined, ReloadOutlined, DeleteOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { categoryApi } from '@/api/endpoints';
import type { Category } from '@/api/endpoints';

interface CategoryFormValues {
  code: string;
  name: string;
  prefix: string;
  note?: string;
  isActive?: boolean;
}

export default function CategoryList() {
  const [isOpen, setIsOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [form] = Form.useForm();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['categories-all'],
    queryFn: () => categoryApi.listAll().then((r) => r.data.data),
  });

  const createCategory = useMutation({
    mutationFn: categoryApi.create,
    onSuccess: () => {
      message.success('Thêm danh mục thành công');
      closeModal();
      queryClient.invalidateQueries({ queryKey: ['categories-all'] });
      queryClient.invalidateQueries({ queryKey: ['categories'] });
    },
    onError: (err: unknown) => {
            message.error(getApiErrorMessage(err, 'Thêm thất bại'));
    },
  });

  const updateCategory = useMutation({
    mutationFn: (values: Partial<Category>) => {
      if (!editingCategory) throw new Error('No category selected');
      return categoryApi.update(editingCategory.id, values);
    },
    onSuccess: () => {
      message.success('Cập nhật danh mục thành công');
      closeModal();
      queryClient.invalidateQueries({ queryKey: ['categories-all'] });
      queryClient.invalidateQueries({ queryKey: ['categories'] });
    },
    onError: (err: unknown) => {
            message.error(getApiErrorMessage(err, 'Cập nhật thất bại'));
    },
  });

  const deleteCategory = useMutation({
    mutationFn: categoryApi.delete,
    onSuccess: () => {
      message.success('Đã ngừng danh mục');
      queryClient.invalidateQueries({ queryKey: ['categories-all'] });
      queryClient.invalidateQueries({ queryKey: ['categories'] });
    },
    onError: () => message.error('Xóa thất bại'),
  });

  const closeModal = () => {
    setIsOpen(false);
    setEditingCategory(null);
    form.resetFields();
  };

  const openEdit = (cat: Category) => {
    setEditingCategory(cat);
    setIsOpen(true);
    form.setFieldsValue({
      code: cat.code,
      name: cat.name,
      prefix: cat.prefix,
      note: cat.note,
      isActive: cat.isActive,
    });
  };

  const openCreate = () => {
    setEditingCategory(null);
    setIsOpen(true);
    form.resetFields();
  };

  const handleSubmit = (values: CategoryFormValues) => {
    const payload = {
      ...values,
      prefix: values.prefix.toUpperCase(),
      isActive: values.isActive ?? true,
    };
    if (editingCategory) {
      updateCategory.mutate(payload);
    } else {
      createCategory.mutate(payload);
    }
  };

  const columns = [
    { title: 'Mã', dataIndex: 'code', width: 120 },
    { title: 'Tên danh mục', dataIndex: 'name' },
    {
      title: 'Prefix',
      dataIndex: 'prefix',
      width: 100,
      render: (prefix: string) => <Tag color="blue">{prefix}</Tag>,
    },
    { title: 'Ghi chú', dataIndex: 'note', ellipsis: true },
    {
      title: 'Trạng thái',
      dataIndex: 'isActive',
      width: 100,
      render: (v: boolean) => (v ? 'Hoạt động' : 'Ngừng'),
    },
    {
      title: 'Hành động',
      width: 120,
      render: (_: unknown, record: Category) => (
        <Space>
          <Button type="link" size="small" onClick={() => openEdit(record)}>Sửa</Button>
          <Popconfirm
            title="Ngừng danh mục này?"
            onConfirm={() => deleteCategory.mutate(record.id)}
            okText="Ngừng"
            cancelText="Hủy"
          >
            <Button type="text" danger size="small" icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Space style={{ marginBottom: 8, flexShrink: 0 }}>
        <Button type="primary" icon={<PlusOutlined />} size="small" onClick={openCreate}>Thêm danh mục</Button>
        <Button icon={<ReloadOutlined />} size="small" onClick={() => queryClient.invalidateQueries({ queryKey: ['categories-all'] })}>Làm mới</Button>
      </Space>
      <Table
        rowKey="id"
        loading={isLoading}
        columns={columns}
        dataSource={data || []}
        pagination={false}
        size="small"
      />
      <Modal
        title={editingCategory ? 'Sửa danh mục' : 'Thêm danh mục'}
        open={isOpen}
        onCancel={closeModal}
        onOk={() => form.submit()}
        confirmLoading={createCategory.isPending || updateCategory.isPending}
        width={480}
      >
        <Form form={form} layout="vertical" size="small" onFinish={handleSubmit}>
          <Form.Item name="code" label="Mã danh mục" rules={[{ required: true, message: 'Nhập mã' }]}>
            <Input placeholder="VD: BANH_MI" />
          </Form.Item>
          <Form.Item name="name" label="Tên danh mục" rules={[{ required: true, message: 'Nhập tên' }]}>
            <Input placeholder="VD: Bánh mì" />
          </Form.Item>
          <Form.Item
            name="prefix"
            label="Prefix mã sản phẩm"
            extra="Mã sản phẩm sẽ tự sinh: PREFIX + 000001 (VD: BM000001)"
            rules={[
              { required: true, message: 'Nhập prefix' },
              { pattern: /^[A-Z0-9]+$/, message: 'Chỉ chữ HOA và số, không dấu/ký tự đặc biệt' },
            ]}
          >
            <Input
              placeholder="VD: BM"
              maxLength={10}
              onChange={(e) => form.setFieldValue('prefix', e.target.value.toUpperCase())}
            />
          </Form.Item>
          <Form.Item name="note" label="Ghi chú">
            <Input.TextArea rows={2} placeholder="Mô tả danh mục" />
          </Form.Item>
          <Form.Item name="isActive" label="Hoạt động" valuePropName="checked" initialValue={true}>
            <Switch size="small" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}