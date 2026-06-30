import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getCurrentUser, login as loginRequest, register as registerRequest, type AuthUser, type LoginInput, type RegisterInput } from '../api/auth';
import { AUTH_CHANGED_EVENT, clearAuthToken, getAuthToken, setAuthToken } from '../api/client';

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const resetPersonalCache = useCallback(() => {
    queryClient.clear();
  }, [queryClient]);

  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      const token = getAuthToken();
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const result = await getCurrentUser();
        if (!cancelled) setUser(result.user);
      } catch {
        if (!cancelled) {
          clearAuthToken();
          setUser(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadSession();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function handleAuthChanged() {
      if (!getAuthToken()) {
        resetPersonalCache();
        setUser(null);
      }
    }

    window.addEventListener(AUTH_CHANGED_EVENT, handleAuthChanged);
    return () => window.removeEventListener(AUTH_CHANGED_EVENT, handleAuthChanged);
  }, [resetPersonalCache]);

  const login = useCallback(
    async (input: LoginInput) => {
      const result = await loginRequest(input);
      resetPersonalCache();
      setAuthToken(result.token);
      setUser(result.user);
    },
    [resetPersonalCache],
  );

  const register = useCallback(
    async (input: RegisterInput) => {
      const result = await registerRequest(input);
      resetPersonalCache();
      setAuthToken(result.token);
      setUser(result.user);
    },
    [resetPersonalCache],
  );

  const logout = useCallback(() => {
    resetPersonalCache();
    setUser(null);
    clearAuthToken();
  }, [resetPersonalCache]);

  const value = useMemo(() => ({ user, loading, login, register, logout }), [user, loading, login, register, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
