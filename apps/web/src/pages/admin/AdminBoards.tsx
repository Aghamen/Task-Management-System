import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, BACKGROUNDS, type AdminBoard, type AdminUser, type BoardRole } from '../../api';
import { Avatar, Button, cx, ErrorText, Field, InlineEdit, Input, Modal, Spinner } from '../../components/ui';
import { RoleSelect } from '../MembersModal';

export function AdminBoardsPage() {
  const qc = useQueryClient();
  const boards = useQuery({
    queryKey: ['admin', 'boards'],
    queryFn: () => api.get<{ boards: AdminBoard[] }>('/admin/boards').then((r) => r.boards),
  });
  const users = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => api.get<{ users: AdminUser[] }>('/admin/users').then((r) => r.users),
  });
  const [creating, setCreating] = useState(false);
  const [managing, setManaging] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin'] });
  const teamUsers = (users.data ?? []).filter((u) => !u.isSuperAdmin && u.isActive);

  const act = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(e);
    }
  };

  const managed = boards.data?.find((b) => b.id === managing);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="flex-1 text-xl font-semibold">Boards</h1>
        <Button variant="primary" onClick={() => setCreating(true)} disabled={teamUsers.length === 0}>
          Create board
        </Button>
      </div>
      {teamUsers.length === 0 && users.data && (
        <p className="rounded bg-[#fff7d6] p-3 text-sm">Create at least one user first — every board needs a board admin.</p>
      )}
      <ErrorText error={boards.error ?? error} />
      {boards.isLoading ? (
        <Spinner />
      ) : boards.data!.length === 0 ? (
        <p className="rounded-lg bg-white p-6 text-center text-sm text-[#626f86] shadow-sm">No boards yet.</p>
      ) : (
        <ul className="space-y-3">
          {boards.data!.map((b) => {
            const admins = b.members.filter((m) => m.role === 'ADMIN');
            return (
              <li key={b.id} className={cx('flex flex-wrap items-center gap-3 rounded-lg bg-white p-3 shadow-sm', b.archivedAt && 'opacity-70')}>
                <span className="h-12 w-16 shrink-0 rounded" style={{ background: b.background }} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-semibold">{b.title}</span>
                    {b.archivedAt && <span className="rounded bg-[#f1f2f4] px-2 py-0.5 text-xs">Closed</span>}
                  </div>
                  <div className="text-xs text-[#626f86]">
                    {b.members.length} member{b.members.length !== 1 && 's'} · {b.listCount} lists · {b.cardCount} cards ·
                    Admin: {admins.length ? admins.map((a) => a.user.fullName).join(', ') : <span className="text-[#c9372c]">none</span>}
                  </div>
                </div>
                <div className="flex -space-x-1.5">
                  {b.members.slice(0, 6).map((m) => (
                    <Avatar key={m.user.id} user={m.user} size={28} />
                  ))}
                </div>
                <div className="flex gap-1">
                  <Button onClick={() => setManaging(b.id)}>Manage</Button>
                  <Button variant="subtle" onClick={() => act(() => api.patch(`/admin/boards/${b.id}`, { archived: !b.archivedAt }))}>
                    {b.archivedAt ? 'Reopen' : 'Close'}
                  </Button>
                  <Button
                    variant="subtle"
                    className="text-[#c9372c]"
                    onClick={() => {
                      if (confirm(`Delete board “${b.title}” with all its lists and cards permanently? This cannot be undone.`)) {
                        act(() => api.del(`/admin/boards/${b.id}`));
                      }
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {creating && <CreateBoard users={teamUsers} onClose={() => setCreating(false)} onSaved={refresh} />}
      {managed && <ManageBoard board={managed} users={teamUsers} onClose={() => setManaging(null)} onChanged={refresh} />}
    </div>
  );
}

function CreateBoard({ users, onClose, onSaved }: { users: AdminUser[]; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState('');
  const [background, setBackground] = useState(BACKGROUNDS[0]);
  const [adminUserId, setAdminUserId] = useState('');
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [error, setError] = useState<unknown>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/admin/boards', { title, background, adminUserId, memberIds });
      onSaved();
      onClose();
    } catch (err) {
      setError(err);
    }
  };

  return (
    <Modal title="Create board" onClose={onClose} width={520}>
      <form onSubmit={submit} className="space-y-4 p-5">
        <div className="flex h-28 items-start justify-center rounded-lg p-3" style={{ background }}>
          <div className="flex gap-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 w-14 rounded bg-white/80" />
            ))}
          </div>
        </div>
        <Field label="Background">
          <div className="grid grid-cols-8 gap-1.5">
            {BACKGROUNDS.map((bg) => (
              <button
                key={bg}
                type="button"
                aria-label="Background"
                onClick={() => setBackground(bg)}
                className={cx('h-8 rounded', background === bg && 'ring-2 ring-[#0c66e4] ring-offset-1')}
                style={{ background: bg }}
              />
            ))}
          </div>
        </Field>
        <Field label="Board title">
          <Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} required />
        </Field>
        <Field label="Board admin (manages members of this board)">
          <select
            value={adminUserId}
            onChange={(e) => setAdminUserId(e.target.value)}
            required
            className="w-full rounded border-2 border-[#091e4224] bg-white px-2 py-1.5 text-sm"
          >
            <option value="">Choose a person…</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.fullName} (@{u.username})
              </option>
            ))}
          </select>
        </Field>
        <div>
          <span className="mb-1 block text-xs font-semibold text-[#44546f]">Members (optional, can be added later)</span>
          <div className="max-h-44 space-y-1 overflow-y-auto rounded border-2 border-[#091e4224] bg-white p-2">
            {users
              .filter((u) => u.id !== adminUserId)
              .map((u) => (
                <label key={u.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="accent-[#0c66e4]"
                    checked={memberIds.includes(u.id)}
                    onChange={(e) => setMemberIds((ids) => (e.target.checked ? [...ids, u.id] : ids.filter((x) => x !== u.id)))}
                  />
                  <Avatar user={u} size={22} /> {u.fullName}
                </label>
              ))}
          </div>
        </div>
        <ErrorText error={error} />
        <div className="flex justify-end gap-2">
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={!title.trim() || !adminUserId}>
            Create board
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ManageBoard({
  board,
  users,
  onClose,
  onChanged,
}: {
  board: AdminBoard;
  users: AdminUser[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState<BoardRole>('MEMBER');
  const [error, setError] = useState<unknown>(null);
  const candidates = users.filter((u) => !board.members.some((m) => m.user.id === u.id));

  const act = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (e) {
      setError(e);
    }
  };

  return (
    <Modal title="Manage board" onClose={onClose} width={600}>
      <div className="space-y-4 p-5">
        <Field label="Title">
          <InlineEdit
            value={board.title}
            onSave={(title) => act(() => api.patch(`/admin/boards/${board.id}`, { title }))}
            className="rounded bg-white px-2 py-1.5 text-sm"
            inputClassName="w-full text-sm"
          />
        </Field>
        <div>
          <span className="mb-1 block text-xs font-semibold text-[#44546f]">Add member</span>
          <div className="flex flex-wrap gap-2">
            <select
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="min-w-0 flex-1 rounded border-2 border-[#091e4224] bg-white px-2 py-1.5 text-sm"
            >
              <option value="">{candidates.length ? 'Choose a person…' : 'All users are members'}</option>
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
                act(async () => {
                  await api.put(`/admin/boards/${board.id}/members/${userId}`, { role });
                  setUserId('');
                })
              }
            >
              Add
            </Button>
          </div>
        </div>
        <ErrorText error={error} />
        <ul className="divide-y divide-[#091e4224]">
          {board.members.map((m) => (
            <li key={m.user.id} className="flex items-center gap-3 py-2">
              <Avatar user={m.user} size={30} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {m.user.fullName} {!m.user.isActive && <span className="text-xs text-[#c9372c]">(deactivated)</span>}
                </div>
                <div className="text-xs text-[#626f86]">@{m.user.username}</div>
              </div>
              <RoleSelect value={m.role} onChange={(r) => act(() => api.put(`/admin/boards/${board.id}/members/${m.user.id}`, { role: r }))} />
              <Button
                variant="subtle"
                onClick={() => {
                  if (confirm(`Remove ${m.user.fullName} from “${board.title}”?`)) {
                    act(() => api.del(`/admin/boards/${board.id}/members/${m.user.id}`));
                  }
                }}
              >
                Remove
              </Button>
            </li>
          ))}
          {board.members.length === 0 && <li className="py-2 text-sm text-[#626f86]">No members.</li>}
        </ul>
        <p className="text-xs text-[#626f86]">
          Admins manage the board's members, Members edit cards, Observers can only view.
        </p>
      </div>
    </Modal>
  );
}
