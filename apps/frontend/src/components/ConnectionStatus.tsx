import { useEffect, useState } from 'react';
import { Alert, Button } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';

/**
 * ConnectionStatus — theo dõi trạng thái kết nối đến backend bằng cách
 * ping /health mỗi 30s. Khi không nhận được phản hồi, hiển thị banner
 * cảnh báo ở đầu trang. Tự ẩn khi kết nối phục hồi.
 */
export default function ConnectionStatus() {
  const [dismissed, setDismissed] = useState(false);

  const healthQuery = useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      const res = await api.get('/health', { timeout: 5000 });
      return res.data;
    },
    refetchInterval: 30_000, // ping mỗi 30s
    retry: 1,
    staleTime: 10_000,
  });

  const isOffline = healthQuery.isError;

  // Reset dismissed khi online lại
  useEffect(() => {
    if (!isOffline) setDismissed(false);
  }, [isOffline]);

  if (!isOffline || dismissed) return null;

  return (
    <Alert
      type="error"
      banner
      showIcon
      message="Mất kết nối đến máy chủ"
      description="Không thể kết nối đến máy chủ. Vui lòng kiểm tra kết nối mạng và thử lại."
      action={
        <Button
          size="small"
          onClick={() => {
            setDismissed(false);
            healthQuery.refetch();
          }}
        >
          Thử lại
        </Button>
      }
      closable
      onClose={() => setDismissed(true)}
    />
  );
}