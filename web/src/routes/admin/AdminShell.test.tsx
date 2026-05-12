import { render, screen, waitFor } from '@testing-library/react';
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
        <Route
          path="/admin/*"
          element={
            <AdminShell>
              <p>dashboard content</p>
            </AdminShell>
          }
        />
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
});
