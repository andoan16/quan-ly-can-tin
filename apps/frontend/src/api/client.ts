import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';

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

// Retry 5xx + network error 1 lần với 500ms delay
let isRetrying = false;

api.interceptors.response.use(
  (res) => res,
  async (err: AxiosError) => {
    const config = err.config as InternalAxiosRequestConfig & { _retried?: boolean };

    // 401 → redirect login (không retry)
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
      return Promise.reject(err);
    }

    // Retry 1 lần cho 5xx hoặc network error (server restart, timeout)
    const is5xx = err.response?.status ? err.response.status >= 500 : false;
    const isNetworkErr = err.code === 'ERR_NETWORK' || err.code === 'ECONNABORTED';
    const shouldRetry = (is5xx || isNetworkErr) && !config._retried && !isRetrying;

    if (shouldRetry) {
      config._retried = true;
      isRetrying = true;
      await new Promise((r) => setTimeout(r, 500));
      isRetrying = false;
      try {
        return await api.request(config);
      } catch (retryErr) {
        return Promise.reject(retryErr);
      }
    }

    // Log error
    if (isNetworkErr) {
      console.error('[API] Lỗi kết nối — không thể kết nối đến server. Kiểm tra server đang chạy.');
    } else {
      console.error('[API] Error:', err.response?.status, err.response?.data || err.message);
    }

    return Promise.reject(err);
  },
);

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
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[devLogin] Failed:', message);
  }
}