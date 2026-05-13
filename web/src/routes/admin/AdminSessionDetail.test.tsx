import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import AdminSessionDetail from './AdminSessionDetail';
import type { SessionDetail } from '../../types/AdminSession';

const ENDED_SESSION: SessionDetail = {
  id: 'session-1',
  startedAt: '2026-05-12T14:00:00Z',
  endedAt: '2026-05-12T15:30:00Z',
  durationSeconds: 5400,
  energyKwh: 18.7,
  costCents: 243,
  peakKw: 7.4,
  rateAtStartCentsPerKwh: 13,
  isMerged: false,
  notes: 'trip to work',
  powerSamples: [
    { unixSecondsUtc: 1747058400, kw: 7.0 },
    { unixSecondsUtc: 1747058410, kw: 7.2 },
    { unixSecondsUtc: 1747058420, kw: 7.4 },
  ],
};

const ACTIVE_SESSION: SessionDetail = { ...ENDED_SESSION, id: 'session-active', endedAt: null, notes: null };

interface MockState {
  current: SessionDetail;
  patchCalls: Array<{ body: unknown }>;
  deleteCalls: number;
}

function setupMockFetch(initial: SessionDetail) {
  const state: MockState = { current: initial, patchCalls: [], deleteCalls: 0 };
  global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString();
    const method = init?.method ?? 'GET';
    if (method === 'GET' && /\/api\/admin\/sessions\/[^/]+$/.test(url)) {
      return Promise.resolve(json(state.current));
    }
    if (method === 'PATCH') {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      state.patchCalls.push({ body });
      state.current = { ...state.current, ...patchApplied(state.current, body) };
      return Promise.resolve(json(state.current));
    }
    if (method === 'DELETE') {
      state.deleteCalls++;
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    return Promise.resolve(new Response('not found', { status: 404 }));
  }) as unknown as typeof fetch;
  return state;
}

function patchApplied(_current: SessionDetail, body: { notes?: string; isMerged?: boolean }): Partial<SessionDetail> {
  const out: Partial<SessionDetail> = {};
  if (body.notes !== undefined) out.notes = body.notes;
  if (body.isMerged !== undefined) out.isMerged = body.isMerged;
  return out;
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function renderAt(id: string, search = '') {
  const path = `/admin/sessions/${id}${search}`;
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin/sessions" element={<p>sessions list</p>} />
        <Route path="/admin/sessions/:id" element={<AdminSessionDetail />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('AdminSessionDetail', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders the header, stats, and chart for an ended session', async () => {
    setupMockFetch(ENDED_SESSION);
    renderAt('session-1');
    await screen.findByText(/peak power/i);
    expect(screen.getByText('7.4 kW')).toBeInTheDocument();
    expect(screen.getByText('18.70 kWh')).toBeInTheDocument();
    expect(screen.getByText('$2.43')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /charging power over time/i })).toBeInTheDocument();
  });

  it('back link preserves filter querystring from the URL', async () => {
    setupMockFetch(ENDED_SESSION);
    renderAt('session-1', '?merged=true&page=2');
    const link = await screen.findByRole('link', { name: /back to sessions/i });
    expect(link).toHaveAttribute('href', '/admin/sessions?merged=true&page=2');
  });

  it('saves notes via PATCH after debounce when textarea blurs', async () => {
    const state = setupMockFetch(ENDED_SESSION);
    renderAt('session-1');
    const textarea = await screen.findByPlaceholderText(/add a note/i);

    // fireEvent.change is a single synchronous DOM event — avoids the
    // user.clear() + user.type() timing race under fake timers that
    // intermittently let the original "trip to work" content survive into
    // the typed payload.
    fireEvent.change(textarea, { target: { value: 'updated note' } });
    fireEvent.blur(textarea);
    await vi.advanceTimersByTimeAsync(600);

    await waitFor(() => {
      expect(state.patchCalls.length).toBeGreaterThan(0);
    });
    expect(state.patchCalls[state.patchCalls.length - 1].body).toEqual({ notes: 'updated note' });
    expect(screen.getByText('Saved')).toBeInTheDocument();
  });

  it('saves notes immediately on Cmd/Ctrl+Enter without waiting for blur', async () => {
    const state = setupMockFetch(ENDED_SESSION);
    renderAt('session-1');
    const textarea = await screen.findByPlaceholderText(/add a note/i);

    fireEvent.change(textarea, { target: { value: 'shortcut save' } });
    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true });

    await waitFor(() => {
      expect(state.patchCalls.length).toBeGreaterThan(0);
    });
    expect(state.patchCalls[state.patchCalls.length - 1].body).toEqual({ notes: 'shortcut save' });
  });

  it('disables merged toggle on active sessions and shows the explanation', async () => {
    setupMockFetch(ACTIVE_SESSION);
    renderAt('session-active');
    await screen.findByText(/peak power/i);
    const checkbox = screen.getByRole('checkbox', { name: /merged with prior session/i });
    expect(checkbox).toBeDisabled();
    expect(screen.getByText(/available after session ends/i)).toBeInTheDocument();
  });

  it('toggles merged via PATCH on ended sessions', async () => {
    const state = setupMockFetch(ENDED_SESSION);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderAt('session-1');
    await screen.findByText(/peak power/i);

    await user.click(screen.getByRole('checkbox', { name: /merged with prior session/i }));
    await waitFor(() => {
      expect(state.patchCalls.length).toBe(1);
    });
    expect(state.patchCalls[0].body).toEqual({ isMerged: true });
  });

  it('disables the delete button on active sessions', async () => {
    setupMockFetch(ACTIVE_SESSION);
    renderAt('session-active');
    await screen.findByText(/peak power/i);
    expect(screen.getByRole('button', { name: /delete session/i })).toBeDisabled();
    expect(screen.getByText(/end the session before deleting/i)).toBeInTheDocument();
  });

  it('opens a delete modal with Cancel + Delete buttons, Cancel does nothing', async () => {
    setupMockFetch(ENDED_SESSION);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderAt('session-1');
    await screen.findByText(/peak power/i);

    await user.click(screen.getByRole('button', { name: /delete session/i }));
    expect(screen.getByRole('dialog', { name: /confirm delete/i })).toBeInTheDocument();
    expect(screen.getByText(/this cannot be undone/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('Delete in the modal sends DELETE and navigates back to the list with filters', async () => {
    const state = setupMockFetch(ENDED_SESSION);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderAt('session-1', '?merged=true');
    await screen.findByText(/peak power/i);

    await user.click(screen.getByRole('button', { name: /delete session/i }));
    await user.click(screen.getByRole('button', { name: /^delete$/i }));

    expect(await screen.findByText('sessions list')).toBeInTheDocument();
    expect(state.deleteCalls).toBe(1);
  });

  it('renders a friendly empty-state for the chart when there are no samples', async () => {
    setupMockFetch({ ...ENDED_SESSION, powerSamples: [] });
    renderAt('session-1');
    expect(await screen.findByText(/no power data recorded/i)).toBeInTheDocument();
  });
});
