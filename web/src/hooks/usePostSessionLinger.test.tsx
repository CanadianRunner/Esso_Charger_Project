import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { usePostSessionLinger } from './usePostSessionLinger';
import type { PumpStateSession, DisplayState } from '../types/PumpState';

const SESSION: PumpStateSession = {
  costCents: 234,
  energyKwh: 12.3,
  durationSeconds: 3600,
  liveKw: 0,
};

const BRIGHT_S = 5;   // 5 second windows for tests
const DIM_S = 10;
const FADE_MS = 200;

interface Args {
  state: DisplayState | undefined;
  session: PumpStateSession | null;
}

function setup(initial: Args) {
  return renderHook(
    ({ state, session }: Args) =>
      usePostSessionLinger({
        state,
        session,
        brightSeconds: BRIGHT_S,
        dimSeconds: DIM_S,
        fadeMs: FADE_MS,
      }),
    { initialProps: initial }
  );
}

describe('usePostSessionLinger', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('does nothing while charging', () => {
    const { result } = setup({ state: 'charging', session: SESSION });
    expect(result.current.phase).toBe('none');
    expect(result.current.isLingering).toBe(false);
    expect(result.current.data).toBeNull();
  });

  it('walks through bright → dim → fading_out → none on charging→idle', () => {
    const { result, rerender } = setup({ state: 'charging', session: SESSION });

    rerender({ state: 'idle', session: null });

    // Immediately enters bright with captured session data.
    expect(result.current.phase).toBe('bright');
    expect(result.current.data).toEqual({ costCents: 234, energyKwh: 12.3, durationSeconds: 3600 });
    expect(result.current.brightnessOverride).toBe(1.0);

    // After bright window → dim.
    act(() => { vi.advanceTimersByTime(BRIGHT_S * 1000 + 10); });
    expect(result.current.phase).toBe('dim');
    expect(result.current.brightnessOverride).toBe(0.6);
    expect(result.current.data).toEqual({ costCents: 234, energyKwh: 12.3, durationSeconds: 3600 });

    // After dim window → fading_out.
    act(() => { vi.advanceTimersByTime(DIM_S * 1000 + 10); });
    expect(result.current.phase).toBe('fading_out');
    expect(result.current.brightnessOverride).toBe(0.6);
    expect(result.current.data).toEqual({ costCents: 234, energyKwh: 12.3, durationSeconds: 3600 });

    // After fade duration → none, data cleared, real idle resumes.
    act(() => { vi.advanceTimersByTime(FADE_MS + 10); });
    expect(result.current.phase).toBe('none');
    expect(result.current.brightnessOverride).toBeUndefined();
    expect(result.current.data).toBeNull();
  });

  it('also triggers on session_complete → idle (unplug after completion)', () => {
    const { result, rerender } = setup({ state: 'session_complete', session: SESSION });
    rerender({ state: 'idle', session: null });
    expect(result.current.phase).toBe('bright');
  });

  it('cancels immediately on plug-in during bright window', () => {
    const { result, rerender } = setup({ state: 'charging', session: SESSION });
    rerender({ state: 'idle', session: null });
    expect(result.current.phase).toBe('bright');

    act(() => { vi.advanceTimersByTime(1000); });
    rerender({ state: 'plugged_not_charging', session: null });

    expect(result.current.phase).toBe('none');
    expect(result.current.data).toBeNull();
  });

  it('cancels immediately on plug-in during dim window', () => {
    const { result, rerender } = setup({ state: 'charging', session: SESSION });
    rerender({ state: 'idle', session: null });
    act(() => { vi.advanceTimersByTime(BRIGHT_S * 1000 + 10); });
    expect(result.current.phase).toBe('dim');

    rerender({ state: 'charging', session: { ...SESSION, costCents: 0, energyKwh: 0 } });
    expect(result.current.phase).toBe('none');
  });

  it('plug-in after the full reset behaves like a normal new session (no special-casing)', () => {
    const { result, rerender } = setup({ state: 'charging', session: SESSION });
    rerender({ state: 'idle', session: null });
    // Walk all the way through the lifecycle.
    act(() => { vi.advanceTimersByTime(BRIGHT_S * 1000 + DIM_S * 1000 + FADE_MS + 100); });
    expect(result.current.phase).toBe('none');

    // New plug-in.
    rerender({ state: 'plugged_not_charging', session: null });
    expect(result.current.phase).toBe('none');
    expect(result.current.data).toBeNull();
  });

  it('captures the latest session data at unplug, not the initial mount data', () => {
    const { result, rerender } = setup({ state: 'charging', session: { ...SESSION, costCents: 100, energyKwh: 5 } });
    // Energy ticks up while charging.
    rerender({ state: 'charging', session: { ...SESSION, costCents: 234, energyKwh: 12.3 } });
    // Then unplug.
    rerender({ state: 'idle', session: null });

    expect(result.current.data).toEqual({ costCents: 234, energyKwh: 12.3, durationSeconds: 3600 });
  });

  it('does not start a linger on idle→idle (no-op transitions)', () => {
    const { result, rerender } = setup({ state: 'idle', session: null });
    rerender({ state: 'idle', session: null });
    expect(result.current.phase).toBe('none');
  });

  it('does not start a linger on undefined→idle (initial connection)', () => {
    const { result, rerender } = setup({ state: undefined, session: null });
    rerender({ state: 'idle', session: null });
    expect(result.current.phase).toBe('none');
  });

  it('cleans up timers on unmount', () => {
    const { rerender, unmount } = setup({ state: 'charging', session: SESSION });
    rerender({ state: 'idle', session: null });
    const spy = vi.spyOn(window, 'clearTimeout');
    unmount();
    expect(spy).toHaveBeenCalled();
  });
});
