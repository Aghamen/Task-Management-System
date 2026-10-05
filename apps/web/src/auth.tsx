import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, type Me } from './api';
import { connectSocket, disconnectSocket } from './socket';

interface AuthState {
  me: Me | null;
  loading: boolean;
  setMe: (me: Me | null) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

// Drop cached data from the previous session but keep the ['me'] query (and its observers) alive.
const notMe = { predicate: (q: { queryKey: readonly unknown[] }) => q.queryKey[0] !== 'me' };

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return (await api.get<{ user: Me }>('/auth/me')).user;
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: Infinity,
    retry: false,
  });
  const me = data ?? null;

  useEffect(() => {
    if (me && !me.isSuperAdmin) {
      const socket = connectSocket();
      const onBoards = () => qc.invalidateQueries({ queryKey: ['boards'] });
      socket.on('boards:changed', onBoards);
      return () => {
        socket.off('boards:changed', onBoards);
      };
    }
    disconnectSocket();
  }, [me, qc]);

  useEffect(() => {
    const onExpired = () => {
      qc.setQueryData(['me'], null);
    };
    window.addEventListener('auth:expired', onExpired);
    return () => window.removeEventListener('auth:expired', onExpired);
  }, [qc]);

  const value: AuthState = {
    me,
    loading: isLoading,
    setMe: (m) => {
      qc.removeQueries(notMe);
      qc.setQueryData(['me'], m);
    },
    logout: async () => {
      await api.post('/auth/logout').catch(() => {});
      disconnectSocket();
      qc.removeQueries(notMe);
      qc.setQueryData(['me'], null);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}

export function useMe(): Me {
  const { me } = useAuth();
  if (!me) throw new Error('Not logged in');
  return me;
}
