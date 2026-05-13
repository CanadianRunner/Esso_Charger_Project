import { describe, it, expect } from 'vitest';
import {
  buildChartPaths,
  buildClockBoundaryTicks,
  catmullRomPath,
  medianSampleInterval,
  niceAxis,
  pickTimeTickIntervalSeconds,
  segmentSamples,
  snapDownToClockBoundary,
} from './powerChartMath';

describe('niceAxis', () => {
  it('produces a nice max and step for a 7.5 kW peak with breathing room', () => {
    const a = niceAxis(7.5);
    // 7.5 is more than 5% below 8, so 8 is fine.
    expect(a.niceMax).toBe(8);
    expect(a.step).toBe(2);
    expect(a.ticks).toEqual([0, 2, 4, 6, 8]);
  });

  it('uses a 5-unit step for an 11.2 kW peak', () => {
    const a = niceAxis(11.2);
    expect(a.niceMax).toBe(15);
    expect(a.step).toBe(5);
    expect(a.ticks).toEqual([0, 5, 10, 15]);
  });

  it('advances niceMax when data sits exactly on a tick value', () => {
    // rawMax === step boundary would otherwise leave zero headroom — the
    // curve would visually touch the top of the chart.
    const a = niceAxis(10);
    expect(a.niceMax).toBeGreaterThan(10);
    expect(a.niceMax % a.step).toBe(0);
  });

  it('advances niceMax when data sits within 5% of a tick value', () => {
    // 9.95 vs niceMax 10 leaves only 0.05 headroom; should advance to next step.
    const a = niceAxis(9.95);
    expect(a.niceMax).toBeGreaterThanOrEqual(12);
  });

  it('falls back to a 0..1 range when given zero', () => {
    const a = niceAxis(0);
    expect(a.niceMax).toBe(1);
    expect(a.ticks[0]).toBe(0);
    expect(a.ticks[a.ticks.length - 1]).toBe(1);
  });
});

describe('pickTimeTickIntervalSeconds', () => {
  it('picks a 1-minute interval for short spans', () => {
    expect(pickTimeTickIntervalSeconds(5 * 60)).toBe(60); // 5 min span → 5 ticks at 1m
  });

  it('picks a 5-minute interval for ~30 minute spans', () => {
    expect(pickTimeTickIntervalSeconds(30 * 60)).toBe(300); // 30 min span → 6 ticks at 5m
  });

  it('picks a 30-minute interval for ~2 hour spans', () => {
    expect(pickTimeTickIntervalSeconds(2 * 3600)).toBe(1800); // 2 hr span → 4 ticks at 30m
  });

  it('picks an hourly interval for ~6 hour spans', () => {
    expect(pickTimeTickIntervalSeconds(6 * 3600)).toBe(3600); // 6 hr → 6 ticks at 1h
  });

  it('falls back to 1-day intervals for multi-day spans', () => {
    expect(pickTimeTickIntervalSeconds(7 * 86400)).toBe(86400);
  });
});

describe('snapDownToClockBoundary', () => {
  it('snaps to the start of the hour for hourly intervals', () => {
    // 14:37:42 on some day → expect 14:00:00 of that local day.
    const t = new Date(2026, 4, 12, 14, 37, 42).getTime() / 1000;
    const snapped = snapDownToClockBoundary(t, 3600);
    const result = new Date(snapped * 1000);
    expect(result.getHours()).toBe(14);
    expect(result.getMinutes()).toBe(0);
    expect(result.getSeconds()).toBe(0);
  });

  it('snaps to the previous 15-minute mark for 15m intervals', () => {
    const t = new Date(2026, 4, 12, 14, 37, 42).getTime() / 1000;
    const snapped = snapDownToClockBoundary(t, 900);
    const result = new Date(snapped * 1000);
    expect(result.getMinutes()).toBe(30); // 37 → snaps down to 30
    expect(result.getSeconds()).toBe(0);
  });
});

