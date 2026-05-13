import { useCallback, useEffect, useState } from 'react';
import {
  PAGE_SIZE,
  type SessionListFilters,
  type SessionListResponse,
} from '../types/AdminSession';

interface State {
  data: SessionListResponse | null;
  loading: boolean;
  error: string | null;
}

/**
 * Fetch the admin sessions list for the given filter set. Pass `null` to skip
 * the fetch entirely (used when conditionally fetching the pinned active session
 * only when the active filter is unset).
 */
export function useAdminSessions(filters: SessionListFilters | null) {
  const [state, setState] = useState<State>({ data: null, loading: false, error: null });

  const refetch = useCallback(async () => {
    if (filters === null) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const res = await fetch(buildUrl(filters), { credentials: 'same-origin' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as SessionListResponse;
      setState({ data: body, loading: false, error: null });
    } catch (e) {
      setState({
        data: null,
        loading: false,
        error: e instanceof Error ? e.message : 'Failed to load sessions',
      });
    }
  }, [filters]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { ...state, refetch };
}

function buildUrl(f: SessionListFilters): string {
  const params = new URLSearchParams();
  if (f.from) params.set('from', f.from);
  if (f.to) params.set('to', f.to);
  if (f.merged !== null) params.set('merged', String(f.merged));
  if (f.active !== null) params.set('active', String(f.active));
  params.set('sort', f.sort);
  params.set('dir', f.dir);
  params.set('page', String(f.page));
  params.set('pageSize', String(PAGE_SIZE));
  return `/api/admin/sessions?${params.toString()}`;
}
