// Mini-readout formatting: every readout produces exactly READOUT_CELL_COUNT
// characters with leading-zero padding so the cell row never reflows. The cell
// at any given index always exists; what changes between rotations is which
// character (digit, decimal, colon, blank) sits in it.

export const READOUT_CELL_COUNT = 7;

/**
 * ddddd.d format, 7 chars total. Decimal point gets its own cell, consistent
 * with the OdometerDial's visual treatment.
 *   12.3   → "00012.3"
 *   1234.5 → "01234.5"
 *   0      → "00000.0"
 */
export function formatDecimal(value: number): string {
  const clamped = Math.max(0, Math.min(99999.9, value));
  return clamped.toFixed(1).padStart(READOUT_CELL_COUNT, '0');
}

/**
 * 7-digit integer with leading zeros, no decimal cell.
 *   47 → "0000047"
 */
export function formatInteger(value: number): string {
  const clamped = Math.max(0, Math.min(9999999, Math.floor(value)));
  return clamped.toString().padStart(READOUT_CELL_COUNT, '0');
}

/**
 * H:MM format padded with leading zeros to 7 chars total. Colon takes its own
 * cell. Hours up to 9999 fit; longer durations clamp to "9999:59".
 *   60s   (1 min)   → "0000:01"
 *   9900s (165 min) → "0002:45"
 *   36000s (10 h)   → "0010:00"
 *   360000s (100 h) → "0100:00"
 */
export function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const display = `${h}:${m.toString().padStart(2, '0')}`;
  if (display.length > READOUT_CELL_COUNT) return '9999:59';
  return display.padStart(READOUT_CELL_COUNT, '0');
}

/** Centered checkmark with three blank cells on each side. */
export const READOUT_DONE = '   ✓   ';

/**
 * H:MM:SS exactly 7 cells, capped at 9:59:59. Used for session-complete
 * rotation where we want second-precision on the duration readout.
 *   60s    → "0:01:00"
 *   3725s  → "1:02:05"
 */
export function formatHmsExact(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const capped = Math.min(safe, 9 * 3600 + 59 * 60 + 59);
  const h = Math.floor(capped / 3600);
  const m = Math.floor((capped % 3600) / 60);
  const s = capped % 60;
  return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

/**
 * USD cost in `dddd.dd` format, 7 cells. Input is dollars (e.g., 1.60 for $1.60).
 * Capped at 9999.99.
 */
export function formatCostUsd(dollars: number): string {
  const safe = Math.max(0, dollars);
  const capped = Math.min(9999.99, safe);
  return capped.toFixed(2).padStart(READOUT_CELL_COUNT, '0');
}

/**
 * True-idle "READY" display content for cells 1..7 (cell 0 stays blank via
 * `icon: ' '`). Seven code points: lightning + R E A D Y + plug. The plug
 * emoji is a UTF-16 surrogate pair so MiniReadout splits with Array.from to
 * count user-perceived characters correctly.
 */
export const READOUT_READY = '⚡READY🔌';
