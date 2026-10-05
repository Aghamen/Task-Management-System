import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Board, type BoardRole, type PublicUser } from '../api';
import { useMe } from '../auth';
import { Avatar, Button, ErrorText, Modal } from '../components/ui';

export const ROLE_LABELS: Record<BoardRole, string> = { ADMIN: 'Admin', MEMBER: 'Member', OBSERVER: 'Observer' };
export const ROLE_HELP: Record<BoardRole, string> = {
  ADMIN: 'Can manage members and close the board',
  MEMBER: 'Can view and edit cards and lists',
  OBSERVER: 'Can only view',
};

export function RoleSelect({
  value,
  onChange,
  disabled,
}: {
  value: BoardRole;
  onChange: (r: BoardRole) => void;
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as BoardRole)}
      className="rounded border-2 border-[#091e4224] bg-white px-2 py-1 text-sm disabled:opacity-60"
    >
      {(Object.keys(ROLE_LABELS) as BoardRole[]).map((r) => (
        <option key={r} value={r} title={ROLE_HELP[r]}>
          {ROLE_LABELS[r]}
        </option>
      ))}
    </select>
  );
}

export function MembersModal({ board, onClose }: { board: Board; onClose: () => void }) {
  const me = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const isAdmin = board.myRole === 'ADMIN';
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState<BoardRole>('MEMBER');
  const [error, setError] = useState<unknown>(null);

  const users = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get<{ users: PublicUser[] }>('/users').then((r) => r.users),
    enabled: isAdmin,
  });
  const candidates = (users.data ?? []).filter((u) => !board.members.some((m) => m.user.id === u.id));

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      await qc.invalidateQueries({ queryKey: ['board', board.id] });
    } catch (e) {
      setError(e);
    }
  };

  return (
    <Modal title="Board members" onClose={onClose} width={560}>
      <div className="space-y-4 p-5">
        {isAdmin && (
          <div className="flex flex-wrap gap-2">
            <select
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="min-w-0 flex-1 rounded border-2 border-[#091e4224] bg-white px-2 py-1.5 text-sm"
            >
              <option value="">{candidates.length ? 'Choose a person to add…' : 'Everyone is already on this board'}</option>
              {candidates.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName} (@{u.username})
                </option>
              ))}
            </select>
            <RoleSelect value={role} onChange={setRole} />
            <Button
              variant="primary"
              disabled={!userId}
              onClick={() =>
                run(async () => {
                  await api.post(`/boards/${board.id}/members`, { userId, role });
                  setUserId('');
                })
              }
            >
              Add
            </Button>
          </div>
        )}
        <ErrorText error={error} />
        <ul className="divide-y divide-[#091e4224]">
          {board.members.map((m) => (
            <li key={m.user.id} className="flex items-center gap-3 py-2">
              <Avatar user={m.user} size={32} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {m.user.fullName} {m.user.id === me.id && <span className="text-[#626f86]">(you)</span>}
                </div>
                <div className="truncate text-xs text-[#626f86]">@{m.user.username}</div>
              </div>
              {isAdmin ? (
                <RoleSelect
                  value={m.role}
                  onChange={(r) => run(() => api.patch(`/boards/${board.id}/members/${m.user.id}`, { role: r }))}
                />
              ) : (
                <span className="text-sm text-[#44546f]">{ROLE_LABELS[m.role]}</span>
              )}
              {isAdmin && m.user.id !== me.id && (
                <Button
                  variant="subtle"
                  onClick={() => {
                    if (confirm(`Remove ${m.user.fullName} from this board?`)) {
                      run(() => api.del(`/boards/${board.id}/members/${m.user.id}`));
                    }
                  }}
                >
                  Remove
                </Button>
              )}
              {m.user.id === me.id && (
                <Button
                  variant="subtle"
                  onClick={() => {
                    if (confirm('Leave this board? You will lose access until an admin adds you again.')) {
                      run(async () => {
                        await api.del(`/boards/${board.id}/members/${me.id}`);
                        qc.invalidateQueries({ queryKey: ['boards'] });
                        navigate('/');
                      });
                    }
                  }}
                >
                  Leave
                </Button>
              )}
            </li>
          ))}
        </ul>
        {!isAdmin && <p className="text-xs text-[#626f86]">Only board admins can add or remove members.</p>}
      </div>
    </Modal>
  );
}
