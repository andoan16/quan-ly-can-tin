import { useState } from 'react';
import { Tabs } from 'antd';
import DailySalesTab from './DailySalesTab';
import ProductSalesTab from './ProductSalesTab';

export default function SalesReportPage() {
  const [tab, setTab] = useState('product');

  return (
    <Tabs
      activeKey={tab}
      onChange={setTab}
      size="small"
      tabBarStyle={{ marginBottom: 8 }}
      items={[
        { key: 'product', label: 'Theo sản phẩm', children: <ProductSalesTab /> },
        { key: 'daily', label: 'Theo ngày', children: <DailySalesTab /> },
      ]}
    />
  );
}