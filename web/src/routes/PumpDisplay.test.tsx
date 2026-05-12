import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import PumpDisplay from './PumpDisplay';
import { usePumpStore } from '../stores/pumpStore';
import type { PumpState } from '../types/PumpState';

/**
 * Helper: advance past RollingCell's 250ms roll + cellIndex × 30ms stagger
 * (max ~460ms across the 8-cell row) so the reels have settled to the new chars.
 */
function settleRollAnimations() {
  act(() => { vi.advanceTimersByTime(700); });
}

vi.mock('../lib/pumpHubClient', () => ({
  startPumpHub: vi.fn(),
  stopPumpHub: vi.fn(),
}));

function buildState(overrides: Partial<PumpState> = {}): PumpState {
  return {
    state: 'idle',
    session: null,
    totals: { lifetimeKwh: 1234.5, yearToDateKwh: 234.5, sessionCount: 47 },
    rate: { centsPerKwh: 13 },
    serverTime: new Date().toISOString(),
    health: {
      hpwcConnected: true,
      shellyConnected: false,
      rateSource: 'manual',
      rateLastUpdated: new Date().toISOString(),
    },
    ...overrides,
  };
}

describe('PumpDisplay', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    usePumpStore.setState({ state: null, receivedAt: null, connection: 'connecting' });
    // Default to no preview mode unless a test overrides it.
    window.history.replaceState({}, '', '/');
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the five zone labels in preview mode', () => {
    window.history.replaceState({}, '', '/?preview=true');
    render(<PumpDisplay />);
    expect(screen.getByText('THIS $ SALE')).toBeInTheDocument();
    expect(screen.getByText('USAGE')).toBeInTheDocument();
    expect(screen.getByText('SESSION')).toBeInTheDocument();
    expect(screen.getByText('kWh DELIVERED')).toBeInTheDocument();
    expect(screen.getByText('PRICE PER kWh')).toBeInTheDocument();
  });

  it('hides zone labels by default (production-kiosk mode)', () => {
    render(<PumpDisplay />);
    expect(screen.queryByText('THIS $ SALE')).not.toBeInTheDocument();
    expect(screen.queryByText('USAGE')).not.toBeInTheDocument();
    expect(screen.queryByText('PRICE PER kWh')).not.toBeInTheDocument();
  });

  it('reflects live mini-readout icons and units from the store', () => {
    render(<PumpDisplay />);

    act(() => {
      usePumpStore.setState({
        state: buildState({
          state: 'charging',
          session: { energyKwh: 12.3, durationSeconds: 600, costCents: 160, liveKw: 11.5 },
        }),
        receivedAt: Date.now(),
        connection: 'connected',
      });
    });

    // OdometerDial- and MiniReadout-rendered values are split across individual
    // cells; per-component rendering is covered in their own test files. Here
    // we assert the icons and unit labels that uniquely identify each zone is
    // wired correctly. Icons appear twice per readout because RollingCell
    // renders both rows of its two-row reel on every render.
    expect(screen.getAllByText('📊').length).toBeGreaterThan(0);   // Zone 2 USAGE icon (rotation 0)
    expect(screen.getByText('kWh')).toBeInTheDocument();           // Zone 2 unit
    expect(screen.getAllByText('⚡').length).toBeGreaterThan(0);    // Zone 3 SESSION icon (pinned charging)
    expect(screen.getByText('kW')).toBeInTheDocument();             // Zone 3 unit
  });

  it('shows reconnecting badge when disconnected', () => {
    render(<PumpDisplay />);
    act(() => {
      usePumpStore.setState({ state: buildState(), receivedAt: Date.now(), connection: 'disconnected' });
    });
    expect(screen.getByText(/reconnecting/i)).toBeInTheDocument();
  });

  it('session_complete shows duration rotation initially (index 0 of the 4-stat cycle)', () => {
    render(<PumpDisplay />);
    act(() => {
      usePumpStore.setState({
        state: buildState({
          state: 'session_complete',
          session: { energyKwh: 5.0, durationSeconds: 1800, costCents: 65, liveKw: 0 },
        }),
        receivedAt: Date.now(),
        connection: 'connected',
      });
    });
    // First rotation entry is the duration timer ⏱️. The other rotation icons
    // (🔋 kWh, 💵 cost, ⚡ Done) don't appear until 10s+, 20s+, 30s+.
    expect(screen.getAllByText('⏱️').length).toBeGreaterThan(0);
  });

  it('true idle shows the READY display (no zero-value rotation)', () => {
    render(<PumpDisplay />);
    act(() => {
      usePumpStore.setState({
        state: buildState({ state: 'idle', session: null }),
        receivedAt: Date.now(),
        connection: 'connected',
      });
    });
    // The READY display puts ⚡ in cell 1 and 🔌 in cell 7, with R/E/A/D/Y in between.
    expect(screen.getAllByText('R').length).toBeGreaterThan(0);
    expect(screen.getAllByText('E').length).toBeGreaterThan(0);
    expect(screen.getAllByText('A').length).toBeGreaterThan(0);
    expect(screen.getAllByText('D').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Y').length).toBeGreaterThan(0);
    expect(screen.getAllByText('🔌').length).toBeGreaterThan(0);
  });

  it('READY display does NOT appear during charging / plugged / session_complete', () => {
    render(<PumpDisplay />);

    act(() => {
      usePumpStore.setState({
        state: buildState({
          state: 'charging',
          session: { energyKwh: 1.0, durationSeconds: 60, costCents: 10, liveKw: 5 },
        }),
        receivedAt: Date.now(),
        connection: 'connected',
      });
    });
    settleRollAnimations();
    expect(screen.queryByText('R')).not.toBeInTheDocument();
    expect(screen.queryByText('🔌')).not.toBeInTheDocument();

    act(() => {
      usePumpStore.setState({
        state: buildState({
          state: 'plugged_not_charging',
          session: { energyKwh: 0, durationSeconds: 5, costCents: 0, liveKw: 0 },
        }),
        receivedAt: Date.now(),
        connection: 'connected',
      });
    });
    settleRollAnimations();
    expect(screen.queryByText('R')).not.toBeInTheDocument();

    act(() => {
      usePumpStore.setState({
        state: buildState({
          state: 'session_complete',
          session: { energyKwh: 5.0, durationSeconds: 1800, costCents: 65, liveKw: 0 },
        }),
        receivedAt: Date.now(),
        connection: 'connected',
      });
    });
    settleRollAnimations();
    expect(screen.queryByText('R')).not.toBeInTheDocument();
  });

  it('charging → idle does NOT immediately show READY (linger holds the session for 15 min)', () => {
    render(<PumpDisplay />);

    // Walk through charging then unplug.
    act(() => {
      usePumpStore.setState({
        state: buildState({
          state: 'charging',
          session: { energyKwh: 5.0, durationSeconds: 1800, costCents: 65, liveKw: 10 },
        }),
        receivedAt: Date.now(),
        connection: 'connected',
      });
    });
    act(() => {
      usePumpStore.setState({
        state: buildState({ state: 'idle', session: null }),
        receivedAt: Date.now(),
        connection: 'connected',
      });
    });

    // During the linger window the display is synthesized as session_complete,
    // so it's still showing session stats — not READY.
    settleRollAnimations();
    expect(screen.queryByText('R')).not.toBeInTheDocument();
    expect(screen.getAllByText('⏱️').length).toBeGreaterThan(0);
  });

  it('idle → plugged_not_charging during READY swaps in the kW readout', () => {
    render(<PumpDisplay />);
    act(() => {
      usePumpStore.setState({
        state: buildState({ state: 'idle', session: null }),
        receivedAt: Date.now(),
        connection: 'connected',
      });
    });
    expect(screen.getAllByText('R').length).toBeGreaterThan(0);

    act(() => {
      usePumpStore.setState({
        state: buildState({
          state: 'plugged_not_charging',
          session: { energyKwh: 0, durationSeconds: 0, costCents: 0, liveKw: 0 },
        }),
        receivedAt: Date.now(),
        connection: 'connected',
      });
    });
    // READY letters gone, kW unit appears.
    settleRollAnimations();
    expect(screen.queryByText('R')).not.toBeInTheDocument();
    expect(screen.queryByText('🔌')).not.toBeInTheDocument();
    expect(screen.getByText('kW')).toBeInTheDocument();
  });
});
