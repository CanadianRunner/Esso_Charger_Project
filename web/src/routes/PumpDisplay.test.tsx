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
  });

  it('renders the five zone labels even with no data', () => {
    render(<PumpDisplay />);
    expect(screen.getByText('THIS $ SALE')).toBeInTheDocument();
    expect(screen.getByText('USAGE')).toBeInTheDocument();
    expect(screen.getByText('SESSION')).toBeInTheDocument();
    expect(screen.getByText('kWh DELIVERED')).toBeInTheDocument();
    expect(screen.getByText('PRICE PER kWh')).toBeInTheDocument();
  });

  it('reflects live charging values from the store', () => {
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

    expect(screen.getByText('$1.60')).toBeInTheDocument();         // session cost
    expect(screen.getByText('12.3')).toBeInTheDocument();           // session kWh
    expect(screen.getByText('1234.5 kWh')).toBeInTheDocument();     // lifetime usage readout
    expect(screen.getByText('11.5 kW')).toBeInTheDocument();        // live kW pinned
    expect(screen.getByText('$0.13')).toBeInTheDocument();          // price per kWh
  });

  it('shows reconnecting badge when disconnected', () => {
    render(<PumpDisplay />);
    act(() => {
      usePumpStore.setState({ state: buildState(), receivedAt: Date.now(), connection: 'disconnected' });
    });
    expect(screen.getByText(/reconnecting/i)).toBeInTheDocument();
  });

  it('shows session_complete checkmark in the SESSION slot', () => {
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
    expect(screen.getByText('✓ Done')).toBeInTheDocument();
  });
});
