import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { Avatar, cx, Icon, Popover } from './ui';

export function Logo({ light }: { light?: boolean }) {
  return (
    <span className={cx('flex items-center gap-1.5 text-lg font-bold', light ? 'text-white' : 'text-[#44546f]')}>
      <svg width="20" height="20" viewBox="0 0 32 32" aria-hidden>
        <rect width="32" height="32" rx="6" fill={light ? 'rgba(255,255,255,.3)' : '#0c66e4'} />
        <rect x="7" y="7" width="7" height="17" rx="2" fill="white" />
        <rect x="18" y="7" width="7" height="11" rx="2" fill="white" />
      </svg>
      TaskBoard
    </span>
  );
}

export function Topbar({ transparent, children }: { transparent?: boolean; children?: React.ReactNode }) {
  const { me, logout } = useAuth();
  const navigate = useNavigate();
  if (!me) return null;
  return (
    <header
      className={cx(
        'flex h-12 shrink-0 items-center gap-3 px-3',
        transparent ? 'bg-black/25 text-white backdrop-blur-sm' : 'border-b border-[#091e4224] bg-white',
      )}
    >
      <Link to={me.isSuperAdmin ? '/admin' : '/'} className="rounded px-2 py-1 hover:bg-black/10">
        <Logo light={transparent} />
      </Link>
      {me.isSuperAdmin && (
        <span className="rounded bg-[#e9f2ff] px-2 py-0.5 text-xs font-semibold text-[#0055cc]">Admin panel</span>
      )}
      <div className="flex-1">{children}</div>
      <Popover
        title="Account"
        align="right"
        width={260}
        trigger={(toggle) => (
          <button type="button" onClick={toggle} className="rounded-full p-0.5 hover:ring-2 hover:ring-black/20">
            <Avatar user={me} size={30} />
          </button>
        )}
      >
        {(close) => (
          <div className="text-sm text-[#172b4d]">
            <div className="mb-2 flex items-center gap-2 border-b pb-3">
              <Avatar user={me} size={40} />
              <div className="min-w-0">
                <div className="truncate font-medium">{me.fullName}</div>
                <div className="truncate text-xs text-[#626f86]">{me.email}</div>
              </div>
            </div>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-[#091e420f]"
              onClick={() => {
                close();
                navigate('/profile');
              }}
            >
              <Icon name="user" /> Profile and password
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-[#091e420f]"
              onClick={async () => {
                await logout();
                navigate('/login');
              }}
            >
              <Icon name="logout" /> Log out
            </button>
          </div>
        )}
      </Popover>
    </header>
  );
}
