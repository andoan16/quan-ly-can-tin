import { useState } from 'react';
import { Tabs } from 'antd';
import CustomerList from './customers/CustomerList';
import ProductList from './products/ProductList';

export default function MasterDataPage() {
  const [activeKey, setActiveKey] = useState('customers');

  const items = [
    { key: 'customers', label: 'Người mua', children: <CustomerList /> },
    { key: 'products', label: 'Sản phẩm', children: <ProductList /> },
  ];

  return (
    <Tabs
      activeKey={activeKey}
      onChange={setActiveKey}
      size="small"
      style={{ height: '100%' }}
      tabBarStyle={{ marginBottom: 8 }}
      items={items}
    />
  );
}