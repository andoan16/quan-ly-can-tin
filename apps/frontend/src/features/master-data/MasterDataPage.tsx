import { useState } from 'react';
import { Tabs } from 'antd';
import CustomerList from './customers/CustomerList';
import ProductList from './products/ProductList';
import CategoryList from './categories/CategoryList';

export default function MasterDataPage() {
  const [activeKey, setActiveKey] = useState('customers');

  const items = [
    { key: 'customers', label: 'Người mua', children: <CustomerList /> },
    { key: 'products', label: 'Sản phẩm', children: <ProductList /> },
    { key: 'categories', label: 'Danh mục', children: <CategoryList /> },
  ];

  return (
    <Tabs
      activeKey={activeKey}
      onChange={setActiveKey}
      size="small"
      style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
      tabBarStyle={{ marginBottom: 8, flexShrink: 0 }}
      items={items}
      destroyInactiveTabPane
    />
  );
}