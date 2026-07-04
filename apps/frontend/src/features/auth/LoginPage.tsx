import { useState } from 'react';
import { Card, Form, Input, Button, message, Typography } from 'antd';
import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { authApi } from '@/api/endpoints';
import { useAuthStore } from '@/stores/authStore';

const { Title, Text } = Typography;

export default function LoginPage() {
  const setAuth = useAuthStore((s) => s.setAuth);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (values: { username: string; password: string }) => {
    setLoading(true);
    try {
      const res = await authApi.login(values.username, values.password);
      const data = res.data?.data;
      if (data?.token && data?.user) {
        setAuth(data.token, data.user);
        message.success(`Xin chào ${data.user.fullName}`);
      } else {
        message.error('Đăng nhập thất bại — phản hồi không hợp lệ');
      }
    } catch {
      message.error('Sai tên đăng nhập hoặc mật khẩu');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      background: '#f0f2f5',
    }}>
      <Card style={{ width: 360, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <Title level={4} style={{ marginBottom: 4, color: '#1677ff' }}>QUAN LY CAN TIN</Title>
          <Text type="secondary">Đăng nhập để tiếp tục</Text>
        </div>
        <Form
          layout="vertical"
          onFinish={handleLogin}
          size="middle"
        >
          <Form.Item name="username" rules={[{ required: true, message: 'Nhập tên đăng nhập' }]}>
            <Input prefix={<UserOutlined />} placeholder="Tên đăng nhập" autoFocus />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: 'Nhập mật khẩu' }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="Mật khẩu" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" block loading={loading}>
              Đăng nhập
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}