import { useCallback, useEffect, useState } from 'react';
import type { SessionDetail, UpdateSessionRequest } from '../types/AdminSession';

interface State {
  data: SessionDetail | null;
  loading: boolean;
  error: string | null;
}

export class SessionMutationError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

/**
 * Fetch + mutate a single admin session. Returns the detail payload, refetch
 * trigger, and patch/remove helpers that hit /api/admin/sessions/:id.
 */
export function useAdminSession(id: string | undefined) {
  const [state, setState] = useState<State>({ data: null, loading: false, error: null });

  const refetch = useCallback(async () => {
    if (!id) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const res = await fetch(`/api/admin/sessions/${id}`, { credentials: 'same-origin' });
      if (res.status === 404) throw new SessionMutationError('Session not found.', 404);
      if (!res.ok) throw new SessionMutationError(`HTTP ${res.status}`, res.status);
      const body = (await res.json()) as SessionDetail;
      setState({ data: body, loading: false, error: null });
    } catch (e) {
      setState({
        data: null,
        loading: false,
        error: e instanceof Error ? e.message : 'Failed to load session',
      });
    }
  }, [id]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const patch = useCallback(
    async (req: UpdateSessionRequest): Promise<SessionDetail> => {
      if (!id) throw new SessionMutationError('No session selected.', 400);
      const res = await fetch(`/api/admin/sessions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
        credentials: 'same-origin',
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new SessionMutationError(text || `HTTP ${res.status}`, res.status);
      }
      const body = (await res.json()) as SessionDetail;
      setState({ data: body, loading: false, error: null });
      return body;
    },
    [id]
  );

  const remove = useCallback(async (): Promise<void> => {
    if (!id) throw new SessionMutationError('No session selected.', 400);
    const res = await fetch(`/api/admin/sessions/${id}`, {
      method: 'DELETE',
      credentials: 'same-origin',
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new SessionMutationError(text || `HTTP ${res.status}`, res.status);
    }
  }, [id]);

  return { ...state, refetch, patch, remove };
}
