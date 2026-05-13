import { useMemo } from 'react';
import type { PowerSample } from '../../types/AdminSession';
import {
  buildChartPaths,
  catmullRomPath,
  medianSampleInterval,
  niceAxis,
  segmentSamples,
} from './powerChartMath';

const WIDTH = 800;
const HEIGHT = 280;
const PAD_LEFT = 50;
const PAD_RIGHT = 12;
const PAD_TOP = 12;
const PAD_BOTTOM = 30;
const STROKE_COLOR = '#f8f3e1'; // cream — matches the kiosk dial digits
const GRID_COLOR = 'rgba(248, 243, 225, 0.08)';
const AXIS_LABEL_COLOR = 'rgba(248, 243, 225, 0.45)';
const BG_COLOR = '#0a0a0a'; // warm-near-black

// Use the catmullRomPath helper indirectly via buildChartPaths so this import
// stays referenced for tests that want to import it directly without dead-code.
void catmullRomPath;

interface PowerChartProps {
  samples: PowerSample[];
  /**
   * Override the gap threshold used to break the chart at session-merge
   * discontinuities. Defaults to 3 * median inter-sample interval, which
   * adapts automatically to the configured sample cadence.
   */
  gapThresholdSeconds?: number;
}

export default function PowerChart({ samples, gapThresholdSeconds }: PowerChartProps) {
  const built = useMemo(() => {
    if (samples.length === 0) return null;
    const sorted = [...samples].sort((a, b) => a.unixSecondsUtc - b.unixSecondsUtc);
    const interval = medianSampleInterval(sorted);
    const threshold = gapThresholdSeconds ?? interval * 3;
    const segments = segmentSamples(sorted, threshold);

    const t0 = sorted[0].unixSecondsUtc;
    const t1 = sorted[sorted.length - 1].unixSecondsUtc;
    // Avoid div-by-zero on a session with one sample or zero-duration samples.
    const tSpan = Math.max(1, t1 - t0);
    const maxKw = Math.max(...sorted.map((s) => s.kw));
    const yAxis = niceAxis(maxKw);

    const plotW = WIDTH - PAD_LEFT - PAD_RIGHT;
    const plotH = HEIGHT - PAD_TOP - PAD_BOTTOM;

    const scaleX = (t: number) => PAD_LEFT + ((t - t0) / tSpan) * plotW;
    const scaleY = (kw: number) => PAD_TOP + plotH - (kw / yAxis.niceMax) * plotH;
    const baselineY = PAD_TOP + plotH;

    const scaledSegments = segments.map((seg) =>
      seg.map((s) => ({ x: scaleX(s.unixSecondsUtc), y: scaleY(s.kw) })),
    );

    const { stroke, fill } = buildChartPaths(scaledSegments, baselineY);

    // 5 evenly-spaced x ticks between t0 and t1.
    const xTicks: { x: number; label: string }[] = [];
    const tickCount = 5;
    for (let i = 0; i <= tickCount; i++) {
      const t = t0 + (tSpan * i) / tickCount;
      xTicks.push({ x: scaleX(t), label: formatTickTime(t) });
    }

    const yTicks = yAxis.ticks.map((kw) => ({ y: scaleY(kw), label: formatKw(kw) }));

    return {
      stroke,
      fill,
      xTicks,
      yTicks,
      baselineY,
      plotW,
      plotH,
      yMax: yAxis.niceMax,
    };
  }, [samples, gapThresholdSeconds]);

  if (built === null) {
    return (
      <div
        className="rounded-lg border border-neutral-800 bg-neutral-950 flex items-center justify-center text-sm text-neutral-500"
        style={{ height: HEIGHT }}
      >
        No power data recorded for this session yet.
      </div>
    );
  }

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label="Charging power over time"
      preserveAspectRatio="xMidYMid meet"
      className="w-full rounded-lg border border-neutral-800"
      style={{ background: BG_COLOR }}
    >
      <defs>
        <linearGradient id="power-chart-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={STROKE_COLOR} stopOpacity="0.20" />
          <stop offset="100%" stopColor={STROKE_COLOR} stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Horizontal gridlines at each y tick */}
      {built.yTicks.map((t, i) => (
        <line
          key={`yg-${i}`}
          x1={PAD_LEFT}
          x2={WIDTH - PAD_RIGHT}
          y1={t.y}
          y2={t.y}
          stroke={GRID_COLOR}
          strokeWidth={1}
        />
      ))}

      {/* Filled area under the curve */}
      <path d={built.fill} fill="url(#power-chart-fill)" />

      {/* Stroke on top */}
      <path
        d={built.stroke}
        fill="none"
        stroke={STROKE_COLOR}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* Y-axis tick labels */}
      {built.yTicks.map((t, i) => (
        <text
          key={`yl-${i}`}
          x={PAD_LEFT - 6}
          y={t.y + 4}
          textAnchor="end"
          fontSize={11}
          fill={AXIS_LABEL_COLOR}
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        >
          {t.label}
        </text>
      ))}

      {/* X-axis tick marks + labels */}
      {built.xTicks.map((t, i) => (
        <g key={`xl-${i}`}>
          <line
            x1={t.x}
            x2={t.x}
            y1={built.baselineY}
            y2={built.baselineY + 4}
            stroke={AXIS_LABEL_COLOR}
            strokeWidth={1}
          />
          <text
            x={t.x}
            y={built.baselineY + 18}
            textAnchor="middle"
            fontSize={11}
            fill={AXIS_LABEL_COLOR}
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
          >
            {t.label}
          </text>
        </g>
      ))}

      {/* Baseline */}
      <line
        x1={PAD_LEFT}
        x2={WIDTH - PAD_RIGHT}
        y1={built.baselineY}
        y2={built.baselineY}
        stroke={AXIS_LABEL_COLOR}
        strokeWidth={1}
      />
    </svg>
  );
}

function formatKw(v: number): string {
  if (Number.isInteger(v)) return `${v} kW`;
  return `${v.toFixed(1)} kW`;
}

function formatTickTime(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}
