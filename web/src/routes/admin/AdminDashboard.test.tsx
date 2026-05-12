import { render, screen, waitFor, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import AdminDashboard from './AdminDashboard';
import { usePumpStore } from '../../stores/pumpStore';

// PumpDisplayContent starts the SignalR hub on mount; stub it out so tests
// don't try to open a real connection.
vi.mock('../../lib/pumpHubClient', () => ({
  startPumpHub: vi.fn(),
}));

interface FetchHandler {
  (url: string): Response | Promise<Response>;
}
function mockFetch(handler: FetchHandler) {
  global.fetch = vi.fn((input: RequestInfo | URL) =>
    Promise.resolve(handler(input.toString()))
  ) as unknown as typeof fetch;
}
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const PAYLOAD = {
  recentSessions: [
    {
      id: 's1',
      startedAt: '2026-05-11T14:00:00Z',
      endedAt: '2026-05-11T15:30:00Z',
      durationSeconds: 5400,
      energyKwh: 18.7,
      costCents: 243,
      isMerged: false,
    },
    {
      id: 's2',
      startedAt: '2026-05-10T09:00:00Z',
      endedAt: null,
      durationSeconds: 0,
      energyKwh: 4.2,
      costCents: 55,
      isMerged: true,
    },
  ],
  aggregates: { todayKwh: 12.34, thisMonthKwh: 78.9, thisYearKwh: 412.5 },
  health: {
    lastPollUtc: new Date().toISOString(),
    consecutiveFailures: 0,
    controllerResponsive: true,
    vehicleConnected: true,
    contactorClosed: false,
  },
};

describe('AdminDashboard', () => {
  beforeEach(() => {
    usePumpStore.setState({ state: null, receivedAt: null, connection: 'connecting' });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('shows loading rows until the dashboard fetch resolves', async () => {
    mockFetch(() => json(PAYLOAD));
    render(<AdminDashboard />);
    // Before the promise resolves, stat cards show em-dashes
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    await screen.findByText(/12\.34/);
  });

  it('renders aggregates, recent sessions, and health rows from the fetched payload', async () => {
    mockFetch(() => json(PAYLOAD));
    render(<AdminDashboard />);

    expect(await screen.findByText('12.34')).toBeInTheDocument();
    expect(screen.getByText('78.90')).toBeInTheDocument();
    expect(screen.getByText('412.50')).toBeInTheDocument();

    expect(screen.getByText('18.70 kWh')).toBeInTheDocument();
    expect(screen.getByText('$2.43')).toBeInTheDocument();
    expect(screen.getByText('merged')).toBeInTheDocument();
    expect(screen.getByText('active')).toBeInTheDocument();

    expect(screen.getByText('Responsive')).toBeInTheDocument();
    expect(screen.getByText('Yes')).toBeInTheDocument();
    expect(screen.getByText('Open')).toBeInTheDocument();
  });

  it('shows the unresponsive warning when controllerResponsive=false', async () => {
    mockFetch(() => json({
      ...PAYLOAD,
      health: { ...PAYLOAD.health, controllerResponsive: false, consecutiveFailures: 7 },
    }));
    render(<AdminDashboard />);
    expect(await screen.findByText(/unresponsive \(7 failures\)/i)).toBeInTheDocument();
  });

  it('shows an empty state when there are no recent sessions', async () => {
    mockFetch(() => json({ ...PAYLOAD, recentSessions: [] }));
    render(<AdminDashboard />);
    expect(await screen.findByText(/no sessions yet/i)).toBeInTheDocument();
  });

  it('surfaces a refresh error in an alert without clearing the previous payload', async () => {
    let callCount = 0;
    mockFetch(() => {
      callCount++;
      if (callCount === 1) return json(PAYLOAD);
      return json({ error: 'boom' }, 500);
    });

    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<AdminDashboard />);
    await screen.findByText('12.34');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/dashboard refresh failed/i);
    });
    // Previous payload remains visible.
    expect(screen.getByText('12.34')).toBeInTheDocument();
  });

  it('refetches the dashboard every 60 seconds', async () => {
    const fetchSpy = vi.fn(() => Promise.resolve(json(PAYLOAD)));
    global.fetch = fetchSpy as unknown as typeof fetch;

    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<AdminDashboard />);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });
});
