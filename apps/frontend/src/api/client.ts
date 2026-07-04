import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { message as antdMessage } from 'antd';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api/v1';

export const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30_000, // 30s timeout — chống treo vô hạn khi server không phản hồi
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ── Retry logic ────────────────────────────────────────────────
// Retry tối đa 3 lần cho network error / 5xx, với exponential backoff (1s, 2s, 4s)
const MAX_RETRIES = 3;
const BACKOFF_BASE_MS = 1000;

interface RetryConfig extends InternalAxiosRequestConfig {
  _retryCount?: number;
}

let offlineNotificationShown = false;

function isRetryableError(err: AxiosError): boolean {
  // Network error (không có response — server chết, mất mạng, DNS fail)
  if (err.code === 'ERR_NETWORK' || err.code === 'ECONNABORTED') return true;
  // 5xx — server error tạm thời
  if (err.response?.status && err.response.status >= 500) return true;
  return false;
}

api.interceptors.response.use(
  (res) => {
    // Nếu đã online lại, xoá thông báo offline
    if (offlineNotificationShown) {
      antdMessage.destroy('offline');
      offlineNotificationShown = false;
    }
    return res;
  },
  async (err: AxiosError) => {
    const config = err.config as RetryConfig;
    const retryCount = config?._retryCount ?? 0;

    // 401 → xoá token, không redirect (app không có route /login)
    // React Query sẽ tự retry khi token mới được set bởi devLogin
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      return Promise.reject(err);
    }

    // Retry nếu có thể và chưa vượt quá giới hạn
    if (isRetryableError(err) && retryCount < MAX_RETRIES) {
      config._retryCount = retryCount + 1;
      const delay = BACKOFF_BASE_MS * Math.pow(2, retryCount); // 1s, 2s, 4s

      // Hiển thị thông báo mất kết nối (chỉ 1 lần)
      if (!offlineNotificationShown && err.code === 'ERR_NETWORK') {
        offlineNotificationShown = true;
        antdMessage.open({
          key: 'offline',
          type: 'warning',
          content: 'Không thể kết nối đến máy chủ. Đang thử lại...',
          duration: 0, // không tự tắt
        });
      }

      await new Promise((r) => setTimeout(r, delay));
      try {
        const res = await api.request(config);
        if (offlineNotificationShown) {
          antdMessage.destroy('offline');
          offlineNotificationShown = false;
        }
        return res;
      } catch (retryErr) {
        // Nếu retry cuối vẫn fail, propagate error
        return Promise.reject(retryErr);
      }
    }

    // Hết retry — hiện thông báo rõ ràng
    if (isRetryableError(err)) {
      if (offlineNotificationShown) {
        antdMessage.destroy('offline');
        offlineNotificationShown = false;
      }
      antdMessage.error({
        content: 'Mất kết nối đến máy chủ. Vui lòng kiểm tra mạng và thử lại.',
        duration: 5,
      });
    }

    return Promise.reject(err);
  },
);

// ── Error message helper ───────────────────────────────────────
// Chuẩn hoá error message cho UI — ưu tiên message từ server, fallback theo loại lỗi
export function getApiErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const axiosErr = err as AxiosError<{ message?: string }>;
    // Server trả message rõ ràng
    const serverMsg = axiosErr.response?.data?.message;
    if (serverMsg) return serverMsg;

    // Network error — không có response
    if (axiosErr.code === 'ERR_NETWORK' || axiosErr.code === 'ECONNABORTED') {
      return 'Không thể kết nối đến máy chủ. Vui lòng kiểm tra kết nối mạng.';
    }

    // Timeout
    if (axiosErr.code === 'ECONNABORTED') {
      return 'Yêu cầu hết thời gian chờ. Vui lòng thử lại.';
    }

    // Other HTTP errors
    if (axiosErr.response?.status) {
      const status = axiosErr.response.status;
      if (status === 403) return 'Bạn không có quyền thực hiện thao tác này.';
      if (status === 404) return 'Không tìm thấy dữ liệu.';
      if (status >= 500) return 'Máy chủ gặp lỗi. Vui lòng thử lại sau.';
    }
  }
  return fallback;
}

// Development-only login helper - NOT available in production builds
export async function devLogin() {
  if (!import.meta.env.DEV) {
    console.warn('[devLogin] Only available in development mode');
    return;
  }
  const username = import.meta.env.VITE_DEV_USER || 'admin';
  const password = import.meta.env.VITE_DEV_PASSWORD || 'admin';
  localStorage.removeItem('token');
  try {
    const res = await api.post('/auth/login', { username, password });
    const token = res.data?.data?.token;
    if (token) {
      localStorage.setItem('token', token);
      console.log('[devLogin] Success, token saved');
    } else {
      console.error('[devLogin] No token in response:', res.data);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[devLogin] Failed:', msg);
  }
}