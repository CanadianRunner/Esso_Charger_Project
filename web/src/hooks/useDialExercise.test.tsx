import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useDialExercise, EXERCISE_MULTIPLIERS } from './useDialExercise';
import { isProductionBuild } from '../lib/environment';

vi.mock('../lib/environment', () => ({
  isProductionBuild: vi.fn(() => false),
}));

describe('useDialExercise', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.history.replaceState({}, '', '/');
    vi.mocked(isProductionBuild).mockReturnValue(false);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null by default when idle', () => {
    const { result } = renderHook(() => useDialExercise('idle'));
    expect(result.current).toBeNull();
  });

  it('runs immediately when ?exercise=now is in the URL and steps 0..9 then null', () => {
    window.history.replaceState({}, '', '/?exercise=now');
    const { result } = renderHook(() => useDialExercise('idle'));

    // First tick fires immediately on mount.
    expect(result.current).toBe(0);

    for (let i = 1; i <= 9; i++) {
      act(() => { vi.advanceTimersByTime(250); });
      expect(result.current).toBe(i);
    }

    // One more step → null (exercise complete).
    act(() => { vi.advanceTimersByTime(250); });
    expect(result.current).toBeNull();
  });

  it('does not trigger hourly check during non-idle state', () => {
    const { result } = renderHook(() => useDialExercise('charging'));
    act(() => { vi.advanceTimersByTime(61 * 60_000); });
    expect(result.current).toBeNull();
  });

  it('does not double-trigger if exercise is already running', () => {
    window.history.replaceState({}, '', '/?exercise=now');
    const { result } = renderHook(() => useDialExercise('idle'));

    expect(result.current).toBe(0);

    // Try to retrigger mid-exercise — would have no effect since runningRef is set.
    act(() => { vi.advanceTimersByTime(250); });
    expect(result.current).toBe(1);
    act(() => { vi.advanceTimersByTime(250); });
    expect(result.current).toBe(2);
  });

  it('does not auto-fire when suspended (post-session linger)', () => {
    const { result } = renderHook(() => useDialExercise('idle', /*suspended*/ true));
    act(() => { vi.advanceTimersByTime(61 * 60_000); });
    expect(result.current).toBeNull();
  });

  it('does not force-fire from ?exercise=now in production builds', () => {
    vi.mocked(isProductionBuild).mockReturnValue(true);
    window.history.replaceState({}, '', '/?exercise=now');
    const { result } = renderHook(() => useDialExercise('idle'));
    expect(result.current).toBeNull();
  });

  it('does not force-fire from ?exercise=now when suspended', () => {
    window.history.replaceState({}, '', '/?exercise=now');
    const { result } = renderHook(() => useDialExercise('idle', /*suspended*/ true));
    expect(result.current).toBeNull();
  });

  it('respects a custom interval shorter than the default', () => {
    // 600s interval → fires after ~10 minutes of idle.
    const { result } = renderHook(() => useDialExercise('idle', false, 600));
    expect(result.current).toBeNull();
    // 9 minutes — not yet.
    act(() => { vi.advanceTimersByTime(9 * 60_000); });
    expect(result.current).toBeNull();
    // 11 minutes — should have fired by now.
    act(() => { vi.advanceTimersByTime(2 * 60_000); });
    expect(result.current).toBe(0);
  });

  it('is disabled entirely when interval is 0', () => {
    const { result } = renderHook(() => useDialExercise('idle', false, 0));
    // Advance well past any reasonable interval; should never fire.
    act(() => { vi.advanceTimersByTime(2 * 60 * 60_000); });
    expect(result.current).toBeNull();
  });

  it('is disabled entirely when interval is negative', () => {
    const { result } = renderHook(() => useDialExercise('idle', false, -100));
    act(() => { vi.advanceTimersByTime(2 * 60 * 60_000); });
    expect(result.current).toBeNull();
  });

  it('clamps tiny intervals to the 300s minimum', () => {
    // 30s requested → clamped to 300s. Should fire after ~5 minutes, not ~30s.
    const { result } = renderHook(() => useDialExercise('idle', false, 30));
    act(() => { vi.advanceTimersByTime(2 * 60_000); });
    expect(result.current).toBeNull();
    // 6 minutes — past the 300s minimum interval.
    act(() => { vi.advanceTimersByTime(4 * 60_000); });
    expect(result.current).toBe(0);
  });

  it('multipliers map step 9 to all-9s in each dial format', () => {
    // Zone 1: 9 * 11.11 = 99.99 (digits=2 decimals=2 → "99.99")
    expect(9 * EXERCISE_MULTIPLIERS.zone1Dollars).toBeCloseTo(99.99);
    // Zone 4: 9 * 111.1 = 999.9 (digits=3 decimals=1 → "999.9")
    expect(9 * EXERCISE_MULTIPLIERS.zone4Kwh).toBeCloseTo(999.9);
    // Zone 5: 9 * 1.11 = 9.99 (digits=1 decimals=2 → "9.99")
    expect(9 * EXERCISE_MULTIPLIERS.zone5Rate).toBeCloseTo(9.99);
  });
});
