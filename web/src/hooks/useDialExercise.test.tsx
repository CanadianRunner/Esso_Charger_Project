import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useDialExercise, EXERCISE_MULTIPLIERS } from './useDialExercise';

describe('useDialExercise', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.history.replaceState({}, '', '/');
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

  it('multipliers map step 9 to all-9s in each dial format', () => {
    // Zone 1: 9 * 11.11 = 99.99 (digits=2 decimals=2 → "99.99")
    expect(9 * EXERCISE_MULTIPLIERS.zone1Dollars).toBeCloseTo(99.99);
    // Zone 4: 9 * 111.1 = 999.9 (digits=3 decimals=1 → "999.9")
    expect(9 * EXERCISE_MULTIPLIERS.zone4Kwh).toBeCloseTo(999.9);
    // Zone 5: 9 * 1.11 = 9.99 (digits=1 decimals=2 → "9.99")
    expect(9 * EXERCISE_MULTIPLIERS.zone5Rate).toBeCloseTo(9.99);
  });
});
