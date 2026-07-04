import { getApiErrorMessage } from '@/api/client';
import { useState, useEffect } from 'react';
import { Table, Button, Input, Space, Modal, Form, Switch, message, Tag, InputNumber, Drawer, Descriptions, List, Typography, Upload, Alert } from 'antd';
import { PlusOutlined, WalletOutlined, HistoryOutlined, UploadOutlined, DownloadOutlined, ReloadOutlined } from '@ant-design/icons';
import type { UploadProps } from 'antd';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { customerApi } from '@/api/endpoints';
import type { Customer, TopupTransaction } from '@/api/endpoints';
import dayjs from 'dayjs';

const { Text } = Typography;

function formatMoney(v: number) {
  return Number(v).toLocaleString('vi-VN') + '₫';
}

/** Hook: debounce a value by `delay` ms */
function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export default function CustomerList() {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [isOpen, setIsOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [form] = Form.useForm();
  const queryClient = useQueryClient();

  // Topup modal
  const [topupCustomer, setTopupCustomer] = useState<Customer | null>(null);
  const [topupForm] = Form.useForm();

  // Topup history drawer
  const [historyCustomer, setHistoryCustomer] = useState<Customer | null>(null);

  // Import Excel
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importResult, setImportResult] = useState<{ total: number; imported: number; created: number; updated: number; skipped: number; errors: { row: number; message: string }[] } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['customers', debouncedSearch],
    queryFn: () => customerApi.list({ search: debouncedSearch, size: 20 }).then((r) => r.data.data),
  });

  // Topup history
  const { data: topupHistory, isLoading: historyLoading } = useQuery({
    queryKey: ['customer-topups', historyCustomer?.id],
    queryFn: () => customerApi.topups(historyCustomer!.id, { page: 1, size: 50 }).then((r) => r.data.data),
    enabled: !!historyCustomer,
  });

  const createCustomer = useMutation({
    mutationFn: customerApi.create,
    onSuccess: () => {
      message.success('Thêm người mua thành công');
      closeModal();
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
    onError: (err: unknown) => {
            message.error(getApiErrorMessage(err, 'Thêm thất bại'));
    },
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
    onError: (err: unknown) => {
            message.error(getApiErrorMessage(err, 'Cập nhật thất bại'));
    },
  });

  const topupMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { amount: number; receivedFrom?: string; note?: string } }) =>
      customerApi.topup(id, payload),
    onSuccess: (resp) => {
      const newBalance = resp.data.data.balanceAfter;
      message.success(`Nạp thành công! Số dư mới: ${formatMoney(Number(newBalance))}`);
      topupForm.resetFields();
      setTopupCustomer(null);
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['customer-topups'] });
    },
    onError: (err: unknown) => {
            message.error(getApiErrorMessage(err, 'Nạp tiền thất bại'));
    },
  });

  const closeModal = () => {
    setIsOpen(false);
    setEditingCustomer(null);
    form.resetFields();
  };

  // Import mutation
  const importMutation = useMutation({
    mutationFn: (file: File) => customerApi.import(file),
    onSuccess: (resp) => {
      const data = resp.data.data;
      setImportResult(data);
      message.success(`Import thành công: ${data.created} mới, ${data.updated} cập nhật`);
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
    onError: (err: unknown) => {
            message.error(getApiErrorMessage(err, 'Import thất bại'));
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
        { 'mã': 'HS001', 'họ tên': 'Nguyễn Văn A', 'sđt': '0901234567', 'hoạt động': 'true' },
        { 'mã': 'HS002', 'họ tên': 'Trần Thị B', 'sđt': '0909876543', 'hoạt động': 'true' },
      ];
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Người mua');
      XLSX.writeFile(wb, 'mau_import_nguoi_mua.xlsx');
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
      return false; // ngăn auto upload
    },
    maxCount: 1,
    onRemove: () => {
      setImportFile(null);
      setImportResult(null);
    },
    fileList: importFile ? [{ uid: '-1', name: importFile.name, status: 'done' }] : [],
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
    {
      title: 'Số dư',
      dataIndex: 'balance',
      width: 140,
      align: 'right' as const,
      render: (v: number) => (
        <span style={{ fontWeight: 600, color: Number(v) > 0 ? '#52c41a' : '#ff4d4f' }}>
          {formatMoney(Number(v))}
        </span>
      ),
    },
    { title: 'SĐT', dataIndex: 'phone', width: 120 },
    { title: 'Trạng thái', dataIndex: 'isActive', width: 110, render: (v: boolean) => (v ? 'Hoạt động' : 'Ngừng') },
    {
      title: 'Hành động',
      width: 200,
      render: (_: unknown, record: Customer) => (
        <Space size="small">
          <Button type="link" size="small" icon={<WalletOutlined />} onClick={() => setTopupCustomer(record)}>
            Nạp
          </Button>
          <Button type="link" size="small" icon={<HistoryOutlined />} onClick={() => setHistoryCustomer(record)}>
            Lịch sử
          </Button>
          <Button type="link" size="small" onClick={() => openEdit(record)}>Sửa</Button>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Space style={{ marginBottom: 8, flexShrink: 0 }}>
        <Input.Search
          placeholder="Tìm mã, tên, SĐT"
          allowClear
          size="small"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onSearch={setSearch}
          style={{ width: 220 }}
        />
        <Button type="primary" icon={<PlusOutlined />} size="small" onClick={openCreate}>Thêm</Button>
        <Button icon={<UploadOutlined />} size="small" onClick={() => { setImportOpen(true); setImportResult(null); setImportFile(null); }}>Import Excel</Button>
        <Button icon={<ReloadOutlined />} size="small" onClick={() => queryClient.invalidateQueries({ queryKey: ['customers'] })}>Làm mới</Button>
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
          <Form.Item name="phone" label="Số điện thoại">
            <Input placeholder="0912345678" />
          </Form.Item>
          <Form.Item name="isActive" label="Hoạt động" valuePropName="checked" initialValue={true}>
            <Switch size="small" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Topup Modal */}
      <Modal
        title={`Nạp tiền — ${topupCustomer?.fullName ?? ''}`}
        open={!!topupCustomer}
        onCancel={() => { setTopupCustomer(null); topupForm.resetFields(); }}
        onOk={() => topupForm.submit()}
        okText="Nạp"
        cancelText="Hủy"
        confirmLoading={topupMutation.isPending}
        width={420}
      >
        {topupCustomer && (
          <div style={{ marginBottom: 12, padding: '8px 12px', background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 4 }}>
            <Text type="secondary">Số dư hiện tại: </Text>
            <Text strong style={{ color: '#52c41a' }}>{formatMoney(Number(topupCustomer.balance))}</Text>
          </div>
        )}
        <Form form={topupForm} layout="vertical" size="small" onFinish={(values) => {
          topupMutation.mutate({ id: topupCustomer!.id, payload: values });
        }}>
          <Form.Item name="amount" label="Số tiền nạp" rules={[{ required: true, message: 'Nhập số tiền' }]}>
            <InputNumber
              style={{ width: '100%' }}
              placeholder="VD: 500000"
              formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
              parser={(v) => Number(v!.replace(/,/g, '')) as unknown as 1}
              min={1}
            />
          </Form.Item>
          <Form.Item name="receivedFrom" label="Người gửi (người thân)">
            <Input placeholder="VD: Nguyễn Văn B (bố)" />
          </Form.Item>
          <Form.Item name="note" label="Ghi chú">
            <Input.TextArea rows={2} placeholder="VD: Chuyển qua ngân hàng" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Topup History Drawer */}
      <Drawer
        title={`Lịch sử nạp tiền — ${historyCustomer?.fullName ?? ''}`}
        open={!!historyCustomer}
        onClose={() => setHistoryCustomer(null)}
        width={560}
      >
        {historyCustomer && (
          <>
            <Descriptions size="small" column={1} bordered style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Số dư hiện tại">
                <Text strong style={{ color: '#52c41a', fontSize: 16 }}>{formatMoney(Number(historyCustomer.balance))}</Text>
              </Descriptions.Item>
            </Descriptions>
            <List
              loading={historyLoading}
              dataSource={topupHistory?.items ?? []}
              locale={{ emptyText: 'Chưa có lịch sử nạp' }}
              renderItem={(t: TopupTransaction) => (
                <List.Item>
                  <List.Item.Meta
                    title={
                      <span>
                        <Tag color="green">+{formatMoney(Number(t.amount))}</Tag>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {dayjs(t.createdAt).format('DD/MM/YYYY HH:mm')}
                        </Text>
                      </span>
                    }
                    description={
                      <span style={{ fontSize: 12 }}>
                        {t.receivedFrom && <>Người gửi: {t.receivedFrom} · </>}
                        {t.note && <>{t.note} · </>}
                        Trước: {formatMoney(Number(t.balanceBefore))} → Sau: {formatMoney(Number(t.balanceAfter))}
                        {t.createdByUser && ` · bởi ${t.createdByUser.fullName}`}
                      </span>
                    }
                  />
                </List.Item>
              )}
            />
          </>
        )}
      </Drawer>

      {/* Import Excel Modal */}
      <Modal
        title="Import người mua từ Excel"
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
          message="Cột bắt buộc: mã, họ tên"
          description="Cột tùy chọn: sđt, hoạt động (true/false). Nếu mã đã tồn tại → cập nhật."
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