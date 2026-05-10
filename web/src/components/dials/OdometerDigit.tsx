import { useEffect, useLayoutEffect, useRef, useState } from 'react';

interface OdometerDigitProps {
  digit: number;        // 0..9
  digitHeight: number;  // px height of one digit cell
  digitWidth: number;   // px width of the cell
  fontSize: number;     // px font size
  hasDCap?: boolean;    // half-circle right cap (Zones 1, 4 rightmost only)
}

const TRANSITION_MS = 300;

/**
 * Single rolling digit. Renders cells 0..9 plus a duplicate 0 at index 10
 * so a 9 → 0 transition can animate forward (to position 10) and then
 * snap back to position 0 with transitions disabled — never visually rewinding.
 */
export default function OdometerDigit({
  digit,
  digitHeight,
  digitWidth,
  fontSize,
  hasDCap = false,
}: OdometerDigitProps) {
  const [position, setPosition] = useState(digit);
  const [animate, setAnimate] = useState(true);
  const previous = useRef(digit);
  const snapBackTimer = useRef<number | null>(null);

  useEffect(() => {
    if (digit === previous.current) return;

    if (previous.current === 9 && digit === 0) {
      // Forward wrap: animate down to the duplicate 0 at index 10, then snap back.
      setAnimate(true);
      setPosition(10);
      snapBackTimer.current = window.setTimeout(() => {
        setAnimate(false);
        setPosition(0);
      }, TRANSITION_MS);
    } else {
      setAnimate(true);
      setPosition(digit);
    }

    previous.current = digit;

    return () => {
      if (snapBackTimer.current !== null) {
        window.clearTimeout(snapBackTimer.current);
        snapBackTimer.current = null;
      }
    };
  }, [digit]);

  // Re-enable transitions one frame after a snap-back so subsequent changes animate.
  useLayoutEffect(() => {
    if (animate) return;
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setAnimate(true)));
    return () => cancelAnimationFrame(id);
  }, [animate]);

  // Window is 1.4× the digit height per spec — focused digit centered, partial
  // digits visible above and below.
  const windowHeight = Math.round(digitHeight * 1.4);
  const padding = Math.round((windowHeight - digitHeight) / 2);

  const cells = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0]; // 11 entries, last is wrap target

  const cornerRadius = hasDCap
    ? { borderTopRightRadius: '50%', borderBottomRightRadius: '50%' }
    : { borderTopRightRadius: 0, borderBottomRightRadius: 0 };

  return (
    <div
      className="relative overflow-hidden bg-black"
      style={{
        width: digitWidth,
        height: windowHeight,
        // Deep warm near-black reads as painted metal rather than an LCD pixel grid.
        background: '#0b0907',
        ...cornerRadius,
      }}
    >
      {/* Rolling reel — digits translate underneath the fixed lighting overlays. */}
      <div
        style={{
          transform: `translateY(${padding - position * digitHeight}px)`,
          transition: animate ? `transform ${TRANSITION_MS}ms ease-in-out` : 'none',
        }}
      >
        {cells.map((d, i) => (
          <div
            key={i}
            className="flex items-center justify-center font-odometer font-black tabular-nums leading-none select-none"
            style={{
              height: digitHeight,
              width: digitWidth,
              fontSize,
              color: '#f8f3e1',
              // Subtle dark drop-shadow on the digit gives a hint of depth/embossing
              // against the drum surface.
              textShadow: '0 2px 0 rgba(0,0,0,0.55), 0 -1px 0 rgba(255,255,255,0.04)',
            }}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Halogen light: fixed on the window, brightest at top, fading into ambient
          darkness near the bottom. Warm ~2700K tint sells incandescent over daylight. */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'linear-gradient(to bottom, ' +
            'rgba(255, 232, 175, 0.22) 0%, ' +
            'rgba(255, 232, 175, 0.10) 28%, ' +
            'rgba(255, 232, 175, 0.00) 55%, ' +
            'rgba(0, 0, 0, 0.18) 85%, ' +
            'rgba(0, 0, 0, 0.32) 100%)',
          ...cornerRadius,
        }}
      />

      {/* Cylindrical curve: top and bottom edges of the window look like the drum is
          bending away from view, not a flat scrolling strip. */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          boxShadow:
            'inset 0 10px 14px -8px rgba(0,0,0,0.95), ' +
            'inset 0 -10px 14px -8px rgba(0,0,0,0.95)',
          ...cornerRadius,
        }}
      />
    </div>
  );
}
