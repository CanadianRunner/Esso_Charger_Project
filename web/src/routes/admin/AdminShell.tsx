import { useEffect } from 'react';
import { Navigate, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { useAuth } from '../../hooks/useAuth';

/**
 * Auth guard + visible chrome (top bar, nav, logout) for the /admin tree.
 * Nav items beyond Dashboard are placeholders until their phases land.
 */
export default function AdminShell({ children }: { children: React.ReactNode }) {
  const loaded = useAuthStore((s) => s.loaded);
  const hasPassword = useAuthStore((s) => s.hasPassword);
  const authed = useAuthStore((s) => s.authed);
  const { refreshStatus, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    refreshStatus().catch(() => {
      // Swallow — the store stays in unloaded state and the loading view shows.
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

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      navigate('/admin/login', { replace: true });
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col">
      <header className="border-b border-neutral-800 bg-neutral-900">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
          <h1 className="text-sm font-semibold tracking-wide text-neutral-200">
            PumpCharger Admin
          </h1>
          <button
            type="button"
            onClick={handleLogout}
            className="text-xs px-3 py-1.5 rounded border border-neutral-700 text-neutral-300 hover:bg-neutral-800"
          >
            Sign out
          </button>
        </div>
        <nav className="max-w-6xl mx-auto px-6 flex gap-1 text-sm">
          <NavItem to="/admin" label="Dashboard" active />
          <NavItem to="#" label="Sessions" />
          <NavItem to="#" label="Settings" />
          <NavItem to="#" label="Diagnostics" />
        </nav>
      </header>
      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-6">{children}</main>
    </div>
  );
}

function NavItem({ to, label, active = false }: { to: string; label: string; active?: boolean }) {
  if (!active) {
    return (
      <span
        aria-disabled="true"
        className="px-3 py-2 text-neutral-600 cursor-not-allowed select-none"
        title="Coming soon"
      >
        {label}
      </span>
    );
  }
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        `px-3 py-2 border-b-2 ${
          isActive
            ? 'border-amber-400 text-amber-200'
            : 'border-transparent text-neutral-300 hover:text-neutral-100'
        }`
      }
    >
      {label}
    </NavLink>
  );
}
