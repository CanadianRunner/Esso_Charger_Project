import { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useAuthStore } from '../../stores/authStore';

interface LocationState { from?: string }

export default function AdminLogin() {
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { login, refreshStatus } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const loaded = useAuthStore((s) => s.loaded);
  const hasPassword = useAuthStore((s) => s.hasPassword);
  const authed = useAuthStore((s) => s.authed);

  useEffect(() => {
    if (!loaded) {
      refreshStatus().catch(() => {});
    }
  }, [loaded, refreshStatus]);

  // First-run: no password yet — bounce to setup.
  if (loaded && !hasPassword) return <Navigate to="/admin/setup" replace />;
  // Already authed — go to the destination they tried to hit, or dashboard.
  if (loaded && authed) {
    const dest = (location.state as LocationState | null)?.from ?? '/admin';
    return <Navigate to={dest} replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(password, remember);
      const dest = (location.state as LocationState | null)?.from ?? '/admin';
      navigate(dest, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-neutral-950 text-neutral-100">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-5 rounded-lg border border-neutral-800 bg-neutral-900 p-6 shadow-xl"
      >
        <header>
          <h1 className="text-xl font-semibold">Admin sign in</h1>
          <p className="text-sm text-neutral-400 mt-1">Enter the admin password to manage the pump.</p>
        </header>

        <div>
          <label htmlFor="password" className="block text-xs uppercase tracking-wide text-neutral-400 mb-1">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            autoFocus
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm focus:outline-none focus:border-neutral-500"
            disabled={submitting}
          />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="h-4 w-4 rounded border-neutral-600 bg-neutral-950"
            disabled={submitting}
          />
          <span>Remember this device for 30 days</span>
        </label>

        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting || !password}
          className="w-full rounded bg-neutral-100 px-3 py-2 text-sm font-medium text-neutral-900 hover:bg-white disabled:bg-neutral-700 disabled:text-neutral-400"
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}
