import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api/v1';

export const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      // Redirect to login instead of auto-re-login with hardcoded credentials
      window.location.href = '/login';
      return Promise.reject(err);
    }
    console.error('[API] Error:', err.response?.status, err.response?.data || err.message);
    return Promise.reject(err);
  }
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