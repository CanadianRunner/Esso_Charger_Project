import RollingCell, { ROLLING_CELL_WIDTH } from './RollingCell';
import CrossFade from '../shared/CrossFade';
import { READOUT_CELL_COUNT } from '../../lib/displayFormat';

export interface MiniReadoutProps {
  icon: string;
  /** Exactly READOUT_CELL_COUNT characters; will be padded/truncated if not. */
  value: string;
  unit?: string;
}

const UNIT_SLOT_WIDTH = 112;
const TOTAL_CELL_COUNT = READOUT_CELL_COUNT + 1;  // emoji cell + character cells
const CELLS_TOTAL_WIDTH = TOTAL_CELL_COUNT * ROLLING_CELL_WIDTH;
const FADE_DURATION_MS = 250;

/**
 * Long horizontal slot readout. Layout:
 *
 *   [emoji cell] [7 character cells] [unit slot right-aligned]
 *
 * The emoji cell is the leftmost in the cell row — same dimensions and lighting
 * treatment as the digit cells, just holding an icon instead of a digit. It
 * rolls to the next emoji on rotation as cellIndex 0 (starts first; the digit
 * cells follow with the standard 30ms left-to-right stagger).
 */
export default function MiniReadout({ icon, value, unit = '' }: MiniReadoutProps) {
  // Defensive: enforce exactly READOUT_CELL_COUNT cells regardless of caller.
  // Use Array.from for code-point-aware splitting so multi-byte emojis (🔌,
  // 🗓️, etc.) count as a single user-perceived character, not a surrogate pair.
  const chars = splitToCells(value, READOUT_CELL_COUNT);

  return (
    <div className="flex items-center gap-2 font-odometer">
      <div className="flex items-stretch" style={{ width: CELLS_TOTAL_WIDTH }}>
        <RollingCell
          key="icon"
          char={icon}
          cellIndex={0}
          showRightSeam
          fontSize={27}
        />
        {chars.map((ch, i) => (
          <RollingCell
            key={`c${i}`}
            char={ch}
            cellIndex={i + 1}
            showRightSeam={i < READOUT_CELL_COUNT - 1}
          />
        ))}
      </div>

      <div
        style={{
          width: UNIT_SLOT_WIDTH,
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
        }}
      >
        <CrossFade
          text={unit}
          className="font-black uppercase tracking-wider text-sm leading-none whitespace-nowrap"
          style={{ color: 'rgba(248, 243, 225, 0.55)' }}
          durationMs={FADE_DURATION_MS}
        />
      </div>
    </div>
  );
}

/**
 * Code-point-aware split. `Array.from` walks Unicode code points, so 🔌 (a
 * surrogate pair in UTF-16) counts as one cell instead of two. Pads with '0'
 * on the left if the value is shorter than `cellCount`, slices to the last
 * `cellCount` code points if longer.
 */
function splitToCells(value: string, cellCount: number): string[] {
  const codePoints = Array.from(value);
  if (codePoints.length >= cellCount) {
    return codePoints.slice(-cellCount);
  }
  const padding = Array(cellCount - codePoints.length).fill('0');
  return [...padding, ...codePoints];
}
