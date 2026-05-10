import { useEffect, useState } from 'react';

interface CrossFadeProps {
  text: string;
  className?: string;
  style?: React.CSSProperties;
  durationMs?: number;
}

interface FadeState {
  even: string;
  odd: string;
  active: 'even' | 'odd';
}

/**
 * Two-slot opacity cross-fade. When `text` changes, the inactive slot picks up
 * the new text and fades in while the active slot fades out. After the fade
 * completes, the inactive slot is cleared so only one element holds visible text
 * at rest (keeps the DOM clean for tests and screen readers).
 */
export default function CrossFade({
  text,
  className,
  style,
  durationMs = 250,
}: CrossFadeProps) {
  const [s, setS] = useState<FadeState>({ even: text, odd: '', active: 'even' });

  useEffect(() => {
    setS((prev) => {
      const last = prev.active === 'even' ? prev.even : prev.odd;
      if (last === text) return prev;
      return prev.active === 'even'
        ? { ...prev, odd: text, active: 'odd' }
        : { ...prev, even: text, active: 'even' };
    });

    const id = setTimeout(() => {
      setS((prev) =>
        prev.active === 'even' ? { ...prev, odd: '' } : { ...prev, even: '' }
      );
    }, durationMs);
    return () => clearTimeout(id);
  }, [text, durationMs]);

  const baseStyle: React.CSSProperties = {
    ...style,
    transition: `opacity ${durationMs}ms ease-in-out`,
  };

  return (
    <span className="relative inline-block">
      <span
        className={className}
        style={{
          ...baseStyle,
          opacity: s.active === 'even' ? 1 : 0,
        }}
      >
        {s.even}
      </span>
      <span
        className={className}
        style={{
          ...baseStyle,
          position: 'absolute',
          top: 0,
          left: 0,
          opacity: s.active === 'odd' ? 1 : 0,
        }}
      >
        {s.odd}
      </span>
    </span>
  );
}
