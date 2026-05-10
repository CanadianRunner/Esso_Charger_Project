import { useEffect, useState } from 'react';

/**
 * Returns an index that cycles 0..count-1 every `intervalMs`. When count <= 1,
 * stays at 0 (no rotation). Resets to 0 if count changes.
 */
export function useRotatingIndex(count: number, intervalMs: number = 10_000): number {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
    if (count <= 1) return;
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % count);
    }, intervalMs);
    return () => clearInterval(id);
  }, [count, intervalMs]);

  return index;
}
