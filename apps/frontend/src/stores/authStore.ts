import { create } from 'zustand';
import { UserRole } from '@/types/enums';

interface AuthUser {
  id: string;
  username: string;
  fullName: string;
  role: UserRole;
}

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  setAuth: (token: string, user: AuthState['user']) => void;
  logout: () => void;
}

function safeParseUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem('user');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Validate that parsed object has expected shape
    if (parsed && typeof parsed === 'object' && 'id' in parsed && 'role' in parsed) {
      return parsed as AuthUser;
    }
    localStorage.removeItem('user');
    return null;
  } catch {
    localStorage.removeItem('user');
    return null;
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem('token'),
  user: safeParseUser(),
  setAuth: (token, user) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    set({ token, user });
  },
  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    set({ token: null, user: null });
  },
}));