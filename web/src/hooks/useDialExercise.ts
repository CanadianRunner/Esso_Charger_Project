import { useCallback, useEffect, useRef, useState } from 'react';
import type { DisplayState } from '../types/PumpState';

const STEP_INTERVAL_MS = 250;
const HOUR_MS = 60 * 60_000;
const CHECK_INTERVAL_MS = 60_000;

/**
 * Once per hour during idle (or immediately if the URL contains `?exercise=now`),
 * cycle a "step" counter 0..9 then null. The PumpDisplay multiplies each step
 * into per-dial values so every cell rolls through every digit — looks like the
 * pump is "ticking" once an hour and exercises pixels that would otherwise hold
 * the same digit for a long idle period.
 *
 * Returns the current exercise step (0..9) or null when not exercising.
 */
export function useDialExercise(state: DisplayState | undefined): number | null {
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

  // Force-trigger via ?exercise=now on mount.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const force = new URLSearchParams(window.location.search).get('exercise') === 'now';
    if (force) runExercise();
  }, [runExercise]);

  // Hourly check while idle.
  useEffect(() => {
    if (state !== 'idle') return;
    const id = window.setInterval(() => {
      if (Date.now() - lastExerciseAtRef.current >= HOUR_MS) {
        runExercise();
      }
    }, CHECK_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [state, runExercise]);

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
 * Per-dial multipliers chosen so step N renders as all-Ns in each dial's
 * formatted cell layout. Step 0 → 0 / 0.0 / 0.00; step 9 → 99.99 / 999.9 / 9.99.
 */
export const EXERCISE_MULTIPLIERS = {
  zone1Dollars: 11.11,   // digits=2 decimals=2 → 0.00..99.99
  zone4Kwh: 111.1,       // digits=3 decimals=1 → 0.0..999.9
  zone5Rate: 1.11,       // digits=1 decimals=2 → 0.00..9.99
} as const;
