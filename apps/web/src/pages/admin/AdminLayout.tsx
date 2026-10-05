import { NavLink, Outlet } from 'react-router-dom';
import { Topbar } from '../../components/Topbar';
import { cx, Icon } from '../../components/ui';

export function AdminLayout() {
  const tab = ({ isActive }: { isActive: boolean }) =>
    cx(
      'flex items-center gap-2 rounded px-3 py-2 text-sm font-medium',
      isActive ? 'bg-[#e9f2ff] text-[#0c66e4]' : 'text-[#44546f] hover:bg-[#091e420f]',
    );
  return (
    <div className="flex min-h-full flex-col">
      <Topbar />
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 md:flex-row">
        <nav className="flex shrink-0 gap-1 md:w-48 md:flex-col">
          <NavLink to="/admin/users" className={tab}>
            <Icon name="users" /> Users
          </NavLink>
          <NavLink to="/admin/boards" className={tab}>
            <Icon name="card" /> Boards
          </NavLink>
        </nav>
        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
