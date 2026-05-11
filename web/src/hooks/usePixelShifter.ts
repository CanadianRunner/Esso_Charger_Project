import { useEffect, useState } from 'react';

export interface PixelShift {
  x: number;
  y: number;
}

const SHIFT_INTERVAL_MS = 60_000;

/**
 * Returns a small ±1px transform offset that changes every 60 seconds. Applied
 * to the kiosk container, this nudges static content (zone labels, dial frames,
 * digit shapes) to slightly different pixels over time, preventing LED/OLED
 * burn-in over weeks of always-on operation. The shift is imperceptible to a
 * viewer but exercises adjacent pixels.
 */
export function usePixelShifter(intervalMs: number = SHIFT_INTERVAL_MS): PixelShift {
  const [shift, setShift] = useState<PixelShift>({ x: 0, y: 0 });

  useEffect(() => {
    const tick = () => {
      setShift({
        x: Math.random() < 0.5 ? -1 : 1,
        y: Math.random() < 0.5 ? -1 : 1,
      });
    };
    const id = setInterval(tick, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return shift;
}
