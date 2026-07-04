import { useState, useEffect } from 'react';
import { Card, Table, Button, Select, Input, Space, message, Popconfirm, Tag, Tooltip } from 'antd';
import { PlusOutlined, SaveOutlined, DeleteOutlined, ReloadOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { feedbackApi } from '@/api/endpoints';
import type { Feedback, FeedbackType, FeedbackStatus, FeedbackBulkItem } from '@/api/endpoints';
import { getApiErrorMessage } from '@/api/client';

// UUID tạm thời cho row mới (chưa có id từ server)
let tempIdCounter = 0;
const genTempId = () => `__temp_${++tempIdCounter}`;

interface Row extends FeedbackBulkItem {
  key: string;
  tempId?: string;
  createdAt?: string;
  createdByUser?: { id: string; fullName: string };
}

const TYPE_OPTIONS: { value: FeedbackType; label: string; color: string }[] = [
  { value: 'BUG', label: 'BUG', color: 'red' },
  { value: 'IMPROVEMENT', label: 'Cải thiện', color: 'blue' },
];

const STATUS_OPTIONS: { value: FeedbackStatus; label: string }[] = [
  { value: 'NEW', label: 'Mới' },
  { value: 'DONE', label: 'Hoàn thành' },
];

export default function FeedbackTab() {
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<Row[]>([]);
  const [dirty, setDirty] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['feedback'],
    queryFn: () => feedbackApi.list().then((r) => r.data.data),
  });

  // Sync server data → local rows (chỉ khi không đang edit dirty)
  useEffect(() => {
    if (data && !dirty) {
      setRows(
        data.map((f: Feedback) => ({
          key: f.id,
          id: f.id,
          type: f.type,
          content: f.content,
          status: f.status,
          createdAt: f.createdAt,
          createdByUser: f.createdByUser,
        })),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: (items: FeedbackBulkItem[]) => feedbackApi.bulkUpdate(items),
    onSuccess: () => {
      message.success('Đã lưu feedback');
      setDirty(false);
      queryClient.invalidateQueries({ queryKey: ['feedback'] });
    },
    onError: (err: unknown) => message.error(getApiErrorMessage(err, 'Lưu feedback thất bại')),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => feedbackApi.delete(id),
    onSuccess: () => {
      message.success('Đã xóa');
      queryClient.invalidateQueries({ queryKey: ['feedback'] });
    },
    onError: (err: unknown) => message.error(getApiErrorMessage(err, 'Xóa thất bại')),
  });

  const updateRow = (key: string, patch: Partial<Row>) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    setDirty(true);
  };

  const addRow = () => {
    const tempId = genTempId();
    setRows((prev) => [
      { key: tempId, tempId, type: 'BUG', content: '', status: 'NEW' },
      ...prev,
    ]);
    setDirty(true);
  };

  const removeRow = (key: string) => {
    const row = rows.find((r) => r.key === key);
    // Row mới (chưa lưu) → xóa local
    if (!row?.id) {
      setRows((prev) => prev.filter((r) => r.key !== key));
      setDirty(true);
      return;
    }
    // Row đã lưu → confirm + gọi API xóa
    deleteMutation.mutate(row.id);
  };

  const handleSave = () => {
    // Validate: nội dung không trống
    const invalid = rows.find((r) => !r.content.trim());
    if (invalid) {
      message.warning('Nội dung không được để trống');
      return;
    }
    const payload: FeedbackBulkItem[] = rows.map((r) => ({
      id: r.id, // undefined cho row mới → backend sẽ tạo
      type: r.type,
      content: r.content.trim(),
      status: r.status,
    }));
    saveMutation.mutate(payload);
  };

  const columns = [
    {
      title: 'Loại',
      dataIndex: 'type',
      width: 140,
      render: (_: unknown, record: Row) => (
        <Select
          size="small"
          value={record.type}
          onChange={(v: FeedbackType) => updateRow(record.key, { type: v })}
          style={{ width: '100%' }}
          options={TYPE_OPTIONS.map((o) => ({ value: o.value, label: <Tag color={o.color}>{o.label}</Tag> }))}
          optionLabelProp="label"
        />
      ),
    },
    {
      title: 'Nội dung',
      dataIndex: 'content',
      render: (_: unknown, record: Row) => (
        <Input.TextArea
          size="small"
          autoSize={{ minRows: 1, maxRows: 4 }}
          value={record.content}
          onChange={(e) => updateRow(record.key, { content: e.target.value })}
          placeholder="Mô tả lỗi hoặc đề xuất cải thiện..."
        />
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      width: 150,
      render: (_: unknown, record: Row) => (
        <Select
          size="small"
          value={record.status}
          onChange={(v: FeedbackStatus) => updateRow(record.key, { status: v })}
          style={{ width: '100%' }}
          options={STATUS_OPTIONS}
        />
      ),
    },
    {
      title: 'Người tạo',
      dataIndex: ['createdByUser', 'fullName'],
      width: 120,
      render: (v: string | undefined, record: Row) => v || (record.id ? '—' : '(mới)'),
    },
    {
      title: '',
      width: 50,
      render: (_: unknown, record: Row) => (
        <Tooltip title="Xóa">
          <Popconfirm
            title="Xóa dòng này?"
            okText="Xóa"
            cancelText="Hủy"
            onConfirm={() => removeRow(record.key)}
          >
            <Button size="small" type="text" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Tooltip>
      ),
    },
  ];

  return (
    <Card
      title={
        <Space>
          <span>Feedback / Góp ý</span>
          <Button
            size="small"
            type="text"
            icon={<ReloadOutlined />}
            onClick={() => {
              setDirty(false);
              queryClient.invalidateQueries({ queryKey: ['feedback'] });
            }}
          />
        </Space>
      }
      size="small"
      styles={{ body: { padding: 8 } }}
      extra={
        <Space>
          <Button size="small" icon={<PlusOutlined />} onClick={addRow}>
            Thêm dòng
          </Button>
          <Button
            size="small"
            type="primary"
            icon={<SaveOutlined />}
            loading={saveMutation.isPending}
            disabled={!dirty}
            onClick={handleSave}
          >
            Lưu
          </Button>
        </Space>
      }
    >
      <Table<Row>
        size="small"
        rowKey="key"
        dataSource={rows}
        loading={isLoading}
        pagination={false}
        columns={columns}
        rowClassName={(record) => (record.status === 'DONE' ? 'feedback-row-done' : '')}
        locale={{ emptyText: 'Chưa có feedback nào. Nhấn "Thêm dòng" để tạo.' }}
      />
      <style>{`
        .feedback-row-done td {
          background-color: #f6ffed !important;
        }
        .feedback-row-done:hover td {
          background-color: #ecfde0 !important;
        }
      `}</style>
    </Card>
  );
}