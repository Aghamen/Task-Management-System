import type { ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth';
import { LoginPage } from './pages/Login';
import { BoardsPage } from './pages/Boards';
import { BoardPage } from './pages/Board';
import { ProfilePage } from './pages/Profile';
import { AdminLayout } from './pages/admin/AdminLayout';
import { AdminUsersPage } from './pages/admin/AdminUsers';
import { AdminBoardsPage } from './pages/admin/AdminBoards';
import { Spinner } from './components/ui';

function RequireAuth({ admin, children }: { admin?: boolean; children: ReactNode }) {
  const { me, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Spinner full />;
  if (!me) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (admin && !me.isSuperAdmin) return <Navigate to="/" replace />;
  if (!admin && me.isSuperAdmin) return <Navigate to="/admin" replace />;
  return <>{children}</>;
}

export function App() {
  const { me, loading } = useAuth();
  return (
    <Routes>
      <Route
        path="/login"
        element={loading ? <Spinner full /> : me ? <Navigate to={me.isSuperAdmin ? '/admin' : '/'} replace /> : <LoginPage />}
      />
      <Route path="/" element={<RequireAuth><BoardsPage /></RequireAuth>} />
      <Route path="/b/:boardId" element={<RequireAuth><BoardPage /></RequireAuth>} />
      <Route path="/b/:boardId/c/:cardId" element={<RequireAuth><BoardPage /></RequireAuth>} />
      <Route
        path="/profile"
        element={loading ? <Spinner full /> : me ? <ProfilePage /> : <Navigate to="/login" replace />}
      />
      <Route path="/admin" element={<RequireAuth admin><AdminLayout /></RequireAuth>}>
        <Route index element={<Navigate to="users" replace />} />
        <Route path="users" element={<AdminUsersPage />} />
        <Route path="boards" element={<AdminBoardsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
