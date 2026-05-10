import { useEffect, useRef, useState } from 'react';

export const ROLLING_CELL_WIDTH = 32;
export const ROLLING_CELL_HEIGHT = 48;
export const ROLL_DURATION_MS = 250;
export const ROLL_STAGGER_MS = 30;

const FONT_SIZE = 34;

interface RollingCellProps {
  char: string;
  cellIndex: number;
  showRightSeam?: boolean;
  /** Override the default digit font size — used by emoji cells which need
   *  ~20% smaller to sit cleanly inside the cell with breathing room. */
  fontSize?: number;
}

/**
 * Single mini-readout cell that rolls vertically from old character to new
 * character whenever the `char` prop changes. Character-agnostic — a roll from
 * "9" to ":" or " " to "✓" animates exactly the same as "9" to "0".
 *
 * Implementation: two-row reel with the old character on top, new on bottom,
 * sliding upward by one cell-height. After the animation settles, the reel
 * snaps back to the top (with both rows holding the new character) so the next
 * change can roll from the same starting offset.
 */
export default function RollingCell({
  char,
  cellIndex,
  showRightSeam = false,
  fontSize = FONT_SIZE,
}: RollingCellProps) {
  const [reel, setReel] = useState({
    top: char,
    bottom: char,
    offset: 0 as 0 | -1,
    animating: false,
  });
  const prevCharRef = useRef(char);

  useEffect(() => {
    if (prevCharRef.current === char) return;
    const oldChar = prevCharRef.current;
    prevCharRef.current = char;

    // Phase 1: render old on top, new on bottom, offset 0, transition off.
    setReel({ top: oldChar, bottom: char, offset: 0, animating: false });

    // Phase 2: next paint, enable transition + flip offset to -1 so the reel
    // rolls upward, sliding the bottom row into view.
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setReel({ top: oldChar, bottom: char, offset: -1, animating: true });
      });
    });

    // Phase 3: after animation completes, snap back to offset 0 with both
    // rows holding the new character. The next change can then roll from
    // the same starting position.
    const totalDuration = ROLL_DURATION_MS + cellIndex * ROLL_STAGGER_MS + 50;
    const tid = setTimeout(() => {
      setReel({ top: char, bottom: char, offset: 0, animating: false });
    }, totalDuration);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(tid);
    };
  }, [char, cellIndex]);

  const cellStyle: React.CSSProperties = {
    width: ROLLING_CELL_WIDTH,
    height: ROLLING_CELL_HEIGHT,
    color: '#f8f3e1',
    fontSize,
    textShadow: '0 2px 0 rgba(0,0,0,0.55), 0 -1px 0 rgba(255,255,255,0.04)',
  };

  return (
    <div
      className="relative overflow-hidden box-border font-odometer font-black tabular-nums leading-none select-none"
      style={{
        width: ROLLING_CELL_WIDTH,
        height: ROLLING_CELL_HEIGHT,
        background: '#0b0907',
        borderRight: showRightSeam ? '1px solid #050403' : undefined,
      }}
    >
      {/* Two-row reel — translates between offset 0 (top visible) and -1 (bottom visible). */}
      <div
        className="absolute inset-x-0 top-0"
        style={{
          transform: `translateY(${reel.offset * ROLLING_CELL_HEIGHT}px)`,
          transition: reel.animating
            ? `transform ${ROLL_DURATION_MS}ms ease-in-out ${cellIndex * ROLL_STAGGER_MS}ms`
            : 'none',
        }}
      >
        <div className="flex items-center justify-center" style={cellStyle}>
          {reel.top}
        </div>
        <div className="flex items-center justify-center" style={cellStyle}>
          {reel.bottom}
        </div>
      </div>

      {/* Cylinder surface — symmetric dark-middle-dark with a faint cream center. */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'linear-gradient(to bottom, ' +
            'rgba(0, 0, 0, 0.22) 0%, ' +
            'rgba(0, 0, 0, 0.03) 22%, ' +
            'rgba(255, 240, 210, 0.07) 50%, ' +
            'rgba(0, 0, 0, 0.03) 78%, ' +
            'rgba(0, 0, 0, 0.22) 100%)',
        }}
      />

      {/* Halogen light — fixed warm tint from above. */}
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
        }}
      />

      {/* Cylindrical curve at top/bottom edges. */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          boxShadow:
            'inset 0 6px 10px -6px rgba(0, 0, 0, 0.95), ' +
            'inset 0 -6px 10px -6px rgba(0, 0, 0, 0.95)',
        }}
      />

      {/* Recessed cutout — sharp 2px top shadow. */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ boxShadow: 'inset 0 2px 1px rgba(0, 0, 0, 0.7)' }}
      />
    </div>
  );
}
