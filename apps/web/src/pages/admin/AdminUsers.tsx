import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { api, type AdminUser } from '../../api';
import { Avatar, Button, ErrorText, Field, generatePassword, Input, Modal, Spinner } from '../../components/ui';

export function AdminUsersPage() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => api.get<{ users: AdminUser[] }>('/admin/users').then((r) => r.users),
  });
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [resetting, setResetting] = useState<AdminUser | null>(null);
  const [search, setSearch] = useState('');
  const [actionError, setActionError] = useState<unknown>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin'] });

  const users = (data ?? []).filter((u) =>
    `${u.fullName} ${u.username} ${u.email}`.toLowerCase().includes(search.trim().toLowerCase()),
  );

  const act = async (fn: () => Promise<unknown>) => {
    setActionError(null);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setActionError(e);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="flex-1 text-xl font-semibold">Users</h1>
        <Input className="max-w-xs" placeholder="Search users…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Button variant="primary" onClick={() => setCreating(true)}>
          Create user
        </Button>
      </div>
      <ErrorText error={error ?? actionError} />
      {isLoading ? (
        <Spinner />
      ) : (
        <div className="overflow-x-auto rounded-lg bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b text-left text-xs uppercase text-[#626f86]">
              <tr>
                <th className="p-3">Name</th>
                <th className="p-3">Username</th>
                <th className="hidden p-3 md:table-cell">Email</th>
                <th className="p-3">Boards</th>
                <th className="p-3">Status</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {users.map((u) => (
                <tr key={u.id} className={u.isActive ? '' : 'bg-[#f7f8f9] text-[#626f86]'}>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <Avatar user={u} size={28} />
                      <div>
                        <div className="font-medium">{u.fullName}</div>
                        <div className="text-xs text-[#626f86]">since {format(new Date(u.createdAt), 'MMM d, yyyy')}</div>
                      </div>
                    </div>
                  </td>
                  <td className="p-3">@{u.username}</td>
                  <td className="hidden p-3 md:table-cell">{u.email}</td>
                  <td className="p-3">{u.isSuperAdmin ? '—' : u.boardCount}</td>
                  <td className="p-3">
                    {u.isSuperAdmin ? (
                      <span className="rounded bg-[#e9f2ff] px-2 py-0.5 text-xs font-semibold text-[#0055cc]">Super admin</span>
                    ) : u.isActive ? (
                      <span className="rounded bg-[#dcfff1] px-2 py-0.5 text-xs font-semibold text-[#216e4e]">Active</span>
                    ) : (
                      <span className="rounded bg-[#ffeceb] px-2 py-0.5 text-xs font-semibold text-[#ae2e24]">Deactivated</span>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap justify-end gap-1">
                      <Button variant="subtle" onClick={() => setEditing(u)}>
                        Edit
                      </Button>
                      <Button variant="subtle" onClick={() => setResetting(u)}>
                        Reset password
                      </Button>
                      {!u.isSuperAdmin && (
                        <>
                          <Button
                            variant="subtle"
                            onClick={() => act(() => api.patch(`/admin/users/${u.id}`, { isActive: !u.isActive }))}
                          >
                            {u.isActive ? 'Deactivate' : 'Activate'}
                          </Button>
                          <Button
                            variant="subtle"
                            className="text-[#c9372c]"
                            onClick={() => {
                              if (
                                confirm(
                                  `Delete ${u.fullName} permanently? Their comments will show as “Deleted user”. Consider deactivating instead.`,
                                )
                              ) {
                                act(() => api.del(`/admin/users/${u.id}`));
                              }
                            }}
                          >
                            Delete
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {creating && <UserForm onClose={() => setCreating(false)} onSaved={refresh} />}
      {editing && <UserForm user={editing} onClose={() => setEditing(null)} onSaved={refresh} />}
      {resetting && <ResetPassword user={resetting} onClose={() => setResetting(null)} />}
    </div>
  );
}

function UserForm({ user, onClose, onSaved }: { user?: AdminUser; onClose: () => void; onSaved: () => void }) {
  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [username, setUsername] = useState(user?.username ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [password, setPassword] = useState(user ? '' : generatePassword());
  const [error, setError] = useState<unknown>(null);
  const [created, setCreated] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      if (user) {
        await api.patch(`/admin/users/${user.id}`, { fullName, username, email });
        onSaved();
        onClose();
      } else {
        await api.post('/admin/users', { fullName, username, email, password });
        onSaved();
        setCreated(true);
      }
    } catch (err) {
      setError(err);
    }
  };

  if (created) {
    return (
      <Modal title="User created" onClose={onClose}>
        <div className="space-y-3 p-5 text-sm">
          <p>Send these login details to {fullName}:</p>
          <CredentialsBox lines={[`Username: ${username.toLowerCase()}`, `Email: ${email.toLowerCase()}`, `Password: ${password}`, `Login: ${location.origin}/login`]} />
          <p className="text-xs text-[#626f86]">They can change their password after logging in (Profile → Change password).</p>
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={user ? 'Edit user' : 'Create user'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3 p-5">
        <Field label="Full name">
          <Input autoFocus value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        </Field>
        <Field label="Username (letters, numbers, . _ -)">
          <Input value={username} onChange={(e) => setUsername(e.target.value)} required minLength={3} maxLength={32} />
        </Field>
        <Field label="Email">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        {!user && (
          <Field label="Initial password (min 8 characters)">
            <div className="flex gap-2">
              <Input value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
              <Button onClick={() => setPassword(generatePassword())}>Generate</Button>
            </div>
          </Field>
        )}
        <ErrorText error={error} />
        <div className="flex justify-end gap-2">
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary">
            {user ? 'Save' : 'Create user'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ResetPassword({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const [password, setPassword] = useState(generatePassword());
  const [error, setError] = useState<unknown>(null);
  const [done, setDone] = useState(false);

  return (
    <Modal title={`Reset password — ${user.fullName}`} onClose={onClose}>
      <div className="space-y-3 p-5 text-sm">
        {done ? (
          <>
            <p>Password changed. {user.isSuperAdmin ? '' : 'The user has been logged out everywhere.'} Send them:</p>
            <CredentialsBox lines={[`Username: ${user.username}`, `Password: ${password}`]} />
            <Button variant="primary" onClick={onClose}>
              Done
            </Button>
          </>
        ) : (
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await api.post(`/admin/users/${user.id}/password`, { password });
                setDone(true);
              } catch (err) {
                setError(err);
              }
            }}
          >
            <Field label="New password (min 8 characters)">
              <div className="flex gap-2">
                <Input value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
                <Button onClick={() => setPassword(generatePassword())}>Generate</Button>
              </div>
            </Field>
            <ErrorText error={error} />
            <div className="flex justify-end gap-2">
              <Button variant="subtle" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" variant="primary">
                Set password
              </Button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
}

function CredentialsBox({ lines }: { lines: string[] }) {
  const text = lines.join('\n');
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-2">
      <pre className="whitespace-pre-wrap rounded bg-white p-3 font-mono text-xs">{text}</pre>
      <Button
        onClick={() =>
          navigator.clipboard?.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          })
        }
      >
        {copied ? 'Copied!' : 'Copy'}
      </Button>
    </div>
  );
}
