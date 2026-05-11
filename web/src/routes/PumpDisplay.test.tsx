import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import PumpDisplay from './PumpDisplay';
import { usePumpStore } from '../stores/pumpStore';
import type { PumpState } from '../types/PumpState';

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
    usePumpStore.setState({ state: null, receivedAt: null, connection: 'connecting' });
    // Default to no preview mode unless a test overrides it.
    window.history.replaceState({}, '', '/');
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

  it('pins SESSION zone to ✓ Done when state is session_complete', () => {
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
    // The checkmark is rendered in a MiniReadout cell (twice — top & bottom of reel),
    // "Done" as the unit label.
    expect(screen.getAllByText('✓').length).toBeGreaterThan(0);
    expect(screen.getByText('Done')).toBeInTheDocument();
  });
});
