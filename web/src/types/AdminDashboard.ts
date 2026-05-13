import type { SessionSummary } from './AdminSession';
export type { SessionSummary };

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
