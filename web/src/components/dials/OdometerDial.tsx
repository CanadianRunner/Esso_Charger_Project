import OdometerDigit from './OdometerDigit';

export interface OdometerDialProps {
  value: number;
  digits: number;            // integer-side digit count
  decimals?: number;          // decimal-side digit count (default 0)
  size?: 'small' | 'large';
  hasDCap?: boolean;          // half-circle on the rightmost digit
}

const SIZES = {
  large: { digitHeight: 120, digitWidth: 96, fontSize: 104, decimalSize: 56 },
  small: { digitHeight: 64,  digitWidth: 52, fontSize: 56,  decimalSize: 32 },
} as const;

/**
 * Mechanical-odometer-style number display. Each integer digit is a rolling
 * reel; the decimal point is a static cell. Per spec the rightmost integer
 * (or rightmost decimal if `decimals > 0`) gets the optional D-cap.
 */
export default function OdometerDial({
  value,
  digits,
  decimals = 0,
  size = 'large',
  hasDCap = false,
}: OdometerDialProps) {
  const { digitHeight, digitWidth, fontSize, decimalSize } = SIZES[size];

  const formatted = formatValue(value, digits, decimals);
  // formatted is a fixed-width string like "012.3" or "4567"
  // We render one cell per character: digits → OdometerDigit, '.' → static dot.

  const lastIndex = formatted.length - 1;

  return (
    <div className="flex items-stretch gap-0.5 font-odometer">
      {formatted.split('').map((ch, i) => {
        if (ch === '.') {
          return (
            <DecimalCell
              key={`dot-${i}`}
              digitHeight={digitHeight}
              fontSize={decimalSize}
            />
          );
        }
        return (
          <OdometerDigit
            key={`d-${i}`}
            digit={parseInt(ch, 10)}
            digitHeight={digitHeight}
            digitWidth={digitWidth}
            fontSize={fontSize}
            hasDCap={hasDCap && i === lastIndex}
          />
        );
      })}
    </div>
  );
}

function DecimalCell({ digitHeight, fontSize }: { digitHeight: number; fontSize: number }) {
  const windowHeight = Math.round(digitHeight * 1.4);
  return (
    <div
      className="flex items-end justify-center bg-black text-white font-black select-none"
      style={{ height: windowHeight, width: Math.round(fontSize * 0.6), paddingBottom: digitHeight * 0.15, fontSize }}
    >
      .
    </div>
  );
}

export function formatValue(value: number, digits: number, decimals: number): string {
  const safeValue = Math.max(0, value);
  // Clamp to the largest representable value so a bug upstream can't blow up the layout.
  const max = Math.pow(10, digits) - Math.pow(10, -decimals);
  const clamped = Math.min(safeValue, max);

  // Round to `decimals` precision, then split.
  const rounded = clamped.toFixed(decimals);
  const [intPart, decPart] = rounded.split('.');
  const padded = intPart.padStart(digits, '0').slice(-digits);

  return decimals > 0 ? `${padded}.${decPart}` : padded;
}
