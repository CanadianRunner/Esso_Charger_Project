import { useCallback } from 'react';
import { useAuthStore } from '../stores/authStore';

export class AuthError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

/**
 * Drives the auth lifecycle on top of the backend `/api/auth/*` endpoints.
 * Updates the auth store as side effects so any consumer (the guard, the
 * dashboard, etc.) reacts automatically.
 */
export function useAuth() {
  const setStatus = useAuthStore((s) => s.setStatus);
  const setAuthed = useAuthStore((s) => s.setAuthed);

  const refreshStatus = useCallback(async () => {
    const res = await fetch('/api/auth/status', { credentials: 'same-origin' });
    if (!res.ok) {
      // Treat any non-2xx here as "we don't know yet" — keep loaded false-ish
      // by not flipping the loaded flag. This stays defensive against transient
      // backend hiccups during page load.
      throw new AuthError('Could not load auth status.', res.status);
    }
    const body: { authed: boolean; hasPassword: boolean } = await res.json();
    setStatus({ authed: body.authed, hasPassword: body.hasPassword });
  }, [setStatus]);

  const login = useCallback(
    async (password: string, rememberDevice: boolean) => {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, rememberDevice }),
        credentials: 'same-origin',
      });
      if (!res.ok) {
        const message =
          res.status === 401 ? 'Wrong password.'
          : res.status === 403 ? 'No admin password is set yet.'
          : res.status === 429 ? 'Too many failed attempts. Try again in a few minutes.'
          : 'Login failed.';
        throw new AuthError(message, res.status);
      }
      setAuthed(true);
    },
    [setAuthed]
  );

  const setup = useCallback(
    async (password: string) => {
      const res = await fetch('/api/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
        credentials: 'same-origin',
      });
      if (!res.ok) {
        const message =
          res.status === 409 ? 'An admin password is already set.'
          : res.status === 400 ? 'Password is required.'
          : 'Setup failed.';
        throw new AuthError(message, res.status);
      }
      // Setup does not log the user in; force a refresh so guards see the
      // new "password set, not authed" state.
      await refreshStatus();
    },
    [refreshStatus]
  );

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'same-origin',
    });
    setAuthed(false);
  }, [setAuthed]);

  return { refreshStatus, login, setup, logout };
}
