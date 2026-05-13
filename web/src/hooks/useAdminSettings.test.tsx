import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SettingsSaveError, useAdminSettings } from './useAdminSettings';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('useAdminSettings', () => {
  beforeEach(() => {
    global.fetch = vi.fn() as unknown as typeof fetch;
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches server values on mount and exposes them after load', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      jsonResponse({ values: { 'display.brightness_active': '1.0', 'display.brightness_dim': '0.6' } }),
    );
    const { result } = renderHook(() => useAdminSettings());
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.serverValues['display.brightness_active']).toBe('1.0');
    expect(result.current.serverValues['display.brightness_dim']).toBe('0.6');
  });

  it('coerces null server values to empty strings', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      jsonResponse({ values: { 'display.brightness_active': null } }),
    );
    const { result } = renderHook(() => useAdminSettings());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.serverValues['display.brightness_active']).toBe('');
  });

  it('save() PATCHes the changed values and refreshes serverValues', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    global.fetch = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      const u = url.toString();
      calls.push({ url: u, init });
      if (init?.method === 'PATCH') {
        return Promise.resolve(jsonResponse({ values: { 'display.brightness_active': '0.85' } }));
      }
      return Promise.resolve(jsonResponse({ values: { 'display.brightness_active': '1.0' } }));
    }) as unknown as typeof fetch;

    const { result } = renderHook(() => useAdminSettings());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.save({ 'display.brightness_active': '0.85' });
    });

    const patch = calls.find((c) => c.init?.method === 'PATCH');
    expect(patch).toBeDefined();
    expect(patch!.init!.body).toBe(JSON.stringify({ values: { 'display.brightness_active': '0.85' } }));
    expect(result.current.serverValues['display.brightness_active']).toBe('0.85');
  });

  it('throws SettingsSaveError with per-field errors on 400 validation failure', async () => {
    let callCount = 0;
    global.fetch = vi.fn(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve(jsonResponse({ values: { 'display.brightness_active': '1.0' } }));
      }
      return Promise.resolve(
        jsonResponse(
          {
            errors: [{ key: 'display.brightness_active', error: 'brightness must be between 0 and 1.' }],
          },
          400,
        ),
      );
    }) as unknown as typeof fetch;

    const { result } = renderHook(() => useAdminSettings());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await expect(
      result.current.save({ 'display.brightness_active': '2.5' }),
    ).rejects.toBeInstanceOf(SettingsSaveError);
  });
});
