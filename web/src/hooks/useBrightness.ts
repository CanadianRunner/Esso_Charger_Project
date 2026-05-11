import { useEffect, useState } from 'react';
import type { DisplayState } from '../types/PumpState';

/**
 * Returns a brightness factor (0..1) to apply via CSS `filter: brightness()`
 * on the kiosk display.
 *
 *   Charging / SessionComplete → 1.00 (full brightness)
 *   Idle / PluggedNotCharging  → 0.60 (dimmed)
 *   Overnight (23:00–06:00)     → 0.30 (deeper dim, regardless of state)
 *
 * The overnight check ticks once per minute so transitioning into / out of the
 * dim window doesn't require a state change.
 */
export function useBrightness(
  state: DisplayState | undefined,
  clock: () => Date = () => new Date()
): number {
  const [isOvernight, setIsOvernight] = useState(() => inOvernightWindow(clock()));

  useEffect(() => {
    const tick = () => setIsOvernight(inOvernightWindow(clock()));
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [clock]);

  if (isOvernight) return 0.3;
  if (state === 'charging' || state === 'session_complete') return 1.0;
  return 0.6;
}

/** 23:00–05:59 local time. */
export function inOvernightWindow(now: Date): boolean {
  const h = now.getHours();
  return h >= 23 || h < 6;
}
