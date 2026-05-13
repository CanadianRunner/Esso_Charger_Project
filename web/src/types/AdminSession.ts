export interface SessionSummary {
  id: string;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number;
  energyKwh: number;
  costCents: number;
  isMerged: boolean;
}

export interface SessionListResponse {
  items: SessionSummary[];
  totalCount: number;
  page: number;
  pageSize: number;
}

export type SessionSort = 'started' | 'duration' | 'energy' | 'cost';
export type SortDir = 'asc' | 'desc';

export interface SessionListFilters {
  from: string | null;
  to: string | null;
  merged: boolean | null;
  active: boolean | null;
  sort: SessionSort;
  dir: SortDir;
  page: number;
}

export const DEFAULT_FILTERS: SessionListFilters = {
  from: null,
  to: null,
  merged: null,
  active: null,
  sort: 'started',
  dir: 'desc',
  page: 1,
};

export const PAGE_SIZE = 25;
