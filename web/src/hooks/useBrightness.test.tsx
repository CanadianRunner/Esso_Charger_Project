import { renderHook } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useBrightness, inOvernightWindow } from './useBrightness';

describe('inOvernightWindow', () => {
  it.each([
    ['23:00', new Date(2026, 0, 1, 23, 0, 0), true],
    ['00:00', new Date(2026, 0, 1, 0, 0, 0), true],
    ['05:59', new Date(2026, 0, 1, 5, 59, 0), true],
    ['06:00', new Date(2026, 0, 1, 6, 0, 0), false],
    ['12:00', new Date(2026, 0, 1, 12, 0, 0), false],
    ['22:59', new Date(2026, 0, 1, 22, 59, 0), false],
  ])('%s → overnight=%s', (_label, date, expected) => {
    expect(inOvernightWindow(date)).toBe(expected);
  });
});

describe('useBrightness', () => {
  // Use a clock fixed at noon so the overnight check is consistently false.
  const noonClock = () => new Date(2026, 0, 1, 12, 0, 0);

  it('returns 1.0 when charging during daytime', () => {
    const { result } = renderHook(() => useBrightness('charging', noonClock));
    expect(result.current).toBe(1.0);
  });

  it('returns 1.0 when session_complete during daytime', () => {
    const { result } = renderHook(() => useBrightness('session_complete', noonClock));
    expect(result.current).toBe(1.0);
  });

  it('returns 0.6 when idle during daytime', () => {
    const { result } = renderHook(() => useBrightness('idle', noonClock));
    expect(result.current).toBe(0.6);
  });

  it('returns 0.6 when plugged_not_charging during daytime', () => {
    const { result } = renderHook(() => useBrightness('plugged_not_charging', noonClock));
    expect(result.current).toBe(0.6);
  });

  it('returns 0.3 overnight regardless of state', () => {
    const overnightClock = () => new Date(2026, 0, 1, 2, 0, 0);
    const { result: charging } = renderHook(() => useBrightness('charging', overnightClock));
    const { result: idle } = renderHook(() => useBrightness('idle', overnightClock));
    expect(charging.current).toBe(0.3);
    expect(idle.current).toBe(0.3);
  });

  it('falls back to 0.6 when state is undefined', () => {
    const { result } = renderHook(() => useBrightness(undefined, noonClock));
    expect(result.current).toBe(0.6);
  });
});
