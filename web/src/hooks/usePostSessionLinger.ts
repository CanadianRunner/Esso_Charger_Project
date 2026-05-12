import { useEffect, useRef, useState } from 'react';
import type { DisplayState, PumpStateSession } from '../types/PumpState';
import { isProductionBuild } from '../lib/environment';

export type LingerPhase = 'none' | 'bright' | 'dim' | 'fading_out';

export interface LingerData {
  costCents: number;
  energyKwh: number;
  durationSeconds: number;
}

export interface UsePostSessionLingerArgs {
  state: DisplayState | undefined;
  session: PumpStateSession | null;
  brightSeconds?: number;   // duration of full-brightness phase, default 300 (5 min)
  dimSeconds?: number;      // duration of dimmed phase, default 600 (10 min more)
  fadeMs?: number;          // fade-out duration before reset, default 600
  speedFactor?: number;     // 1 = real time; 10 = 10x faster for visual testing
}

export interface UsePostSessionLingerResult {
  phase: LingerPhase;
  data: LingerData | null;
  isLingering: boolean;     // true during bright, dim, or fading_out
  brightnessOverride: number | undefined;
}

/**
 * After a charging session ends, hold the just-completed session's data on the
 * display for a configurable window before resetting to all-zero idle.
 *
 *   T+0..bright:        100% brightness, frozen data (display state = session_complete)
 *   bright..bright+dim: 60%  brightness, same frozen data
 *   bright+dim..+fade:  fading_out — opacity drops so the data swap isn't a hard snap
 *   after fade:         linger ends, real idle resumes
 *
 * Any new plug-in (state → plugged_not_charging or charging) immediately cancels
 * the linger so the new session takes over without bleed-through.
 *
 * The linger window is purely a frontend UX convenience — nothing is persisted,
 * so a Pi reboot during the window starts fresh at idle. That's intentional.
 */
export function usePostSessionLinger({
  state,
  session,
  brightSeconds = 300,
  dimSeconds = 600,
  fadeMs = 600,
  speedFactor = 1,
}: UsePostSessionLingerArgs): UsePostSessionLingerResult {
  const [linger, setLinger] = useState<{ phase: LingerPhase; data: LingerData | null }>({
    phase: 'none',
    data: null,
  });

  const prevStateRef = useRef<DisplayState | undefined>(state);
  const prevSessionRef = useRef<PumpStateSession | null>(session);

  const timersRef = useRef<number[]>([]);
  const cancelTimers = () => {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
  };

  useEffect(() => {
    const prevState = prevStateRef.current;
    const prevSession = prevSessionRef.current;
    prevStateRef.current = state;
    prevSessionRef.current = session;

    // Trigger: charging or session_complete → idle.
    const justUnplugged =
      (prevState === 'charging' || prevState === 'session_complete') && state === 'idle';

    if (justUnplugged) {
      // At the moment of unplug the new `session` prop is null — capture the
      // last session data from the previous render instead.
      const captured: LingerData = {
        costCents: prevSession?.costCents ?? 0,
        energyKwh: prevSession?.energyKwh ?? 0,
        durationSeconds: prevSession?.durationSeconds ?? 0,
      };

      cancelTimers();
      setLinger({ phase: 'bright', data: captured });

      const brightMs = (brightSeconds * 1000) / speedFactor;
      const dimMs = (dimSeconds * 1000) / speedFactor;
      const fadeOutMs = fadeMs / speedFactor;

      // bright → dim
      timersRef.current.push(
        window.setTimeout(() => {
          setLinger((prev) => ({ ...prev, phase: 'dim' }));
        }, brightMs)
      );
      // dim → fading_out (start the data-reset fade)
      timersRef.current.push(
        window.setTimeout(() => {
          setLinger((prev) => ({ ...prev, phase: 'fading_out' }));
        }, brightMs + dimMs)
      );
      // fading_out → none (linger fully ends, real idle takes over)
      timersRef.current.push(
        window.setTimeout(() => {
          setLinger({ phase: 'none', data: null });
        }, brightMs + dimMs + fadeOutMs)
      );
      return;
    }

    // Cancel: new plug-in during any linger phase.
    const isNewSession = state === 'plugged_not_charging' || state === 'charging';
    if (isNewSession) {
      setLinger((prev) => {
        if (prev.phase === 'none') return prev;
        cancelTimers();
        return { phase: 'none', data: null };
      });
    }
  }, [state, session, brightSeconds, dimSeconds, fadeMs, speedFactor]);

  useEffect(() => () => cancelTimers(), []);

  const brightnessOverride =
    linger.phase === 'bright' ? 1.0
      : linger.phase === 'dim' || linger.phase === 'fading_out' ? 0.6
        : undefined;

  return {
    phase: linger.phase,
    data: linger.data,
    isLingering: linger.phase !== 'none',
    brightnessOverride,
  };
}

/**
 * Reads `?lingerSpeed=N` from the URL for compressed visual testing.
 * Always returns 1 in production builds so a bookmarked dev URL can't
 * accidentally accelerate the live lifecycle on the installed pump.
 */
export function getLingerSpeedOverride(): number {
  if (isProductionBuild()) return 1;
  if (typeof window === 'undefined') return 1;
  const v = new URLSearchParams(window.location.search).get('lingerSpeed');
  if (!v) return 1;
  const n = parseFloat(v);
  return Number.isFinite(n) && n > 0 ? n : 1;
}
