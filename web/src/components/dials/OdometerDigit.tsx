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

  return (
    <div
      className="relative overflow-hidden bg-black"
      style={{
        width: digitWidth,
        height: windowHeight,
        borderTopRightRadius: hasDCap ? '50%' : 0,
        borderBottomRightRadius: hasDCap ? '50%' : 0,
      }}
    >
      <div
        style={{
          transform: `translateY(${padding - position * digitHeight}px)`,
          transition: animate ? `transform ${TRANSITION_MS}ms ease-in-out` : 'none',
        }}
      >
        {cells.map((d, i) => (
          <div
            key={i}
            className="flex items-center justify-center text-white font-odometer font-black tabular-nums leading-none select-none"
            style={{
              height: digitHeight,
              width: digitWidth,
              fontSize,
            }}
          >
            {d}
          </div>
        ))}
      </div>
    </div>
  );
}
