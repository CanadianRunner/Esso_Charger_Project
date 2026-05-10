import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';

interface OdometerDigitProps {
  digit: number;        // 0..9
  digitHeight: number;  // px height of one digit cell
  digitWidth: number;   // px width of the cell
  fontSize: number;     // px font size
  hasDCap?: boolean;    // half-circle right cap (Zones 1, 4 rightmost only)
  shrunkenDigit?: boolean;  // render the rolling digit at ~70% size, anchored left
  showArrow?: boolean;      // overlay a red leftward pointer in the right portion
  showRightSeam?: boolean;  // 1px dark divider on the right edge — drum seam between cells
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
  shrunkenDigit = false,
  showArrow = false,
  showRightSeam = false,
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

  // When shrunken (tenths position), the rolling digit takes ~70% size and
  // anchors to the left of the cell, leaving room on the right for the arrow.
  const renderedFontSize = shrunkenDigit ? Math.round(fontSize * 0.7) : fontSize;
  const cellAlignment = shrunkenDigit ? 'flex items-center justify-start' : 'flex items-center justify-center';
  const cellPadding = shrunkenDigit ? Math.round(digitWidth * 0.15) : 0;

  // Drum seam: 1px dark divider on the right edge, suggesting individual physical
  // wheels with a thin metal divider between them rather than one continuous strip.
  const seamBorder = showRightSeam ? { borderRight: '1px solid #050403' } : {};

  return (
    <div
      className="relative overflow-hidden bg-black box-border"
      style={{
        width: digitWidth,
        height: windowHeight,
        // Deep warm near-black reads as painted metal rather than an LCD pixel grid.
        background: '#0b0907',
        ...cornerRadius,
        ...seamBorder,
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
            className={`${cellAlignment} font-odometer font-black tabular-nums leading-none select-none`}
            style={{
              height: digitHeight,
              width: digitWidth,
              fontSize: renderedFontSize,
              paddingLeft: cellPadding,
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

      {/* Cylinder surface: symmetric dark-middle-dark gradient with a faint cream
          tint in the central band. Models the drum's cylindrical curvature — the
          surface faces the viewer most directly in the middle, curves away at top
          and bottom. Low contrast so it complements rather than fights the halogen
          layer above. */}
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
          ...cornerRadius,
        }}
      />

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

      {/* Cylindrical curve: soft top/bottom edge darkening so the digit strip
          appears to bend out of view rather than scroll on a flat plane. */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          boxShadow:
            'inset 0 10px 14px -8px rgba(0,0,0,0.95), ' +
            'inset 0 -10px 14px -8px rgba(0,0,0,0.95)',
          ...cornerRadius,
        }}
      />

      {/* Recessed cutout: a sharp 2px inset shadow at the very top, simulating
          the edge of the metal pump face casting a shadow down into the cutout. */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          boxShadow: 'inset 0 2px 1px rgba(0, 0, 0, 0.7)',
          ...cornerRadius,
        }}
      />

      {showArrow && <RedPointerArrow cellHeight={windowHeight} cellWidth={digitWidth} />}
    </div>
  );
}

function RedPointerArrow({ cellHeight, cellWidth }: { cellHeight: number; cellWidth: number }) {
  const uid = useId().replace(/[:]/g, '');
  const gradId = `arrowGrad-${uid}`;

  const arrowWidth = Math.round(cellWidth * 0.32);
  const arrowHeight = Math.round(cellHeight * 0.20);
  const rightOffset = Math.round(cellWidth * 0.05);

  return (
    <div
      className="absolute pointer-events-none"
      style={{
        right: rightOffset,
        top: '50%',
        transform: 'translateY(-50%)',
        width: arrowWidth,
        height: arrowHeight,
        // Soft offset shadow gives physical depth without competing with the
        // surface lighting baked into the fill itself.
        filter: 'drop-shadow(1px 2px 3px rgba(0, 0, 0, 0.30))',
      }}
    >
      <svg viewBox="0 0 32 22" width="100%" height="100%" preserveAspectRatio="none">
        <defs>
          {/* Compressed radial gradient — mid-warm red dominates the body, with
              only a subtle warmer lift toward the upper edge and a subtle cooler
              shadow toward the lower edge. No near-white peak, no near-black
              valley — both read as separate light sources rather than as the
              same overhead halogen lighting the rest of the dial. */}
          <radialGradient
            id={gradId}
            cx="0.55"
            cy="0.25"
            r="0.9"
            fx="0.6"
            fy="0.22"
          >
            <stop offset="0%" stopColor="#d56b5a" />
            <stop offset="30%" stopColor="#b53e2e" />
            <stop offset="100%" stopColor="#8a2a20" />
          </radialGradient>
        </defs>

        <polygon points="30,3 6,11 30,19" fill={`url(#${gradId})`} />
      </svg>
    </div>
  );
}
