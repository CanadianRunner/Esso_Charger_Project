import type { PowerSample } from '../../types/AdminSession';

export interface ChartLayout {
  width: number;
  height: number;
  padLeft: number;
  padRight: number;
  padTop: number;
  padBottom: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface NiceAxis {
  niceMax: number;
  step: number;
  ticks: number[];
}

/**
 * Pick a "nice" axis maximum and tick step for the given raw maximum value,
 * targeting roughly the given tick count. Steps are constrained to {1, 2, 5} *
 * 10^k so the tick labels are readable.
 */
export function niceAxis(rawMax: number, targetCount = 5): NiceAxis {
  if (rawMax <= 0) return { niceMax: 1, step: 0.2, ticks: [0, 0.2, 0.4, 0.6, 0.8, 1] };
  const targetStep = rawMax / targetCount;
  const order = Math.floor(Math.log10(targetStep));
  const base = Math.pow(10, order);
  const normalized = targetStep / base;
  let nice: number;
  if (normalized <= 1) nice = 1;
  else if (normalized <= 2) nice = 2;
  else if (normalized <= 5) nice = 5;
  else nice = 10;
  const step = nice * base;
  const niceMax = Math.ceil(rawMax / step) * step;
  const ticks: number[] = [];
  // round to step's precision to avoid drift from float math
  const precision = Math.max(0, -order);
  for (let v = 0; v <= niceMax + 1e-9; v += step) {
    ticks.push(Number(v.toFixed(precision)));
  }
  return { step, niceMax, ticks };
}

/**
 * Compute the median gap between consecutive samples in seconds. Used to
 * detect chart discontinuities (gap > 3 * median signals a real break, not a
 * normal sampling cadence variation).
 */
export function medianSampleInterval(samples: PowerSample[]): number {
  if (samples.length < 2) return 10;
  const deltas: number[] = [];
  for (let i = 1; i < samples.length; i++) {
    deltas.push(samples[i].unixSecondsUtc - samples[i - 1].unixSecondsUtc);
  }
  deltas.sort((a, b) => a - b);
  return deltas[Math.floor(deltas.length / 2)];
}

/**
 * Split samples into contiguous segments where consecutive samples are within
 * `gapThresholdSeconds` of each other. Gaps wider than the threshold start a
 * new segment so the path renderer can lift the pen and avoid drawing a
 * misleading straight line across a session-merge break or controller
 * downtime.
 */
export function segmentSamples(
  samples: PowerSample[],
  gapThresholdSeconds: number,
): PowerSample[][] {
  if (samples.length === 0) return [];
  const segments: PowerSample[][] = [[samples[0]]];
  for (let i = 1; i < samples.length; i++) {
    const gap = samples[i].unixSecondsUtc - samples[i - 1].unixSecondsUtc;
    if (gap > gapThresholdSeconds) {
      segments.push([samples[i]]);
    } else {
      segments[segments.length - 1].push(samples[i]);
    }
  }
  return segments;
}

/**
 * Convert a single segment's points into a smooth Catmull-Rom path (rendered
 * as cubic Beziers). The returned string is the SVG `d` for the stroke only;
 * the fill path is built separately by closing back to the baseline.
 */
export function catmullRomPath(points: Point[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${p2.x} ${p2.y}`;
  }
  return d;
}

/**
 * Compute the stroke and fill paths for an entire sample set. Returns one
 * concatenated path per role (multiple sub-paths separated by `M` for
 * discontinuities at session-merge or downtime gaps).
 */
export function buildChartPaths(
  segments: Point[][],
  baselineY: number,
): { stroke: string; fill: string } {
  const strokes: string[] = [];
  const fills: string[] = [];
  for (const seg of segments) {
    if (seg.length === 0) continue;
    const stroke = catmullRomPath(seg);
    strokes.push(stroke);
    if (seg.length >= 2) {
      const last = seg[seg.length - 1];
      const first = seg[0];
      fills.push(`${stroke} L ${last.x} ${baselineY} L ${first.x} ${baselineY} Z`);
    }
  }
  return { stroke: strokes.join(' '), fill: fills.join(' ') };
}
