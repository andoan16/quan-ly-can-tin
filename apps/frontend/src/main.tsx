import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfigProvider } from 'antd';
import viVN from 'antd/locale/vi_VN';
import App from './App';
import './print.css';
import './table-flex.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, retry: 1 },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>
    <ConfigProvider
      locale={viVN}
      theme={{
        token: {
          borderRadius: 0,
          controlHeight: 42,
          controlHeightSM: 34,
          motionDurationFast: '0.01s',
          motionDurationMid: '0.01s',
          motionDurationSlow: '0.01s',
        },
      }}
    >
      <App />
    </ConfigProvider>
  </QueryClientProvider>
);
