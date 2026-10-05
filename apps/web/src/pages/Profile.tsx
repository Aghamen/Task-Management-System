import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { api, AVATAR_COLORS, type Me } from '../api';
import { useMe } from '../auth';
import { Topbar } from '../components/Topbar';
import { Avatar, Button, cx, ErrorText, Field, Icon, Input } from '../components/ui';

export function ProfilePage() {
  const me = useMe();
  const qc = useQueryClient();
  const [fullName, setFullName] = useState(me.fullName);
  const [avatarColor, setAvatarColor] = useState(me.avatarColor);
  const [profileMsg, setProfileMsg] = useState<unknown>(null);

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pwMsg, setPwMsg] = useState<unknown>(null);
  const [pwOk, setPwOk] = useState(false);

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const { user } = await api.patch<{ user: Me }>('/auth/me', { fullName, avatarColor });
      qc.setQueryData(['me'], user);
      setProfileMsg('Saved');
    } catch (err) {
      setProfileMsg(err);
    }
  };

  const changePassword = async (e: FormEvent) => {
    e.preventDefault();
    setPwOk(false);
    if (next !== confirm) return setPwMsg(new Error('New passwords do not match'));
    try {
      await api.post('/auth/password', { currentPassword: current, newPassword: next });
      setPwMsg(null);
      setPwOk(true);
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (err) {
      setPwMsg(err);
    }
  };

  return (
    <div className="flex min-h-full flex-col">
      <Topbar />
      <main className="mx-auto w-full max-w-lg space-y-6 px-4 py-8">
        <Link to={me.isSuperAdmin ? '/admin' : '/'} className="inline-flex items-center gap-1 text-sm text-[#0c66e4]">
          <Icon name="back" /> Back
        </Link>
        <form onSubmit={saveProfile} className="space-y-4 rounded-lg bg-white p-6 shadow-sm">
          <h1 className="text-lg font-semibold">Profile</h1>
          <div className="flex items-center gap-3">
            <Avatar user={{ ...me, fullName, avatarColor }} size={56} />
            <div className="text-sm text-[#626f86]">
              <div>@{me.username}</div>
              <div>{me.email}</div>
            </div>
          </div>
          <Field label="Full name">
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          </Field>
          <div>
            <span className="mb-1 block text-xs font-semibold text-[#44546f]">Avatar color</span>
            <div className="flex flex-wrap gap-2">
              {AVATAR_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={c}
                  onClick={() => setAvatarColor(c)}
                  className={cx('h-8 w-8 rounded-full', avatarColor === c && 'ring-2 ring-[#0c66e4] ring-offset-2')}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>
          {typeof profileMsg === 'string' ? (
            <p className="text-sm text-[#1f845a]">{profileMsg}</p>
          ) : (
            <ErrorText error={profileMsg} />
          )}
          <Button type="submit" variant="primary">
            Save
          </Button>
        </form>

        <form onSubmit={changePassword} className="space-y-4 rounded-lg bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Change password</h2>
          <Field label="Current password">
            <Input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
          </Field>
          <Field label="New password (min 8 characters)">
            <Input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={8} />
          </Field>
          <Field label="Confirm new password">
            <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          </Field>
          <ErrorText error={pwMsg} />
          {pwOk && <p className="text-sm text-[#1f845a]">Password changed. Other devices have been logged out.</p>}
          <Button type="submit" variant="primary">
            Change password
          </Button>
        </form>
      </main>
    </div>
  );
}
