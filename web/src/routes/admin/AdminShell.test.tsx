import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import AdminShell from './AdminShell';
import { useAuthStore } from '../../stores/authStore';

function mockFetch(body: { authed: boolean; hasPassword: boolean }) {
  global.fetch = vi.fn(() =>
    Promise.resolve(new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
  ) as unknown as typeof fetch;
}

function renderShellAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin/login" element={<p>login page</p>} />
        <Route path="/admin/setup" element={<p>setup page</p>} />
        <Route path="/admin" element={<AdminShell />}>
          <Route index element={<p>dashboard content</p>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe('AdminShell', () => {
  beforeEach(() => {
    useAuthStore.setState({ loaded: false, hasPassword: false, authed: false });
  });

  it('shows a loading view until the first status call resolves', () => {
    mockFetch({ authed: false, hasPassword: false });
    renderShellAt('/admin');
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('redirects to /admin/setup when no admin password is set', async () => {
    mockFetch({ authed: false, hasPassword: false });
    renderShellAt('/admin');
    expect(await screen.findByText('setup page')).toBeInTheDocument();
  });

  it('redirects to /admin/login when a password is set but the user is not authed', async () => {
    mockFetch({ authed: false, hasPassword: true });
    renderShellAt('/admin');
    expect(await screen.findByText('login page')).toBeInTheDocument();
  });

  it('renders the protected children when authed', async () => {
    mockFetch({ authed: true, hasPassword: true });
    renderShellAt('/admin');
    expect(await screen.findByText('dashboard content')).toBeInTheDocument();
  });

  it('keeps showing the loading view when the status call fails', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve(new Response('{}', { status: 500 }))
    ) as unknown as typeof fetch;
    renderShellAt('/admin');
    // No throw, no redirect — just stays on the loading screen.
    await waitFor(() => {
      expect(screen.getByText('Loading…')).toBeInTheDocument();
    });
  });

  it('renders chrome (title, sign-out button, nav) when authed', async () => {
    mockFetch({ authed: true, hasPassword: true });
    renderShellAt('/admin');
    await screen.findByText('dashboard content');
    expect(screen.getByText('PumpCharger Admin')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
  });

  it('disables nav items that are not yet implemented', async () => {
    mockFetch({ authed: true, hasPassword: true });
    renderShellAt('/admin');
    await screen.findByText('dashboard content');
    for (const label of ['Diagnostics']) {
      const el = screen.getByText(label);
      expect(el).toHaveAttribute('aria-disabled', 'true');
    }
  });

  it('exposes Dashboard and Sessions as active nav links', async () => {
    mockFetch({ authed: true, hasPassword: true });
    renderShellAt('/admin');
    await screen.findByText('dashboard content');
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/admin');
    expect(screen.getByRole('link', { name: 'Sessions' })).toHaveAttribute('href', '/admin/sessions');
  });

  it('Sessions nav preserves the current filter querystring when staying in the sessions context', async () => {
    mockFetch({ authed: true, hasPassword: true });
    render(
      <MemoryRouter initialEntries={['/admin/sessions?merged=true&page=2']}>
        <Routes>
          <Route path="/admin" element={<AdminShell />}>
            <Route index element={<p>dashboard content</p>} />
            <Route path="sessions" element={<p>sessions list</p>} />
            <Route path="sessions/:id" element={<p>detail page</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );
    await screen.findByText('sessions list');
    expect(screen.getByRole('link', { name: 'Sessions' }))
      .toHaveAttribute('href', '/admin/sessions?merged=true&page=2');
  });

  it('Sessions nav drops querystring when outside the sessions context', async () => {
    mockFetch({ authed: true, hasPassword: true });
    renderShellAt('/admin');
    await screen.findByText('dashboard content');
    expect(screen.getByRole('link', { name: 'Sessions' })).toHaveAttribute('href', '/admin/sessions');
  });

  it('signs the user out and routes to /admin/login on click', async () => {
    const fetchCalls: string[] = [];
    global.fetch = vi.fn((url: RequestInfo | URL) => {
      const u = url.toString();
      fetchCalls.push(u);
      if (u.endsWith('/api/auth/logout')) {
        useAuthStore.setState({ authed: false });
        return Promise.resolve(new Response('{}', { status: 200 }));
      }
      // status call: first returns authed; subsequent returns unauthed.
      const authed = !fetchCalls.includes('/api/auth/logout');
      return Promise.resolve(
        new Response(JSON.stringify({ authed, hasPassword: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );
    }) as unknown as typeof fetch;

    const user = userEvent.setup();
    renderShellAt('/admin');
    await screen.findByText('dashboard content');
    await user.click(screen.getByRole('button', { name: /sign out/i }));

    expect(await screen.findByText('login page')).toBeInTheDocument();
    expect(fetchCalls).toContain('/api/auth/logout');
  });
});
