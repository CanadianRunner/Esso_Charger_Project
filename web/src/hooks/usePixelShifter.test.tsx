import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { usePixelShifter } from './usePixelShifter';

describe('usePixelShifter', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('starts at zero offset', () => {
    const { result } = renderHook(() => usePixelShifter(60_000));
    expect(result.current).toEqual({ x: 0, y: 0 });
  });

  it('shifts after the interval elapses', () => {
    const { result } = renderHook(() => usePixelShifter(60_000));
    act(() => { vi.advanceTimersByTime(60_001); });
    expect(Math.abs(result.current.x)).toBe(1);
    expect(Math.abs(result.current.y)).toBe(1);
  });

  it('only ever shifts by ±1 px', () => {
    const { result } = renderHook(() => usePixelShifter(1_000));
    for (let i = 0; i < 50; i++) {
      act(() => { vi.advanceTimersByTime(1_001); });
      expect([-1, 1]).toContain(result.current.x);
      expect([-1, 1]).toContain(result.current.y);
    }
  });

  it('cleans up its interval on unmount', () => {
    const { unmount } = renderHook(() => usePixelShifter(60_000));
    const spy = vi.spyOn(window, 'clearInterval');
    unmount();
    expect(spy).toHaveBeenCalled();
  });
});