describe('buildClockBoundaryTicks', () => {
  it('emits ticks at clean boundaries starting at or after t0', () => {
    const t0 = new Date(2026, 4, 12, 14, 37, 0).getTime() / 1000;
    const t1 = new Date(2026, 4, 12, 18, 30, 0).getTime() / 1000;
    const ticks = buildClockBoundaryTicks(t0, t1, 3600); // hourly
    // Expect ticks at 15:00, 16:00, 17:00, 18:00 local time.
    expect(ticks.length).toBe(4);
    expect(new Date(ticks[0] * 1000).getHours()).toBe(15);
    expect(new Date(ticks[ticks.length - 1] * 1000).getHours()).toBe(18);
  });

  it('returns no ticks for an empty span if no boundary falls inside', () => {
    const t0 = new Date(2026, 4, 12, 14, 5, 0).getTime() / 1000;
    const t1 = new Date(2026, 4, 12, 14, 12, 0).getTime() / 1000;
    // 14:05 to 14:12, hourly interval → next boundary is 15:00, outside range
    expect(buildClockBoundaryTicks(t0, t1, 3600)).toEqual([]);
  });
});

describe('medianSampleInterval', () => {
  it('returns the median delta between consecutive timestamps', () => {
    const samples = [
      { unixSecondsUtc: 100, kw: 7 },
      { unixSecondsUtc: 110, kw: 7 }, // 10s
      { unixSecondsUtc: 120, kw: 7 }, // 10s
      { unixSecondsUtc: 130, kw: 7 }, // 10s
      { unixSecondsUtc: 200, kw: 7 }, // 70s outlier
    ];
    expect(medianSampleInterval(samples)).toBe(10);
  });

  it('defaults to 10s on too-few samples to avoid div-by-zero downstream', () => {
    expect(medianSampleInterval([])).toBe(10);
    expect(medianSampleInterval([{ unixSecondsUtc: 1, kw: 5 }])).toBe(10);
  });
});

describe('segmentSamples', () => {
  it('keeps consecutive samples within threshold as one segment', () => {
    const samples = [
      { unixSecondsUtc: 100, kw: 7 },
      { unixSecondsUtc: 110, kw: 7 },
      { unixSecondsUtc: 120, kw: 7 },
    ];
    const segs = segmentSamples(samples, 30);
    expect(segs.length).toBe(1);
    expect(segs[0].length).toBe(3);
  });

  it('breaks at gaps wider than the threshold', () => {
    const samples = [
      { unixSecondsUtc: 100, kw: 7 },
      { unixSecondsUtc: 110, kw: 7 },
      // 60s gap > 30s threshold → break
      { unixSecondsUtc: 170, kw: 7 },
      { unixSecondsUtc: 180, kw: 7 },
    ];
    const segs = segmentSamples(samples, 30);
    expect(segs.length).toBe(2);
    expect(segs[0].length).toBe(2);
    expect(segs[1].length).toBe(2);
  });

  it('returns empty for empty input', () => {
    expect(segmentSamples([], 30)).toEqual([]);
  });
});

describe('catmullRomPath', () => {
  it('starts with a move-to on the first point', () => {
    const d = catmullRomPath([
      { x: 10, y: 20 },
      { x: 30, y: 40 },
    ]);
    expect(d.startsWith('M 10 20')).toBe(true);
  });

  it('emits a cubic Bezier segment between each pair', () => {
    const d = catmullRomPath([
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 20, y: 0 },
    ]);
    // Two C segments expected for 3 points (between p0-p1 and p1-p2).
    const cCount = (d.match(/C /g) ?? []).length;
    expect(cCount).toBe(2);
  });

  it('returns empty string for empty input', () => {
    expect(catmullRomPath([])).toBe('');
  });
});

describe('buildChartPaths', () => {
  it('closes each segment to the baseline for the fill', () => {
    const seg = [
      { x: 0, y: 50 },
      { x: 100, y: 30 },
    ];
    const { stroke, fill } = buildChartPaths([seg], 200);
    expect(stroke).toContain('M 0 50');
    expect(fill).toContain('L 100 200');
    expect(fill).toContain('L 0 200');
    expect(fill.endsWith('Z')).toBe(true);
  });

  it('skips fill for single-point segments', () => {
    const { fill } = buildChartPaths([[{ x: 0, y: 50 }]], 200);
    expect(fill).toBe('');
  });
});
