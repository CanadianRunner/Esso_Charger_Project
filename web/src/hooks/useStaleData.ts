import { useEffect, useState } from 'react';

export function useStaleData(receivedAt: number | null, thresholdMs: number = 15_000): boolean {
  const [isStale, setIsStale] = useState(false);

  useEffect(() => {
    if (receivedAt === null) {
      setIsStale(false);
      return;
    }
    const tick = () => setIsStale(Date.now() - receivedAt > thresholdMs);
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [receivedAt, thresholdMs]);

  return isStale;
}
