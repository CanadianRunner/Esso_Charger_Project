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
   * failure so the caller can surface field-level errors in the UI. Pass a
   * `reason` when the batch includes a high-consequence setting like
   * lifetime.offset_wh; the backend enforces that lifetime changes carry a
   * non-empty reason and attaches it to the corresponding audit log entry.
   */
  const save = useCallback(async (changed: SettingsDraft, reason?: string): Promise<void> => {
    const requestBody: { values: SettingsDraft; reason?: string } = { values: changed };
    if (reason !== undefined) requestBody.reason = reason;
    const res = await fetch('/api/admin/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      credentials: 'same-origin',
    });
    if (!res.ok) {
      let errorBody: SettingsErrorResponse | null = null;
      try { errorBody = (await res.json()) as SettingsErrorResponse; } catch { /* non-JSON */ }
      const errors = errorBody?.errors ?? [];
      throw new SettingsSaveError(
        errorBody?.error ?? errors[0]?.error ?? `Save failed (${res.status})`,
        errors,
      );
    }
    const responseBody = (await res.json()) as SettingsResponse;
    const values: SettingsDraft = {};
    for (const [k, v] of Object.entries(responseBody.values)) {
      values[k] = v ?? '';
    }
    setState({ serverValues: values, loading: false, error: null });
  }, []);

  return { ...state, refetch, save };
}
