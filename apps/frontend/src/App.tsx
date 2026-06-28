import { useState, useMemo, useEffect } from 'react';
import { Layout, Menu, Spin } from 'antd';
import {
  DatabaseOutlined,
  ShoppingCartOutlined,
  StockOutlined,
  BarChartOutlined,
} from '@ant-design/icons';
import { devLogin } from './api/client';
import MasterDataPage from './features/master-data/MasterDataPage';
import PosPage from './features/pos/PosPage';
import InventoryPage from './features/inventory/InventoryPage';
import SalesReportPage from './features/reports/SalesReportPage';

const { Sider, Content, Header } = Layout;

const menuItems = [
  { key: 'master', icon: <DatabaseOutlined />, label: 'Master Data' },
  { key: 'pos', icon: <ShoppingCartOutlined />, label: 'Bán hàng (POS)' },
  { key: 'inventory', icon: <StockOutlined />, label: 'Tồn kho' },
  { key: 'report', icon: <BarChartOutlined />, label: 'Báo cáo' },
];

const labels: Record<string, string> = {
  master: 'Master Data',
  pos: 'Bán hàng (POS)',
  inventory: 'Tồn kho',
  report: 'Báo cáo bán hàng',
};

function App() {
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem('activeTab') || 'pos');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    localStorage.setItem('activeTab', activeTab);
  }, [activeTab]);

  useEffect(() => {
    if (import.meta.env.DEV) {
      devLogin().finally(() => setReady(true));
    } else {
      setReady(true);
    }
  }, []);

  const items = useMemo(() => menuItems, []);

  if (!ready) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin size="large" tip="Đang kết nối..." />
      </div>
    );
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider theme="light" width={200} style={{ borderRight: '1px solid #f0f0f0' }}>
        <div style={{ padding: '12px 16px', fontWeight: 700, fontSize: 14, color: '#1677ff', letterSpacing: 0.5 }}>
          QUAN LY CAN TIN
        </div>
        <Menu
          mode="inline"
          selectedKeys={[activeTab]}
          items={items}
          onClick={({ key }) => setActiveTab(key)}
          style={{ borderRight: 0 }}
        />
      </Sider>
      <Layout>
        <Header style={{ height: 48, lineHeight: '48px', background: '#fff', paddingInline: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #f0f0f0' }}>
          <span style={{ fontSize: 16, fontWeight: 600 }}>{labels[activeTab] || activeTab}</span>
          <span style={{ fontSize: 13, color: '#666' }}>Admin</span>
        </Header>
        <Content style={{ padding: 12, background: '#f5f5f5', overflow: 'auto' }}>
          <div style={{ background: '#fff', padding: 12, borderRadius: 6, height: '100%' }}>
            {activeTab === 'master' && <MasterDataPage />}
            {activeTab === 'pos' && <PosPage />}
            {activeTab === 'inventory' && <InventoryPage />}
            {activeTab === 'report' && <SalesReportPage />}
          </div>
        </Content>
      </Layout>
    </Layout>
  );
}

export default App;
