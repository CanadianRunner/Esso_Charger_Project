import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useAuthStore } from '../../stores/authStore';

const MIN_PASSWORD_LENGTH = 8;

export default function AdminSetup() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { setup, refreshStatus } = useAuth();
  const navigate = useNavigate();
  const loaded = useAuthStore((s) => s.loaded);
  const hasPassword = useAuthStore((s) => s.hasPassword);

  useEffect(() => {
    if (!loaded) {
      refreshStatus().catch(() => {});
    }
  }, [loaded, refreshStatus]);

  // Password already set — redirect away so /admin/setup isn't a back-door
  // to overwriting credentials.
  if (loaded && hasPassword) return <Navigate to="/admin/login" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      await setup(password);
      navigate('/admin/login', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed.');
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
          <h1 className="text-xl font-semibold">First-run setup</h1>
          <p className="text-sm text-neutral-400 mt-1">
            Pick an admin password. You'll use it to sign in to the admin pages.
          </p>
        </header>

        <div>
          <label htmlFor="password" className="block text-xs uppercase tracking-wide text-neutral-400 mb-1">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            autoFocus
            required
            minLength={MIN_PASSWORD_LENGTH}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm focus:outline-none focus:border-neutral-500"
            disabled={submitting}
          />
        </div>

        <div>
          <label htmlFor="confirm" className="block text-xs uppercase tracking-wide text-neutral-400 mb-1">
            Confirm password
          </label>
          <input
            id="confirm"
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm focus:outline-none focus:border-neutral-500"
            disabled={submitting}
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting || !password || !confirm}
          className="w-full rounded bg-neutral-100 px-3 py-2 text-sm font-medium text-neutral-900 hover:bg-white disabled:bg-neutral-700 disabled:text-neutral-400"
        >
          {submitting ? 'Saving…' : 'Set password'}
        </button>
      </form>
    </main>
  );
}
