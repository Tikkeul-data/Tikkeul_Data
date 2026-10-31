import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { authApi, type AuthUser } from './api';
import { clearToken, getToken, setToken } from './storage';

interface AuthState {
  // loading: 저장된 토큰 확인 중(앱 시작 직후). guest: 비로그인. authenticated: 로그인됨.
  status: 'loading' | 'guest' | 'authenticated';
  user: AuthUser | null;
  token: string | null;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, verifyToken: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading', user: null, token: null });

  // 앱 시작 시 저장된 토큰이 있으면 아직 유효한지 /me 로 확인한다. 만료·폐기됐으면 조용히 비로그인으로 돌아간다.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = await getToken();
      if (!token) {
        if (!cancelled) setState({ status: 'guest', user: null, token: null });
        return;
      }
      try {
        const user = await authApi.me(token);
        if (!cancelled) setState({ status: 'authenticated', user, token });
      } catch {
        await clearToken();
        if (!cancelled) setState({ status: 'guest', user: null, token: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = async (email: string, password: string) => {
    const res = await authApi.login(email, password);
    await setToken(res.access_token);
    setState({ status: 'authenticated', user: res.user, token: res.access_token });
  };

  const signup = async (email: string, password: string, verifyToken: string) => {
    const res = await authApi.signup(email, password, verifyToken);
    await setToken(res.access_token);
    setState({ status: 'authenticated', user: res.user, token: res.access_token });
  };

  const logout = async () => {
    await clearToken();
    setState({ status: 'guest', user: null, token: null });
  };

  const value = useMemo<AuthContextValue>(() => ({ ...state, login, signup, logout }), [state]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
