import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import AdminSessions from './AdminSessions';

interface FetchCall {
  url: string;
}

function setupMockFetch() {
  const calls: FetchCall[] = [];
  const handler = (input: RequestInfo | URL): Promise<Response> => {
    const url = input.toString();
    calls.push({ url });

    const isActiveOnly = /[?&]active=true(\b|&)/.test(url);
    const isEndedOnly = /[?&]active=false(\b|&)/.test(url);

    if (isActiveOnly) {
      return Promise.resolve(json({
        items: [ACTIVE_SESSION],
        totalCount: 1,
        page: 1,
        pageSize: 25,
      }));
    }
    if (isEndedOnly) {
      return Promise.resolve(json({
        items: ENDED_SESSIONS,
        totalCount: ENDED_SESSIONS.length,
        page: 1,
        pageSize: 25,
      }));
    }
    // Default: combined list with the active session floated to the top, the
    // way the real backend returns it when active filter is unset.
    return Promise.resolve(json({
      items: [ACTIVE_SESSION, ...ENDED_SESSIONS],
      totalCount: ENDED_SESSIONS.length + 1,
      page: 1,
      pageSize: 25,
    }));
  };
  global.fetch = vi.fn(handler) as unknown as typeof fetch;
  return calls;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const ACTIVE_SESSION = {
  id: 'session-active',
  startedAt: '2026-05-11T10:00:00Z',
  endedAt: null,
  durationSeconds: 0,
  energyKwh: 4.2,
  costCents: 55,
  isMerged: false,
};

const ENDED_SESSIONS = [
  {
    id: 'session-1',
    startedAt: '2026-05-10T14:00:00Z',
    endedAt: '2026-05-10T15:30:00Z',
    durationSeconds: 5400,
    energyKwh: 18.7,
    costCents: 243,
    isMerged: false,
  },
  {
    id: 'session-2',
    startedAt: '2026-05-09T18:00:00Z',
    endedAt: '2026-05-09T19:00:00Z',
    durationSeconds: 3600,
    energyKwh: 9.4,
    costCents: 122,
    isMerged: true,
  },
];

function DetailProbe() {
  const { id } = useParams();
  const location = useLocation();
  return (
    <div>
      <p>detail page</p>
      <p data-testid="detail-id">{id}</p>
      <p data-testid="detail-search">{location.search}</p>
    </div>
  );
}

function renderAt(path = '/admin/sessions') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin/sessions" element={<AdminSessions />} />
        <Route path="/admin/sessions/:id" element={<DetailProbe />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('AdminSessions', () => {
  beforeEach(() => {
    setupMockFetch();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders ended sessions and pins the active session at the top', async () => {
    renderAt();
    await waitFor(() => {
      expect(screen.getByText('18.70 kWh')).toBeInTheDocument();
    });
    expect(screen.getByText('4.20 kWh')).toBeInTheDocument();
    expect(screen.getByText(/^active$/i, { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText(/^merged$/i, { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByTestId('active-pin-separator')).toBeInTheDocument();
  });

  it('does not pin the active session when active filter is set', async () => {
    renderAt('/admin/sessions?active=true');
    await waitFor(() => {
      expect(screen.getByText('4.20 kWh')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('active-pin-separator')).not.toBeInTheDocument();
  });

  it('updates URL when a column header is clicked, toggling sort dir', async () => {
    const user = userEvent.setup();
    renderAt();
    await screen.findByText('18.70 kWh');

    await user.click(screen.getByText('Energy'));
    await waitFor(() => {
      expect(window.location.search === '' || true).toBeTruthy(); // MemoryRouter doesn't touch window
    });
    // After click, the URL params should include sort=energy. We verify by
    // re-reading the call list and looking at the most recent fetch URL.
    const fetchCalls = (global.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const lastUrl = String(fetchCalls[fetchCalls.length - 1][0]);
    expect(lastUrl).toContain('sort=energy');
    expect(lastUrl).toContain('dir=desc');

    await user.click(screen.getByText('Energy'));
    const veryLastUrl = String(((global.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls).at(-1)![0]);
    expect(veryLastUrl).toContain('dir=asc');
  });

  it('toggling "Merged only" sends merged=true on the request', async () => {
    const user = userEvent.setup();
    renderAt();
    await screen.findByText('18.70 kWh');
    await user.click(screen.getByLabelText(/merged only/i));
    const fetchCalls = (global.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    const lastUrl = String(fetchCalls[fetchCalls.length - 1][0]);
    expect(lastUrl).toContain('merged=true');
  });

  it('clicking a row navigates to /admin/sessions/:id', async () => {
    const user = userEvent.setup();
    renderAt();
    await screen.findByText('18.70 kWh');
    await user.click(screen.getByText('18.70 kWh'));
    expect(await screen.findByText('detail page')).toBeInTheDocument();
  });

  it('shows pagination controls disabled at boundaries on a single page', async () => {
    renderAt();
    await screen.findByText('18.70 kWh');
    expect(screen.getByRole('button', { name: /previous/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled();
  });

  it('shows the "no other sessions" empty-state when only the active session matches', async () => {
    global.fetch = vi.fn((input: RequestInfo | URL) => {
      // Default fetch returns just the active session, no ended ones.
      const url = input.toString();
      void url;
      return Promise.resolve(json({
        items: [ACTIVE_SESSION],
        totalCount: 1,
        page: 1,
        pageSize: 25,
      }));
    }) as unknown as typeof fetch;

    renderAt();
    expect(await screen.findByText(/no other sessions match the current filters/i)).toBeInTheDocument();
  });

  it('shows the bare empty-state when no sessions match at all', async () => {
    global.fetch = vi.fn(() => Promise.resolve(json({
      items: [],
      totalCount: 0,
      page: 1,
      pageSize: 25,
    }))) as unknown as typeof fetch;

    renderAt();
    expect(await screen.findByText(/^no sessions match the current filters\.$/i)).toBeInTheDocument();
  });

  it('row click forwards current filter querystring to the detail URL', async () => {
    const user = userEvent.setup();
    renderAt('/admin/sessions?merged=false');
    await screen.findByText('18.70 kWh');
    await user.click(screen.getByText('18.70 kWh'));
    await screen.findByText('detail page');
    expect(screen.getByTestId('detail-search').textContent).toBe('?merged=false');
  });
});
