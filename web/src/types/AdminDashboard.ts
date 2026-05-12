export interface SessionSummary {
  id: string;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number;
  energyKwh: number;
  costCents: number;
  isMerged: boolean;
}

export interface Aggregates {
  todayKwh: number;
  thisMonthKwh: number;
  thisYearKwh: number;
}

export interface DashboardHealth {
  lastPollUtc: string | null;
  consecutiveFailures: number;
  controllerResponsive: boolean;
  vehicleConnected: boolean;
  contactorClosed: boolean;
}

export interface DashboardResponse {
  recentSessions: SessionSummary[];
  aggregates: Aggregates;
  health: DashboardHealth;
}
