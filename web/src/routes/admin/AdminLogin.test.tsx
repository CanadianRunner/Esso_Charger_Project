import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import AdminLogin from './AdminLogin';
import { useAuthStore } from '../../stores/authStore';

vi.mock('@testing-library/user-event', async () => {
  const actual = await vi.importActual<typeof import('@testing-library/user-event')>(
    '@testing-library/user-event'
  );
  return actual;
});

interface FetchHandler {
  (url: string, init?: RequestInit): Response | Promise<Response>;
}

function mockFetch(handler: FetchHandler) {
  global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(handler(input.toString(), init))
  ) as unknown as typeof fetch;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/admin/login']}>
      <Routes>
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin" element={<p>dashboard</p>} />
        <Route path="/admin/setup" element={<p>setup</p>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('AdminLogin', () => {
  beforeEach(() => {
    useAuthStore.setState({ loaded: true, hasPassword: true, authed: false });
  });

  it('renders the sign-in form fields', () => {
    mockFetch(() => json({ authed: false, hasPassword: true }));
    renderLogin();
    expect(screen.getByText('Admin sign in')).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('redirects to /admin/setup when the server reports no password yet', () => {
    useAuthStore.setState({ loaded: true, hasPassword: false, authed: false });
    mockFetch(() => json({ authed: false, hasPassword: false }));
    renderLogin();
    expect(screen.getByText('setup')).toBeInTheDocument();
  });

  it('redirects to /admin when already authed', () => {
    useAuthStore.setState({ loaded: true, hasPassword: true, authed: true });
    mockFetch(() => json({ authed: true, hasPassword: true }));
    renderLogin();
    expect(screen.getByText('dashboard')).toBeInTheDocument();
  });

  it('submits the password and navigates to the dashboard on success', async () => {
    const user = userEvent.setup();
    mockFetch((url) => {
      if (url.endsWith('/api/auth/login')) return json({ authed: true });
      return json({ authed: false, hasPassword: true });
    });

    renderLogin();
    await user.type(screen.getByLabelText(/password/i), 'pw');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText('dashboard')).toBeInTheDocument();
  });

  it('shows the wrong-password message on 401 without navigating', async () => {
    const user = userEvent.setup();
    mockFetch(() => json({ error: 'nope' }, 401));

    renderLogin();
    await user.type(screen.getByLabelText(/password/i), 'wrong');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/wrong password/i);
    expect(screen.queryByText('dashboard')).not.toBeInTheDocument();
  });

  it('surfaces the lockout message on 429', async () => {
    const user = userEvent.setup();
    mockFetch(() => json({ error: 'locked' }, 429));

    renderLogin();
    await user.type(screen.getByLabelText(/password/i), 'pw');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/too many failed attempts/i);
    });
  });
});
