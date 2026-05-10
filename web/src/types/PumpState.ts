export type DisplayState =
  | 'idle'
  | 'plugged_not_charging'
  | 'charging'
  | 'session_complete';

export interface PumpStateSession {
  energyKwh: number;
  durationSeconds: number;
  costCents: number;
  liveKw: number;
}

export interface PumpStateTotals {
  lifetimeKwh: number;
  yearToDateKwh: number;
  sessionCount: number;
}

export interface PumpStateRate {
  centsPerKwh: number;
}

export interface PumpStateHealth {
  hpwcConnected: boolean;
  shellyConnected: boolean;
  rateSource: 'manual' | 'openei';
  rateLastUpdated: string;
}

export interface PumpState {
  state: DisplayState;
  session: PumpStateSession | null;
  totals: PumpStateTotals;
  rate: PumpStateRate;
  serverTime: string;
  health: PumpStateHealth;
}
