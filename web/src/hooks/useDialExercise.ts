import { useCallback, useEffect, useRef, useState } from 'react';
import type { DisplayState } from '../types/PumpState';
import { isProductionBuild } from '../lib/environment';

const STEP_INTERVAL_MS = 250;
const DEFAULT_INTERVAL_SECONDS = 3600;
const MIN_INTERVAL_SECONDS = 300;
const CHECK_INTERVAL_MS = 60_000;

/**
 * Once per `intervalSeconds` during idle (or immediately if the URL contains
 * `?exercise=now`), cycle a "step" counter 0..9 then null. The PumpDisplay
 * multiplies each step into per-dial values so every cell rolls through every
 * digit — looks like the pump is "ticking" and exercises pixels that would
 * otherwise hold the same digit for a long idle period.
 *
 * Returns the current exercise step (0..9) or null when not exercising.
 *
 * Pass `suspended=true` (e.g., during a post-session linger window) to prevent
 * both the auto-fire and the URL force-trigger from running. The lingering
 * just-completed session data takes priority over the exercise tick.
 *
 * `intervalSeconds` semantics:
 *   0 (or negative)             → disabled entirely; the hook never auto-fires
 *   1..299                      → clamped to 300 to prevent dial-exercise spam
 *   ≥ 300                       → respected as configured
 * `?exercise=now` still force-fires in dev builds regardless of interval,
 * since that's an explicit visual-review trigger.
 */
export function useDialExercise(
  state: DisplayState | undefined,
  suspended: boolean = false,
  intervalSeconds: number = DEFAULT_INTERVAL_SECONDS,
): number | null {
  const effectiveIntervalMs = normalizeInterval(intervalSeconds);
  const disabled = effectiveIntervalMs === null;
  const [step, setStep] = useState<number | null>(null);
  const lastExerciseAtRef = useRef(0);
  const runningRef = useRef(false);
  const stepTimerRef = useRef<number | null>(null);

  const runExercise = useCallback(() => {
    if (runningRef.current) return;
    runningRef.current = true;
    lastExerciseAtRef.current = Date.now();

    let i = 0;
    const tick = () => {
      if (i <= 9) {
        setStep(i);
        i++;
        stepTimerRef.current = window.setTimeout(tick, STEP_INTERVAL_MS);
      } else {
        setStep(null);
        runningRef.current = false;
        stepTimerRef.current = null;
      }
    };
    tick();
  }, []);

  // Force-trigger via ?exercise=now on mount. Disabled in production builds
  // so a bookmarked dev URL can't trigger an unwanted exercise on the pump.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (suspended) return;
    if (isProductionBuild()) return;
    const force = new URLSearchParams(window.location.search).get('exercise') === 'now';
    if (force) runExercise();
  }, [runExercise, suspended]);

  // Periodic check while idle. Skipped entirely when interval is 0 (disabled).
  useEffect(() => {
    if (suspended) return;
    if (state !== 'idle') return;
    if (disabled || effectiveIntervalMs === null) return;
    const id = window.setInterval(() => {
      if (Date.now() - lastExerciseAtRef.current >= effectiveIntervalMs) {
        runExercise();
      }
    }, CHECK_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [state, runExercise, suspended, disabled, effectiveIntervalMs]);

  // Cleanup any in-flight step timer on unmount.
  useEffect(() => {
    return () => {
      if (stepTimerRef.current !== null) {
        window.clearTimeout(stepTimerRef.current);
      }
    };
  }, []);

  return step;
}

/**
 * Translate a configured interval into a usable millisecond delay.
 * Returns null for the explicit "disabled" semantic (0 or negative).
 * Values 1..299 clamp to 300s to avoid dial-exercise spam.
 */
function normalizeInterval(intervalSeconds: number): number | null {
  if (!Number.isFinite(intervalSeconds) || intervalSeconds <= 0) return null;
  const clamped = Math.max(MIN_INTERVAL_SECONDS, intervalSeconds);
  return clamped * 1000;
}

/**
 * Per-dial multipliers chosen so step N renders as all-Ns in each dial's
 * formatted cell layout. Step 0 → 0 / 0.0 / 0.00; step 9 → 99.99 / 999.9 / 9.99.
 */
export const EXERCISE_MULTIPLIERS = {
  zone1Dollars: 11.11,   // digits=2 decimals=2 → 0.00..99.99
  zone4Kwh: 111.1,       // digits=3 decimals=1 → 0.0..999.9
  zone5Rate: 1.11,       // digits=1 decimals=2 → 0.00..9.99
} as const;
