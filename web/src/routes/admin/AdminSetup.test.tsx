import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import AdminSetup from './AdminSetup';
import { useAuthStore } from '../../stores/authStore';

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

function renderSetup() {
  return render(
    <MemoryRouter initialEntries={['/admin/setup']}>
      <Routes>
        <Route path="/admin/setup" element={<AdminSetup />} />
        <Route path="/admin/login" element={<p>login</p>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('AdminSetup', () => {
  beforeEach(() => {
    useAuthStore.setState({ loaded: true, hasPassword: false, authed: false });
  });

  it('renders the setup form', () => {
    mockFetch(() => json({ authed: false, hasPassword: false }));
    renderSetup();
    expect(screen.getByText('First-run setup')).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
  });

  it('redirects to /admin/login when a password is already set', () => {
    useAuthStore.setState({ loaded: true, hasPassword: true, authed: false });
    mockFetch(() => json({ authed: false, hasPassword: true }));
    renderSetup();
    expect(screen.getByText('login')).toBeInTheDocument();
  });

  it('rejects passwords shorter than 8 characters without calling setup', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.fn(() => Promise.resolve(json({})));
    global.fetch = fetchSpy as unknown as typeof fetch;

    renderSetup();
    await user.type(screen.getByLabelText(/^password$/i), 'short');
    await user.type(screen.getByLabelText(/confirm password/i), 'short');
    await user.click(screen.getByRole('button', { name: /set password/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/at least 8/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects mismatched confirmation without calling setup', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.fn(() => Promise.resolve(json({})));
    global.fetch = fetchSpy as unknown as typeof fetch;

    renderSetup();
    await user.type(screen.getByLabelText(/^password$/i), 'longenough123');
    await user.type(screen.getByLabelText(/confirm password/i), 'longenough456');
    await user.click(screen.getByRole('button', { name: /set password/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/do not match/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('navigates to /admin/login on successful setup', async () => {
    const user = userEvent.setup();
    let setupHit = false;
    mockFetch((url) => {
      if (url.endsWith('/api/auth/setup')) { setupHit = true; return json({}); }
      // After setup, the refreshStatus call returns hasPassword=true so the
      // resulting redirect through Navigate works correctly.
      return json({ authed: false, hasPassword: setupHit });
    });

    renderSetup();
    await user.type(screen.getByLabelText(/^password$/i), 'longenough123');
    await user.type(screen.getByLabelText(/confirm password/i), 'longenough123');
    await user.click(screen.getByRole('button', { name: /set password/i }));

    expect(await screen.findByText('login')).toBeInTheDocument();
  });
});
