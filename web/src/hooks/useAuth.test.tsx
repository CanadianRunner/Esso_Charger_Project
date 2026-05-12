import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAuth, AuthError } from './useAuth';
import { useAuthStore } from '../stores/authStore';

function mockFetch(handler: (url: string, init?: RequestInit) => Promise<Response> | Response) {
  global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(handler(input.toString(), init))
  ) as unknown as typeof fetch;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('useAuth', () => {
  beforeEach(() => {
    useAuthStore.setState({ loaded: false, hasPassword: false, authed: false });
  });

  it('refreshStatus populates the store from /api/auth/status', async () => {
    mockFetch(() => jsonResponse({ authed: true, hasPassword: true }));
    const { result } = renderHook(() => useAuth());
    await act(() => result.current.refreshStatus());
    const s = useAuthStore.getState();
    expect(s.loaded).toBe(true);
    expect(s.hasPassword).toBe(true);
    expect(s.authed).toBe(true);
  });

  it('login on 200 flips authed=true', async () => {
    mockFetch((url) => {
      if (url.endsWith('/api/auth/login')) return jsonResponse({ authed: true });
      return jsonResponse({}, 500);
    });
    const { result } = renderHook(() => useAuth());
    await act(() => result.current.login('pw', false));
    expect(useAuthStore.getState().authed).toBe(true);
  });

  it('login on 401 throws AuthError with humanized message', async () => {
    mockFetch(() => jsonResponse({ error: 'nope' }, 401));
    const { result } = renderHook(() => useAuth());
    await expect(result.current.login('wrong', false)).rejects.toMatchObject({
      name: 'Error',
      status: 401,
      message: 'Wrong password.',
    });
    expect(useAuthStore.getState().authed).toBe(false);
  });

  it('login on 429 surfaces the lockout message', async () => {
    mockFetch(() => jsonResponse({ error: 'locked' }, 429));
    const { result } = renderHook(() => useAuth());
    await expect(result.current.login('pw', false)).rejects.toMatchObject({
      status: 429,
      message: 'Too many failed attempts. Try again in a few minutes.',
    });
  });

  it('setup refreshes status after success so the guard sees password=true', async () => {
    let setupCalled = false;
    mockFetch((url) => {
      if (url.endsWith('/api/auth/setup')) {
        setupCalled = true;
        return jsonResponse({});
      }
      if (url.endsWith('/api/auth/status')) {
        return jsonResponse({ authed: false, hasPassword: setupCalled });
      }
      return jsonResponse({}, 500);
    });
    const { result } = renderHook(() => useAuth());
    await act(() => result.current.setup('new-password'));

    const s = useAuthStore.getState();
    expect(s.loaded).toBe(true);
    expect(s.hasPassword).toBe(true);
    expect(s.authed).toBe(false);
  });

  it('setup on 409 throws "already set"', async () => {
    mockFetch(() => jsonResponse({ error: 'already set' }, 409));
    const { result } = renderHook(() => useAuth());
    await expect(result.current.setup('pw')).rejects.toMatchObject({
      status: 409,
      message: 'An admin password is already set.',
    });
  });

  it('logout flips authed=false', async () => {
    useAuthStore.setState({ loaded: true, hasPassword: true, authed: true });
    mockFetch(() => jsonResponse({}));
    const { result } = renderHook(() => useAuth());
    await act(() => result.current.logout());
    expect(useAuthStore.getState().authed).toBe(false);
  });

  it('AuthError carries the HTTP status for downstream UI decisions', async () => {
    mockFetch(() => jsonResponse({}, 403));
    const { result } = renderHook(() => useAuth());
    let err: unknown;
    try { await result.current.login('pw', false); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(AuthError);
    expect((err as AuthError).status).toBe(403);
  });
});
