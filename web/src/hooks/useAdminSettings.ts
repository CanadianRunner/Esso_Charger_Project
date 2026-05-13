import { useCallback, useEffect, useState } from 'react';
import type {
  SettingsDraft,
  SettingsErrorResponse,
  SettingsResponse,
  SettingsValidationError,
} from '../types/AdminSettings';

export class SettingsSaveError extends Error {
  constructor(message: string, public errors: SettingsValidationError[]) {
    super(message);
  }
}

interface State {
  serverValues: SettingsDraft;
  loading: boolean;
  error: string | null;
}

/**
 * Fetch + patch the admin settings draft. Maintains a server-side mirror so
 * the page can compute dirty state by diffing the draft against the original
 * loaded values; save sends only the keys that changed.
 */
export function useAdminSettings() {
  const [state, setState] = useState<State>({ serverValues: {}, loading: true, error: null });

  const refetch = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const res = await fetch('/api/admin/settings', { credentials: 'same-origin' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as SettingsResponse;
      const values: SettingsDraft = {};
      for (const [k, v] of Object.entries(body.values)) {
        values[k] = v ?? '';
      }
      setState({ serverValues: values, loading: false, error: null });
    } catch (e) {
      setState({
        serverValues: {},
        loading: false,
        error: e instanceof Error ? e.message : 'Failed to load settings',
      });
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  /**
   * Save a batch of changed settings. Throws SettingsSaveError on validation
   * failure so the caller can surface field-level errors in the UI.
   */
  const save = useCallback(async (changed: SettingsDraft): Promise<void> => {
    const res = await fetch('/api/admin/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: changed }),
      credentials: 'same-origin',
    });
    if (!res.ok) {
      let body: SettingsErrorResponse | null = null;
      try { body = (await res.json()) as SettingsErrorResponse; } catch { /* non-JSON */ }
      const errors = body?.errors ?? [];
      throw new SettingsSaveError(
        body?.error ?? errors[0]?.error ?? `Save failed (${res.status})`,
        errors,
      );
    }
    const body = (await res.json()) as SettingsResponse;
    const values: SettingsDraft = {};
    for (const [k, v] of Object.entries(body.values)) {
      values[k] = v ?? '';
    }
    setState({ serverValues: values, loading: false, error: null });
  }, []);

  return { ...state, refetch, save };
}
