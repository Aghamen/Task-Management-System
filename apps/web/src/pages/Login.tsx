import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api, type Me } from '../api';
import { useAuth } from '../auth';
import { Logo } from '../components/Topbar';
import { Button, ErrorText, Field, Input } from '../components/ui';

export function LoginPage() {
  const { setMe } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { user } = await api.post<{ user: Me }>('/auth/login', { login, password });
      setMe(user);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(user.isSuperAdmin ? '/admin' : from && from !== '/login' ? from : '/', { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-full flex-col items-center justify-center bg-gradient-to-br from-[#e9f2ff] to-[#f7f8f9] px-4">
      <div className="mb-6 scale-150">
        <Logo />
      </div>
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-lg bg-white p-8 shadow-lg">
        <h1 className="text-center text-base font-semibold text-[#44546f]">Log in to continue</h1>
        <Field label="Username or email">
          <Input autoFocus autoComplete="username" value={login} onChange={(e) => setLogin(e.target.value)} required />
        </Field>
        <Field label="Password">
          <Input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </Field>
        <ErrorText error={error} />
        <Button type="submit" variant="primary" className="w-full py-2" disabled={busy}>
          {busy ? 'Logging in…' : 'Log in'}
        </Button>
        <p className="text-center text-xs text-[#626f86]">Forgot your password? Ask your administrator to reset it.</p>
      </form>
    </div>
  );
}
