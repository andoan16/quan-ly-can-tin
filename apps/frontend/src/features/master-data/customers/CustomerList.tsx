import { useState } from 'react';
import { Table, Button, Input, Space, Modal, Form, Switch, Select, message } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { customerApi, customerGroupApi } from '@/api/endpoints';
import type { Customer } from '@/api/endpoints';

export default function CustomerList() {
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [form] = Form.useForm();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['customers', search],
    queryFn: () => customerApi.list({ search, size: 20 }).then((r) => r.data.data),
  });

  const { data: groups } = useQuery({
    queryKey: ['customer-groups'],
    queryFn: () => customerGroupApi.list().then((r) => r.data.data),
  });

  const createCustomer = useMutation({
    mutationFn: customerApi.create,
    onSuccess: () => {
      message.success('Thêm người mua thành công');
      closeModal();
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
    onError: () => message.error('Thêm thất bại'),
  });

  const updateCustomer = useMutation({
    mutationFn: (values: Partial<Customer>) => {
      if (!editingCustomer) throw new Error('No customer selected');
      return customerApi.update(editingCustomer.id, values);
    },
    onSuccess: () => {
      message.success('Cập nhật người mua thành công');
      closeModal();
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
    onError: () => message.error('Cập nhật thất bại'),
  });

  const closeModal = () => {
    setIsOpen(false);
    setEditingCustomer(null);
    form.resetFields();
  };

  const openEdit = (customer: Customer) => {
    setEditingCustomer(customer);
    setIsOpen(true);
    form.setFieldsValue({
      code: customer.code,
      fullName: customer.fullName,
      groupId: customer.groupId,
      phone: customer.phone,
      isActive: customer.isActive,
    });
  };

  const openCreate = () => {
    setEditingCustomer(null);
    setIsOpen(true);
    form.resetFields();
  };

  const handleSubmit = (values: Partial<Customer>) => {
    const payload = { ...values, isActive: values.isActive ?? true };
    if (editingCustomer) {
      updateCustomer.mutate(payload);
    } else {
      createCustomer.mutate(payload);
    }
  };

  const columns = [
    { title: 'Mã', dataIndex: 'code', width: 100 },
    { title: 'Họ tên', dataIndex: 'fullName' },
    { title: 'Nhóm', dataIndex: ['group', 'name'], width: 120 },
    { title: 'SĐT', dataIndex: 'phone', width: 120 },
    { title: 'Trạng thái', dataIndex: 'isActive', width: 110, render: (v: boolean) => (v ? 'Hoạt động' : 'Ngừng') },
    {
      title: 'Hành động',
      width: 80,
      render: (_: unknown, record: Customer) => (
        <Button type="link" size="small" onClick={() => openEdit(record)}>Sửa</Button>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Space style={{ marginBottom: 8 }}>
        <Input.Search
          placeholder="Tìm mã, tên, SĐT"
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
        title={editingCustomer ? 'Sửa người mua' : 'Thêm người mua'}
        open={isOpen}
        onCancel={closeModal}
        onOk={() => form.submit()}
        confirmLoading={createCustomer.isPending || updateCustomer.isPending}
        width={420}
      >
        <Form
          form={form}
          layout="vertical"
          size="small"
          onFinish={handleSubmit}
        >
          <Form.Item name="code" label="Mã người mua" rules={[{ required: true, message: 'Nhập mã' }]}>
            <Input placeholder="VD: HS016" />
          </Form.Item>
          <Form.Item name="fullName" label="Họ tên" rules={[{ required: true, message: 'Nhập họ tên' }]}>
            <Input placeholder="Nguyễn Văn A" />
          </Form.Item>
          <Form.Item name="groupId" label="Nhóm người mua">
            <Select allowClear placeholder="Chọn nhóm" options={groups?.map(g => ({ value: g.id, label: g.name }))} />
          </Form.Item>
          <Form.Item name="phone" label="Số điện thoại">
            <Input placeholder="0912345678" />
          </Form.Item>
          <Form.Item name="isActive" label="Hoạt động" valuePropName="checked" initialValue={true}>
            <Switch size="small" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}