import { useEffect, useState } from 'react';
import type { DisplayState } from '../types/PumpState';

const DEFAULT_ACTIVE = 1.0;
const DEFAULT_DIM = 0.6;
const DEFAULT_OVERNIGHT = 0.3;
const DEFAULT_START_HOUR = 23;
const DEFAULT_END_HOUR = 6;

export interface BrightnessConfig {
  active?: number;
  dim?: number;
  overnight?: number;
  overnightStartHour?: number;
  overnightEndHour?: number;
}

/**
 * Returns a brightness factor (0..1) to apply via CSS `filter: brightness()`
 * on the kiosk display.
 *
 *   Charging / SessionComplete → `active` (default 1.0)
 *   Idle / PluggedNotCharging  → `dim` (default 0.6)
 *   Inside overnight window     → `overnight` (default 0.3, regardless of state)
 *
 * All brightness values are defensively clamped to [0, 1]. CSS accepts >1 but
 * produces washed-out artifacts on real displays, so we cap at 1.0.
 *
 * The overnight window is in local-time hours. It can cross midnight (e.g.,
 * default 23 → 6) or stay within a calendar day (e.g., 14 → 17). Setting
 * `overnightStartHour === overnightEndHour` disables overnight dimming
 * entirely — this is the intentional way for the Settings UI to expose an
 * "Enable overnight dimming" toggle. The overnight check ticks once per
 * minute so transitioning into / out of the dim window doesn't require a
 * pumpState push.
 */
export function useBrightness(
  state: DisplayState | undefined,
  clock: () => Date = () => new Date(),
  config: BrightnessConfig = {},
): number {
  const active = clamp01(config.active ?? DEFAULT_ACTIVE);
  const dim = clamp01(config.dim ?? DEFAULT_DIM);
  const overnight = clamp01(config.overnight ?? DEFAULT_OVERNIGHT);
  const startHour = clampHour(config.overnightStartHour ?? DEFAULT_START_HOUR);
  const endHour = clampHour(config.overnightEndHour ?? DEFAULT_END_HOUR);

  const [isOvernight, setIsOvernight] = useState(() =>
    inOvernightWindow(clock(), startHour, endHour),
  );

  useEffect(() => {
    const tick = () => setIsOvernight(inOvernightWindow(clock(), startHour, endHour));
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [clock, startHour, endHour]);

  if (isOvernight) return overnight;
  if (state === 'charging' || state === 'session_complete') return active;
  return dim;
}

/**
 * Returns true if `now` falls inside the overnight dimming window.
 *   start === end → disabled (always false)
 *   start  <  end → simple range, e.g. 14 → 17
 *   start  >  end → cross-midnight range, e.g. 23 → 6
 */
export function inOvernightWindow(
  now: Date,
  startHour = DEFAULT_START_HOUR,
  endHour = DEFAULT_END_HOUR,
): boolean {
  if (startHour === endHour) return false;
  const h = now.getHours();
  if (startHour < endHour) return h >= startHour && h < endHour;
  return h >= startHour || h < endHour;
}

function clamp01(v: number): number {
  if (Number.isNaN(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function clampHour(v: number): number {
  if (Number.isNaN(v)) return 0;
  return Math.max(0, Math.min(23, Math.trunc(v)));
}
