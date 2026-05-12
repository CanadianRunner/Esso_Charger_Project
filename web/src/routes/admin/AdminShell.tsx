import { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { useAuth } from '../../hooks/useAuth';

/**
 * Auth guard for the /admin tree. On mount, refreshes status from the backend.
 * Decides:
 *   - status not yet loaded → render a loading placeholder
 *   - no admin password set  → redirect to /admin/setup
 *   - password set, not authed → redirect to /admin/login
 *   - authed → render protected children
 */
export default function AdminShell({ children }: { children: React.ReactNode }) {
  const loaded = useAuthStore((s) => s.loaded);
  const hasPassword = useAuthStore((s) => s.hasPassword);
  const authed = useAuthStore((s) => s.authed);
  const { refreshStatus } = useAuth();
  const location = useLocation();

  useEffect(() => {
    refreshStatus().catch(() => {
      // Swallow — the store stays in unloaded state and the loading view shows.
      // Could be enhanced with a retry-with-backoff later.
    });
  }, [refreshStatus]);

  if (!loaded) {
    return (
      <main className="min-h-screen flex items-center justify-center p-8 bg-neutral-950 text-neutral-300">
        <p className="text-sm">Loading…</p>
      </main>
    );
  }

  if (!hasPassword) {
    return <Navigate to="/admin/setup" replace state={{ from: location.pathname }} />;
  }

  if (!authed) {
    return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}
